import { useEffect, useRef, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Camera, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Person, Attendance, Settings } from '@/lib/supabase'
import { loadFaceApiModels, getDescriptorFromElement, findBestMatch } from '@/lib/face'

interface PersonStatus {
  person: Person
  marked: boolean
  checkInAt?: string
  isLate?: boolean
}

type CaptureState = 'loading' | 'outside-window' | 'running' | 'all-marked' | 'error' | 'no-people'

export default function LiveCapture() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [state, setState] = useState<CaptureState>('loading')
  const [statusMsg, setStatusMsg] = useState('Initializing...')
  const [personStatuses, setPersonStatuses] = useState<PersonStatus[]>([])
  const [lastCapture, setLastCapture] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const isInWindow = useCallback((s: Settings) => {
    const now = new Date()
    const hhmm = now.toTimeString().substring(0, 8)
    return hhmm >= s.capture_start && hhmm <= s.capture_end
  }, [])

  const captureAndMatch = useCallback(async (
    people: Person[],
    markedIds: Set<string>,
    threshold: number
  ) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    const descriptor = await getDescriptorFromElement(canvas)
    if (!descriptor) return null
    const unmarked = people.filter(
      p => !markedIds.has(p.id) && p.face_descriptor && p.face_descriptor.length > 0
    )
    return findBestMatch(descriptor, unmarked, threshold)
  }, [])

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null

    async function init() {
      setStatusMsg('Loading face recognition models...')
      try {
        await loadFaceApiModels()
      } catch {
        setState('error')
        setStatusMsg('Failed to load face models. Ensure /models folder has the weight files.')
        return
      }
      if (cancelled) return

      const { data: settingsData } = await supabase.from('settings').select('*').single()
      if (!settingsData || cancelled) return
      const settings = settingsData as Settings

      const { data: peopleData } = await supabase
        .from('people')
        .select('*')
        .eq('active', true)

      if (cancelled) return
      if (!peopleData || peopleData.length === 0) {
        setState('no-people')
        setStatusMsg('No active people registered. Add people in the People tab.')
        return
      }
      const people = peopleData as Person[]

      const { data: todayAttendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('attend_date', today)

      if (cancelled) return
      const existingAtt = (todayAttendance || []) as Attendance[]
      const markedIds = new Set<string>(existingAtt.map(a => a.person_id))

      const initialStatuses: PersonStatus[] = people.map(p => {
        const att = existingAtt.find(a => a.person_id === p.id)
        return { person: p, marked: markedIds.has(p.id), checkInAt: att?.check_in_at, isLate: att?.is_late }
      })
      setPersonStatuses(initialStatuses)

      // Start camera
      setStatusMsg('Starting camera...')
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } }
        })
      } catch {
        setState('error')
        setStatusMsg('Camera access denied. Allow camera permission and refresh.')
        return
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {})
        }
      }

      if (cancelled) return

      const markedSet = new Set<string>(markedIds)

      const runCapture = async () => {
        if (!isInWindow(settings)) {
          setState('outside-window')
          setStatusMsg(
            `Outside capture window (${settings.capture_start.substring(0, 5)} – ${settings.capture_end.substring(0, 5)}). Will resume when window opens.`
          )
          return
        }

        const allMarked = people.every(p => markedSet.has(p.id))
        if (allMarked) {
          setState('all-marked')
          setStatusMsg('All people marked for today! System will resume tomorrow.')
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
          return
        }

        setState('running')
        setLastCapture(new Date().toLocaleTimeString())
        const unmarkedCount = people.filter(p => !markedSet.has(p.id)).length
        setStatusMsg(`Scanning... (${unmarkedCount} pending)`)

        try {
          const match = await captureAndMatch(people, markedSet, settings.match_threshold)
          if (match) {
            const person = people.find(p => p.id === match.personId)!
            const now = new Date()
            const nowTime = now.toTimeString().substring(0, 8)
            const isLate = nowTime > person.work_in_time

            const { error: insErr } = await supabase.from('attendance').insert({
              person_id: person.id,
              attend_date: today,
              check_in_at: now.toISOString(),
              is_late: isLate,
            })

            if (!insErr) {
              markedSet.add(person.id)
              setPersonStatuses(prev =>
                prev.map(ps =>
                  ps.person.id === person.id
                    ? { ...ps, marked: true, checkInAt: now.toISOString(), isLate }
                    : ps
                )
              )
              setStatusMsg(`✓ ${person.name} marked at ${now.toLocaleTimeString()}${isLate ? ' (late)' : ''}`)
            } else {
              setStatusMsg(`Match found but DB insert failed: ${insErr.message}`)
            }
          } else {
            setStatusMsg(`No match. Next check in ${settings.capture_interval_sec}s`)
          }
        } catch (err) {
          setStatusMsg(`Detection error: ${String(err)}`)
        }
      }

      await runCapture()
      intervalRef.current = setInterval(runCapture, settings.capture_interval_sec * 1000)
    }

    init()

    return () => {
      cancelled = true
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      stream?.getTracks().forEach(t => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [today, captureAndMatch, isInWindow])

  const stateIcon = () => {
    if (state === 'error') return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
    if (state === 'all-marked') return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
    return <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Live Camera
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative bg-black rounded-lg overflow-hidden max-w-md mx-auto aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
              muted
              playsInline
              autoPlay
            />
            {state === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-sm bg-black/60">
                Initializing…
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex items-start gap-2 text-sm">
            {stateIcon()}
            <span className="text-muted-foreground">{statusMsg}</span>
          </div>
          {lastCapture && (
            <p className="text-xs text-muted-foreground pl-6">Last capture: {lastCapture}</p>
          )}
        </CardContent>
      </Card>

      {personStatuses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Today's Attendance — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {personStatuses.map(ps => (
                <div
                  key={ps.person.id}
                  className="flex items-center justify-between py-2.5 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium text-sm">{ps.person.name}</p>
                    {ps.checkInAt && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(ps.checkInAt).toLocaleTimeString()}
                        {ps.isLate && ' · late'}
                      </p>
                    )}
                  </div>
                  <Badge variant={ps.marked ? 'default' : 'secondary'}>
                    {ps.marked ? 'Present' : 'Pending'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
