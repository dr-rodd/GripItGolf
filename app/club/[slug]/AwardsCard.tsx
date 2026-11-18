'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { IconChevronRight } from '@/app/components/icons'
import { cardClass } from '@/app/components/ui'
import { askAwards } from '@/lib/accountClient'

/**
 * Golfer of the Year at the top of Comps → Results (stage 6, P14): each of
 * this year's awards this member may appear in, with their line — "You’re
 * 4th, 12 behind" — opening the award's own page. Asked when Results is
 * opened; nothing while the club runs none.
 */
export default function AwardsCard({ clubId, slug }: { clubId: string; slug: string }) {
  const [mine, setMine] = useState<{ id: string; name: string; line: string | null }[]>([])
  const year = new Date().getFullYear()
  useEffect(() => {
    let live = true
    void askAwards('mine', { clubId }).then(r => { if (live && r.ok) setMine(r.mine ?? []) })
    return () => { live = false }
  }, [clubId])
  if (!mine.length) return null
  return (
    <ul className="mt-5 space-y-2">
      {mine.map(a => (
        <li key={a.id}>
          <Link href={`/club/${slug}/awards/${a.id}?year=${year}`} className={`${cardClass('floating', true)} flex items-center gap-3 p-4`}>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-club-deep">{a.name}</span>
              <span className="block text-ink text-[17px] leading-snug mt-0.5">{a.line ?? 'No points yet'}</span>
            </span>
            <IconChevronRight size={20} className="text-ink/50" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
