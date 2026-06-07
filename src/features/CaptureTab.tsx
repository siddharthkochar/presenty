import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Camera, ClipboardList } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Settings } from '@/lib/supabase'
import LiveCapture from '@/features/LiveCapture'
import ManualAttendance from '@/features/ManualAttendance'

export default function CaptureTab() {
  const [manualEntry, setManualEntry] = useState<boolean | null>(null) // null = still loading

  // Load persisted mode on mount
  useEffect(() => {
    supabase
      .from('settings')
      .select('manual_entry')
      .single()
      .then(({ data }) => {
        const settings = data as Pick<Settings, 'manual_entry'> | null
        setManualEntry(settings?.manual_entry ?? false)
      })
  }, [])

  const handleToggle = async (checked: boolean) => {
    setManualEntry(checked) // optimistic
    await supabase
      .from('settings')
      .update({ manual_entry: checked })
      .eq('id', 1)
  }

  // Don't flash the camera while the setting loads
  if (manualEntry === null) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Mode switch */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {manualEntry
                ? <ClipboardList className="h-4 w-4 text-muted-foreground" />
                : <Camera className="h-4 w-4 text-muted-foreground" />
              }
              <Label htmlFor="manual-entry-switch" className="text-sm font-medium cursor-pointer">
                {manualEntry ? 'Manual entry' : 'Live camera'}
              </Label>
            </div>
            <Switch
              id="manual-entry-switch"
              checked={manualEntry}
              onCheckedChange={handleToggle}
            />
          </div>
          {manualEntry && (
            <p className="text-xs text-muted-foreground mt-2 pl-6">
              Camera off — tap names below to record attendance.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Conditionally mount — unmounting LiveCapture stops the camera stream */}
      {manualEntry ? <ManualAttendance /> : <LiveCapture />}
    </div>
  )
}
