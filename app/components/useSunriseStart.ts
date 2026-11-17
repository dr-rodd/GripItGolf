'use client'

import { useState } from 'react'
import { sunriseFirstTee, type CompBatch, type CompForm } from '@/lib/clubComp'

/**
 * A new competition's first tee time follows the sun (Ross, 17 Nov 2026):
 * the first time on the grid at or after sunrise for the day and course
 * chosen, moving with the day, the course and the minutes between times —
 * until somebody types a first time of their own, which then stands. A
 * preset (`active` false) decides its own. Shared by New competition on the
 * members app and the Clubhouse's panel.
 */
export function useSunriseStart(
  form: CompForm | null,
  sun: { sunrise: string | null } | null,
  active: boolean,
  setForm: (f: (prev: CompForm | null) => CompForm | null) => void,
): (batches: CompBatch[]) => void {
  const [auto, setAuto] = useState(true)
  const first = form?.batches[0]
  const want = active && auto && first ? sunriseFirstTee(sun, first.interval) : null
  if (want && first && first.start !== want) {
    setForm(f => (f ? { ...f, batches: f.batches.map((b, i) => (i === 0 ? { ...b, start: want } : b)) } : f))
  }
  return batches => {
    if (form && batches[0] && batches[0].start !== form.batches[0]?.start) setAuto(false)
    setForm(f => (f ? { ...f, batches } : f))
  }
}
