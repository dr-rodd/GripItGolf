'use client'

import { useEffect, useState } from 'react'
import { askClub } from '@/lib/accountClient'
import { withDefaults, type ClubLabel } from '@/lib/clubLabels'

/**
 * The club's labels (D288), asked once a section opens — every type's
 * default first, then the club's own. `ready` is false before migration 101
 * (only the built-in defaults, nothing to keep).
 */
export function useLabels(clubId: string): { labels: ClubLabel[]; ready: boolean; setLabels: (l: ClubLabel[]) => void } {
  const [labels, setLabels] = useState<ClubLabel[]>(() => withDefaults([]))
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    void askClub('labels', { clubId }).then(r => {
      if (!live || !r.ok) return
      setLabels(r.labels ?? withDefaults([]))
      setReady(!!r.labelsReady)
    })
    return () => { live = false }
  }, [clubId])
  return { labels, ready, setLabels }
}
