'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Asks for a club match play's draw once it is due (stage 5): from a
 * qualifier, the moment its results are certified — the field made from its
 * top finishers, then the draw, both once on the server (`makeDueDraw`).
 * Draws nothing; the page refreshes when something was made.
 */
export default function DrawDueAsk({ code }: { code: string }) {
  const router = useRouter()
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    void fetch('/api/match/draw-due', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tripCode: code }) })
      .then(r => r.json()).then((b: { made?: boolean }) => { if (b?.made) router.refresh() }).catch(() => undefined)
  }, [code, router])
  return null
}
