"use client"

import { useEffect, useRef, useState } from "react"

// iPad / iPhone Safari only allows printing from a direct tap, so a page that
// opens with ?print=1 can't start printing by itself there. On those devices
// we show a big "Print" bar instead (one tap); on computers we still open the
// print dialog automatically.
function isAppleTouch(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) // iPadOS reports as a Mac
}

export function PrintOnArrival({ ready, label = "Bill of sale ready" }: { ready: boolean; label?: string }) {
  const [prompt, setPrompt] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    if (!ready || done.current) return
    if (new URLSearchParams(window.location.search).get("print") !== "1") return
    done.current = true
    window.history.replaceState(null, "", window.location.pathname) // a refresh won't reprint
    if (isAppleTouch()) setPrompt(true)
    else setTimeout(() => window.print(), 300)
  }, [ready])

  if (!prompt) return null
  return (
    <div className="print:hidden fixed inset-x-0 bottom-0 z-[900] bg-amber-600 text-white shadow-2xl">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
        <span className="flex-1 font-medium">{label} — tap Print to send it to the printer.</span>
        <button type="button" onClick={() => setPrompt(false)}
          className="px-3 py-2 text-sm text-amber-100 hover:text-white">Later</button>
        <button type="button" onClick={() => { setPrompt(false); window.print() }}
          className="px-6 py-3 bg-white text-amber-700 rounded-lg text-base font-bold shadow">🖨 Print</button>
      </div>
    </div>
  )
}
