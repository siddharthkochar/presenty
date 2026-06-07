import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, Pencil, Trash2, Camera, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Person } from '@/lib/supabase'
import { loadFaceApiModels, getDescriptorFromElement } from '@/lib/face'

interface PersonForm {
  name: string
  work_in_time: string
  work_in_end: string
  salary_per_month: string
  monthly_leave_balance: string
}

const EMPTY_FORM: PersonForm = {
  name: '',
  work_in_time: '09:00',
  work_in_end: '09:30',
  salary_per_month: '',
  monthly_leave_balance: '2',
}

export default function PeopleTab() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null)
  const [activateTarget, setActivateTarget] = useState<Person | null>(null)
  const [hardDeleteTarget, setHardDeleteTarget] = useState<Person | null>(null)
  const [hardDeleting, setHardDeleting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  async function fetchPeople() {
    const { data } = await supabase.from('people').select('*').order('name')
    setPeople((data || []) as Person[])
    setLoading(false)
  }

  useEffect(() => {
    fetchPeople()
    loadFaceApiModels().catch(() => {})
  }, [])

  // Attach stream after video element mounts (cameraOpen controls conditional render)
  useEffect(() => {
    if (cameraOpen && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraOpen])

  // Camera helpers
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      setCameraOpen(true) // render video element first; useEffect attaches stream
    } catch {
      setFormError('Camera access denied')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
  }

  function captureFromCamera() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    const bytes = atob(dataUrl.split(',')[1])
    const ab = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) ab[i] = bytes.charCodeAt(i)
    const file = new File([ab], 'capture.jpg', { type: 'image/jpeg' })
    setPhotoFile(file)
    setPhotoPreview(dataUrl)
    stopCamera()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
  }

  // Dialog open helpers
  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setPhotoFile(null)
    setPhotoPreview(null)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(person: Person) {
    setEditingId(person.id)
    setForm({
      name: person.name,
      work_in_time: person.work_in_time.substring(0, 5),
      work_in_end: person.work_in_end.substring(0, 5),
      salary_per_month: String(person.salary_per_month),
      monthly_leave_balance: String(person.monthly_leave_balance),
    })
    setPhotoFile(null)
    setPhotoPreview(person.photo_url ?? null)
    setFormError(null)
    setDialogOpen(true)
  }

  function closeDialog() {
    stopCamera()
    setDialogOpen(false)
  }

  async function handleSave() {
    setFormError(null)
    if (!form.name.trim()) { setFormError('Name is required'); return }
    const salary = Number(form.salary_per_month)
    if (!form.salary_per_month || isNaN(salary) || salary < 0) {
      setFormError('Enter a valid salary amount')
      return
    }
    if (!form.work_in_end || form.work_in_end < form.work_in_time) {
      setFormError('Work-in end time must be after or equal to start time')
      return
    }

    setSaving(true)
    try {
      let photoUrl: string | undefined
      let descriptor: number[] | undefined

      if (photoFile) {
        // Get face descriptor
        const img = new Image()
        const objectUrl = URL.createObjectURL(photoFile)
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Image load failed'))
          img.src = objectUrl
        })
        const desc = await getDescriptorFromElement(img)
        URL.revokeObjectURL(objectUrl)

        if (!desc) {
          setFormError('No face detected in the photo. Use a clear front-facing image.')
          setSaving(false)
          return
        }
        descriptor = Array.from(desc)

        // Upload to Supabase Storage
        const ext = photoFile.type === 'image/png' ? 'png' : 'jpg'
        const filename = `${Date.now()}-${form.name.trim().replace(/\s+/g, '-').toLowerCase()}.${ext}`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('faces')
          .upload(filename, photoFile, { contentType: photoFile.type, upsert: false })

        if (uploadErr) {
          setFormError(`Photo upload failed: ${uploadErr.message}`)
          setSaving(false)
          return
        }
        const { data: urlData } = supabase.storage.from('faces').getPublicUrl(uploadData.path)
        photoUrl = urlData.publicUrl
      }

      const payload = {
        name: form.name.trim(),
        work_in_time: form.work_in_time + ':00',
        work_in_end: form.work_in_end + ':00',
        salary_per_month: salary,
        monthly_leave_balance: Math.max(0, Number(form.monthly_leave_balance) || 2),
        ...(photoUrl !== undefined ? { photo_url: photoUrl } : {}),
        ...(descriptor !== undefined ? { face_descriptor: descriptor } : {}),
      }

      if (editingId) {
        const { error: e } = await supabase.from('people').update(payload).eq('id', editingId)
        if (e) { setFormError(e.message); setSaving(false); return }
      } else {
        const { error: e } = await supabase.from('people').insert({ ...payload, active: true })
        if (e) { setFormError(e.message); setSaving(false); return }
      }

      await fetchPeople()
      closeDialog()
    } catch (err) {
      setFormError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(person: Person) {
    await supabase.from('people').update({ active: false }).eq('id', person.id)
    setDeleteTarget(null)
    fetchPeople()
  }

  async function handleActivate(person: Person) {
    await supabase.from('people').update({ active: true }).eq('id', person.id)
    setActivateTarget(null)
    fetchPeople()
  }

  async function handleHardDelete(person: Person) {
    setHardDeleting(true)
    try {
      // Remove photo from storage
      if (person.photo_url) {
        const marker = '/faces/'
        const storagePath = person.photo_url.split(marker).pop()
        if (storagePath) {
          await supabase.storage.from('faces').remove([storagePath])
        }
      }
      // Delete person — attendance cascades via FK
      await supabase.from('people').delete().eq('id', person.id)
      setHardDeleteTarget(null)
      fetchPeople()
    } finally {
      setHardDeleting(false)
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {people.filter(p => p.active).length} active · {people.length} total
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Person
        </Button>
      </div>

      {people.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No people yet. Click "Add Person" to register the first employee.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Work-in</TableHead>
                <TableHead>Salary / Month</TableHead>
                <TableHead>Leave Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.work_in_time.substring(0, 5)}–{p.work_in_end.substring(0, 5)}</TableCell>
                  <TableCell>₹{Number(p.salary_per_month).toLocaleString('en-IN')}</TableCell>
                  <TableCell>{p.monthly_leave_balance} days</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? 'default' : 'secondary'}>
                      {p.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      {p.active ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          <span className="sr-only">Deactivate</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setActivateTarget(p)}
                        >
                          <Plus className="h-3.5 w-3.5 text-green-600" />
                          <span className="sr-only">Activate</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setHardDeleteTarget(p)}
                        title="Permanently delete person and all data"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Delete permanently</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Person' : 'Add Person'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ramesh Kumar"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Work-in Time</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="work_in_time"
                  type="time"
                  value={form.work_in_time}
                  onChange={e => setForm(f => ({ ...f, work_in_time: e.target.value }))}
                  className="w-fit"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  id="work_in_end"
                  type="time"
                  value={form.work_in_end}
                  onChange={e => setForm(f => ({ ...f, work_in_end: e.target.value }))}
                  className="w-fit"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="salary">Monthly Salary (₹)</Label>
              <Input
                id="salary"
                type="number"
                min="0"
                value={form.salary_per_month}
                onChange={e => setForm(f => ({ ...f, salary_per_month: e.target.value }))}
                placeholder="e.g. 25000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leave">Monthly Leave Balance (days)</Label>
              <Input
                id="leave"
                type="number"
                min="0"
                value={form.monthly_leave_balance}
                onChange={e => setForm(f => ({ ...f, monthly_leave_balance: e.target.value }))}
                placeholder="2"
              />
            </div>

            {/* Photo section */}
            <div>
              <Label>
                Photo{' '}
                <span className="text-muted-foreground font-normal">
                  {'(optional)'}
                </span>
              </Label>
              <div className="mt-1.5 space-y-2">
                {cameraOpen ? (
                  <div className="space-y-2">
                    <video
                      ref={videoRef}
                      className="w-full rounded-lg aspect-video object-cover bg-black"
                      style={{ transform: 'scaleX(-1)' }}
                      muted
                      playsInline
                      autoPlay
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={captureFromCamera} className="flex-1">
                        Capture Photo
                      </Button>
                      <Button size="sm" variant="outline" onClick={stopCamera}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" type="button" onClick={startCamera}>
                      <Camera className="h-4 w-4" />
                      Use Camera
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      Upload File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onFileChange}
                    />
                  </div>
                )}

                {photoPreview && !cameraOpen && (
                  <div className="relative w-24 h-24">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-24 h-24 rounded-lg object-cover border"
                    />
                    {photoFile && (
                      <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">✓</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update' : 'Add Person'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Person</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deactivate <strong>{deleteTarget?.name}</strong>? They will no longer appear in the
            capture loop. Attendance history is preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDeactivate(deleteTarget)}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Confirm */}
      <Dialog open={!!activateTarget} onOpenChange={open => { if (!open) setActivateTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Activate Person</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Activate <strong>{activateTarget?.name}</strong>? They will appear in the capture loop
            again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateTarget(null)}>Cancel</Button>
            <Button
              onClick={() => activateTarget && handleActivate(activateTarget)}
            >
              Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirm */}
      <Dialog open={!!hardDeleteTarget} onOpenChange={open => { if (!open) setHardDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Person Permanently</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{hardDeleteTarget?.name}</strong> along with all
            their attendance records and photo. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHardDeleteTarget(null)} disabled={hardDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={hardDeleting}
              onClick={() => hardDeleteTarget && handleHardDelete(hardDeleteTarget)}
            >
              {hardDeleting ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
