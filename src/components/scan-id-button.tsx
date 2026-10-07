"use client"

import { useRef, useState } from "react"

export interface ScannedId {
  name: string | null
  address: string | null
  idNumber: string | null
  issuingState: string | null
  dateOfBirth: string | null
  expirationDate: string | null
  expired: boolean
}

// Shrink the photo before upload: phone photos are several MB, and a 1600px
// JPEG is plenty to read an ID while staying well under upload limits.
async function toSmallJpeg(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("Couldn't open that photo"))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// "Scan ID" button: opens the camera on a phone/tablet (file picker on a
// computer), reads the ID with AI and hands the fields back. The photo is not saved.
export function ScanIdButton({ onScanned }: { onScanned: (id: ScannedId) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError("")
    setBusy(true)
    try {
      const image = await toSmallJpeg(file)
      const res = await fetch("/api/id-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't read the ID")
      onScanned(data as ScannedId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the ID")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = "" // allow re-scanning the same photo
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => handleFile(e.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        className="px-3 py-1.5 rounded text-sm font-medium border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50">
        {busy ? "Reading ID…" : "📷 Scan ID"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
