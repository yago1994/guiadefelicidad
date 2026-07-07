import { useRef, useState } from 'react'
import { MAX_MEDIA_BYTES } from '../../lib/github'
import type { MediaItem } from '../../lib/types'

interface Props {
  busy: boolean
  onUpload: (blob: Blob, filename: string, type: MediaItem['type']) => Promise<void>
}

function typeFromFile(f: File): MediaItem['type'] | null {
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('audio/')) return 'audio'
  if (f.type.startsWith('image/')) return 'image'
  return null
}

function pickAudioMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export default function MediaUploader({ busy, onUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (f: File) => {
    setError(null)
    const type = typeFromFile(f)
    if (!type) {
      setError('Unsupported file type — use a video, audio, or image file.')
      return
    }
    if (f.size > MAX_MEDIA_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the max is 25 MB. Trim or compress it first.`)
      return
    }
    try {
      await onUpload(f, f.name, type)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickAudioMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blobType = rec.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: blobType })
        const ext = blobType.includes('mp4') ? 'm4a' : 'webm'
        setRecording(false)
        try {
          await onUpload(blob, `voice-note.${ext}`, 'audio')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Upload failed.')
        }
      }
      rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch {
      setError('Microphone unavailable — check browser permissions.')
    }
  }

  const stopRecording = () => recorderRef.current?.stop()

  return (
    <div className="field">
      <label>Add media</label>
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <div className="actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn" disabled={busy || recording} onClick={() => fileRef.current?.click()}>
          📹 Upload file
        </button>
        {!recording ? (
          <button type="button" className="btn" disabled={busy} onClick={startRecording}>
            🎙️ Record voice note
          </button>
        ) : (
          <button type="button" className="btn danger" onClick={stopRecording}>
            ⏹ Stop &amp; save
          </button>
        )}
      </div>
      {recording && (
        <div className="recorder">
          <span className="rec-dot" /> Recording… tap <em>Stop &amp; save</em> when done.
        </div>
      )}
      {busy && <p className="hint">Uploading… this commits the file to GitHub, give it a few seconds.</p>}
      {error && <p className="error-text">{error}</p>}
      <p className="hint">Videos & audio up to 25 MB. Media appears on the live site after the next deploy (~2 min).</p>
    </div>
  )
}
