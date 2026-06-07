import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import type { Person, Attendance, LeaveCarryforward } from '@/lib/supabase'
import { calculateSalary, type SalaryBreakdown } from '@/lib/salary'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function stat(value: number | string, label: string, color?: string) {
  return (
    <div className="text-center p-3 bg-muted rounded-lg">
      <p className={`text-2xl font-bold ${color ?? 'text-foreground'}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

export default function SalaryTab() {
  const now = new Date()
  const [people, setPeople] = useState<Person[]>([])
  const [peopleLoaded, setPeopleLoaded] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1))
  const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()))
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    person: Person
    breakdown: SalaryBreakdown
    attendance: Attendance[]
    year: number
    month: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [carriedIn, setCarriedIn] = useState<number>(0)
  const [prevUnused, setPrevUnused] = useState<number>(0)
  const [carryLoading, setCarryLoading] = useState(false)

  async function ensurePeople() {
    if (peopleLoaded) return
    const { data } = await supabase.from('people').select('*').eq('active', true).order('name')
    setPeople((data || []) as Person[])
    setPeopleLoaded(true)
  }

  async function handleCalculate() {
    if (!selectedPersonId) return
    setLoading(true)
    setError(null)
    setResult(null)
    setCarriedIn(0)
    setPrevUnused(0)

    const person = people.find(p => p.id === selectedPersonId)
    if (!person) { setLoading(false); return }

    const year = Number(selectedYear)
    const month = Number(selectedMonth)
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const { data: attData, error: attErr } = await supabase
      .from('attendance')
      .select('*')
      .eq('person_id', selectedPersonId)
      .gte('attend_date', startDate)
      .lte('attend_date', endDate)
      .order('attend_date')

    if (attErr) {
      setError(`Failed to fetch attendance: ${attErr.message}`)
      setLoading(false)
      return
    }

    // Carry-forward for selected month
    const ym = toYearMonth(year, month)
    const { data: cfData } = await supabase
      .from('leave_carryforward')
      .select('*')
      .eq('person_id', selectedPersonId)
      .eq('year_month', ym)
      .maybeSingle()
    const carried = (cfData as LeaveCarryforward | null)?.carried_days ?? 0
    setCarriedIn(carried)

    // Previous month unused leave
    const prev = prevYearMonth(year, month)
    const prevStart = `${prev.year}-${String(prev.month).padStart(2, '0')}-01`
    const prevEnd = new Date(prev.year, prev.month, 0).toISOString().split('T')[0]
    const { data: prevAttData } = await supabase
      .from('attendance')
      .select('*')
      .eq('person_id', selectedPersonId)
      .gte('attend_date', prevStart)
      .lte('attend_date', prevEnd)
    const { data: prevCfData } = await supabase
      .from('leave_carryforward')
      .select('*')
      .eq('person_id', selectedPersonId)
      .eq('year_month', toYearMonth(prev.year, prev.month))
      .maybeSingle()
    const prevCarried = (prevCfData as LeaveCarryforward | null)?.carried_days ?? 0
    const prevDaysInMonth = new Date(prev.year, prev.month, 0).getDate()
    const prevPresent = (prevAttData || []).length
    const prevAbsent = Math.max(0, prevDaysInMonth - prevPresent)
    const prevEffective = person.monthly_leave_balance + prevCarried
    const prevPaidLeave = Math.min(prevAbsent, prevEffective)
    const unused = Math.max(0, prevEffective - prevPaidLeave)
    setPrevUnused(unused)

    const att = (attData || []) as Attendance[]
    const lateCount = att.filter(a => a.is_late).length
    const breakdown = calculateSalary(
      Number(person.salary_per_month),
      person.monthly_leave_balance,
      year,
      month,
      att.length,
      lateCount,
      carried
    )
    setResult({ person, breakdown, attendance: att, year, month })
    setLoading(false)
  }

  async function handleCarryForward() {
    if (!result) return
    setCarryLoading(true)
    const ym = toYearMonth(result.year, result.month)
    await supabase
      .from('leave_carryforward')
      .upsert({ person_id: result.person.id, year_month: ym, carried_days: prevUnused }, { onConflict: 'person_id,year_month' })
    setCarryLoading(false)
    await handleCalculate()
  }

  async function handleRemoveCarryForward() {
    if (!result) return
    setCarryLoading(true)
    const ym = toYearMonth(result.year, result.month)
    await supabase
      .from('leave_carryforward')
      .delete()
      .eq('person_id', result.person.id)
      .eq('year_month', ym)
    setCarryLoading(false)
    await handleCalculate()
  }

  function prevYearMonth(year: number, month: number): { year: number; month: number } {
    return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  }

  function toYearMonth(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`
  }

  const currentYear = now.getFullYear()
  const years = [currentYear - 2, currentYear - 1, currentYear]

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Salary Calculator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Person</Label>
              <Select
                value={selectedPersonId}
                onValueChange={setSelectedPersonId}
                onOpenChange={open => { if (open) ensurePeople() }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {people.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleCalculate}
            disabled={!selectedPersonId || loading}
          >
            {loading ? 'Calculating…' : 'Calculate Salary'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Breakdown */}
      {result && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {result.person.name} — {MONTH_NAMES[result.month - 1]} {result.year}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stat grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {stat(result.breakdown.present, 'Days Present')}
                {stat(result.breakdown.lateCount, 'Late Check-ins', 'text-amber-600')}
                {stat(result.breakdown.absent, 'Days Absent')}
                {stat(result.breakdown.paidLeave, 'Paid Leave', 'text-green-600')}
                {stat(result.breakdown.unpaidLeave, 'Unpaid Leave', 'text-destructive')}
              </div>

              {/* Line items */}
              <div className="space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Calendar days in month</span>
                  <span>{result.breakdown.workingDays}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Per-day rate</span>
                  <span>₹{result.breakdown.perDay.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Monthly leave allowance</span>
                  <span>{result.person.monthly_leave_balance} days</span>
                </div>
                {result.breakdown.carriedIn > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Carried forward from previous month</span>
                    <span>+{result.breakdown.carriedIn} days</span>
                  </div>
                )}
                {result.breakdown.carriedIn > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Effective leave balance</span>
                    <span>{result.breakdown.effectiveLeave} days</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Gross salary</span>
                  <span>₹{Number(result.person.salary_per_month).toLocaleString('en-IN')}</span>
                </div>
                {result.breakdown.deduction > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>
                      Deduction ({result.breakdown.unpaidLeave} unpaid day{result.breakdown.unpaidLeave !== 1 ? 's' : ''} × ₹{result.breakdown.perDay.toFixed(2)})
                    </span>
                    <span>−₹{result.breakdown.deduction.toFixed(2)}</span>
                  </div>
                )}
                {result.breakdown.lateCount > 0 && (
                  <div className="flex justify-between text-muted-foreground italic">
                    <span>Late check-ins (logged, not deducted)</span>
                    <span>{result.breakdown.lateCount}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base border-t pt-3 mt-1">
                  <span>Final Pay</span>
                  <span>
                    ₹{result.breakdown.finalPay.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Carry-forward controls */}
          <div className="border rounded-lg p-3 space-y-2 text-sm">
            <p className="font-medium">Leave Carry-forward</p>
            {carriedIn > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{carriedIn} day{carriedIn !== 1 ? 's' : ''} carried in from previous month</span>
                <Button size="sm" variant="outline" disabled={carryLoading} onClick={handleRemoveCarryForward}>
                  Remove
                </Button>
              </div>
            ) : prevUnused > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{prevUnused} unused day{prevUnused !== 1 ? 's' : ''} from previous month</span>
                <Button size="sm" disabled={carryLoading} onClick={handleCarryForward}>
                  {carryLoading ? 'Saving…' : `Carry forward ${prevUnused} day${prevUnused !== 1 ? 's' : ''}`}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">No unused leave from previous month.</p>
            )}
          </div>

          {/* Attendance log */}
          {result.attendance.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Attendance Log ({result.attendance.length} days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {result.attendance.map(a => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-2 border-b last:border-0 text-sm"
                    >
                      <span>
                        {new Date(a.attend_date + 'T00:00:00').toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {new Date(a.check_in_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {a.is_late && (
                          <Badge variant="secondary" className="text-xs">Late</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No attendance recorded for {result.person.name} in {MONTH_NAMES[result.month - 1]} {result.year}.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
