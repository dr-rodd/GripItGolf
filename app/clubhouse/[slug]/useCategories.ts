'use client'

import { useEffect, useState } from 'react'
import { askClub } from '@/lib/accountClient'
import type { Category } from '@/lib/clubMembership'

export type CountedCategory = Category & { count: number }

/**
 * The club's memberships and the day its ages count on (stage (m)), asked
 * once a section opens — Memberships, the Members grid and its paste read
 * the same answer. Before migration 094 the list is empty and the day is
 * 1 January.
 */
export function useCategories(clubId: string): {
  categories: CountedCategory[] | null
  ageDate: string
  lost: boolean
  again: () => void
  set: (c: CountedCategory[]) => void
  setAgeDate: (d: string) => void
} {
  const [categories, setCategories] = useState<CountedCategory[] | null>(null)
  const [ageDate, setAgeDate] = useState('01-01')
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    void askClub('categories', { clubId }).then(r => {
      if (!live) return
      if (r.ok) { setCategories(r.categories ?? []); setAgeDate(r.ageDate ?? '01-01'); setLost(false) } else setLost(true)
    })
    return () => { live = false }
  }, [clubId, attempt])
  return { categories, ageDate, lost, again: () => setAttempt(a => a + 1), set: setCategories, setAgeDate }
}
