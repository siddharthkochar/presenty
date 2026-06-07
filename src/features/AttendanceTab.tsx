import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Attendance, Person } from '@/lib/supabase'

type AttendanceWithName = Attendance & { person_name: string }

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function AttendanceTab() {
  const [records, setRecords] = useState<AttendanceWithName[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>(currentYearMonth())
  const [deleteTarget, setDeleteTarget] = useState<AttendanceWithName | null>(null)

  async function fetchData() {
    setLoading(true)
    const [{ data: peopleData }, { data: attendanceData }] = await Promise.all([
      supabase.from('people').select('*').order('name'),
      supabase.from('attendance').select('*').order('attend_date', { ascending: false }),
    ])
    const peopleList = (peopleData || []) as Person[]
    const nameMap = new Map(peopleList.map(p => [p.id, p.name]))
    const withNames: AttendanceWithName[] = ((attendanceData || []) as Attendance[]).map(a => ({
      ...a,
      person_name: nameMap.get(a.person_id) ?? 'Unknown',
    }))
    setPeople(peopleList)
    setRecords(withNames)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  async function handleDelete(record: AttendanceWithName) {
    await supabase.from('attendance').delete().eq('id', record.id)
    setDeleteTarget(null)
    fetchData()
  }

  const filtered = records.filter(r => {
    const matchPerson = personFilter === 'all' || r.person_id === personFilter
    const matchMonth = r.attend_date.startsWith(monthFilter)
    return matchPerson && matchMonth
  })

  // Build month options: current month + 11 prior months
  function buildMonthOptions() {
    const options: { value: string; label: string }[] = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
      options.push({ value, label })
    }
    return options
  }

  const monthOptions = buildMonthOptions()

  function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-')
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  function formatTime(isoStr: string) {
    return new Date(isoStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All People" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All People</SelectItem>
            {people.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-sm text-muted-foreground ml-auto">
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No attendance records match the selected filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check-in Time</TableHead>
                <TableHead>Late?</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.person_name}</TableCell>
                  <TableCell>{formatDate(r.attend_date)}</TableCell>
                  <TableCell>{formatTime(r.check_in_at)}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_late ? 'destructive' : 'default'}>
                      {r.is_late ? 'Late' : 'On time'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Delete Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Attendance Record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete the attendance record for <strong>{deleteTarget?.person_name}</strong> on{' '}
            <strong>{deleteTarget ? formatDate(deleteTarget.attend_date) : ''}</strong>? This cannot
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
