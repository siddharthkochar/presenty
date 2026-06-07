import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClipboardList, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Person, Attendance } from '@/lib/supabase'

interface MarkedInfo {
  is_late: boolean
  check_in_at: string
}

export default function ManualAttendance() {
  const today = new Date().toISOString().split('T')[0]

  const nowHHMM = () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const [checkInTime, setCheckInTime] = useState(nowHHMM)

  const [selectedDate, setSelectedDate] = useState(today)
  const [people, setPeople] = useState<Person[]>([])
  const [markedMap, setMarkedMap] = useState<Record<string, MarkedInfo>>({})
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null) // person_id being saved

  const fetchAttendance = useCallback(async (date: string) => {
    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('attend_date', date)
    const map: Record<string, MarkedInfo> = {}
    for (const row of (data || []) as Attendance[]) {
      map[row.person_id] = { is_late: row.is_late, check_in_at: row.check_in_at }
    }
    setMarkedMap(map)
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const { data } = await supabase
        .from('people')
        .select('*')
        .eq('active', true)
        .order('name')
      setPeople((data || []) as Person[])
      await fetchAttendance(selectedDate)
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateChange = async (date: string) => {
    setSelectedDate(date)
    await fetchAttendance(date)
  }

  const mark = async (person: Person, forceIsLate?: boolean) => {
    setMarking(person.id)
    const checkInAt = new Date(`${selectedDate}T${checkInTime}:00`)
    const timeStr = `${checkInTime}:00`
    const isLate = forceIsLate ?? (timeStr > person.work_in_end)
    const { error } = await supabase.from('attendance').insert({
      person_id: person.id,
      attend_date: selectedDate,
      check_in_at: checkInAt.toISOString(),
      is_late: isLate,
    })
    if (!error) {
      setMarkedMap(prev => ({
        ...prev,
        [person.id]: { is_late: isLate, check_in_at: checkInAt.toISOString() },
      }))
    }
    setMarking(null)
  }

  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: selectedDate.substring(0, 4) !== today.substring(0, 4) ? 'numeric' : undefined,
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" />
            Manual Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Label htmlFor="attend-date" className="text-sm shrink-0">
              Date
            </Label>
            <Input
              id="attend-date"
              type="date"
              value={selectedDate}
              max={today}
              onChange={e => handleDateChange(e.target.value)}
              className="w-fit"
            />
            <Label htmlFor="check-in-time" className="text-sm shrink-0">
              Check-in
            </Label>
            <Input
              id="check-in-time"
              type="time"
              value={checkInTime}
              onChange={e => setCheckInTime(e.target.value)}
              className="w-fit"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {displayDate}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No active people. Add people in the People tab.
            </p>
          ) : (
            <div className="space-y-0">
              {people.map(person => {
                const info = markedMap[person.id]
                const isBusy = marking === person.id
                return (
                  <div
                    key={person.id}
                    className="flex items-center justify-between py-2.5 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium text-sm">{person.name}</p>
                      {info && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(info.check_in_at).toLocaleTimeString()}
                          {info.is_late && ' · late'}
                        </p>
                      )}
                    </div>

                    {info ? (
                      <Badge variant={info.is_late ? 'destructive' : 'default'}>
                        {info.is_late ? 'Late' : 'Present'}
                      </Badge>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={isBusy}
                          onClick={() => mark(person)}
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => mark(person, true)}
                        >
                          Late
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
