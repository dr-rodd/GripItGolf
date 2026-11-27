'use client'

import { useEffect, useState } from 'react'
import { ListGroup, ListRow, SectionHeader } from '@/app/components/ui'
import { describeShortDate } from '@/lib/itinerary'
import { askInterclub } from '@/lib/interclubClient'

type MyTie = { code: string; competitionName: string; nameA: string; nameB: string; date: string | null }

/**
 * A team captain's ties (D358), at the head of /interclub: every match their
 * clubs have set up or taken, each opening its own page. Nothing for anybody
 * else — asked after the page paints, with the account.
 */
export default function MyTies() {
  const [ties, setTies] = useState<MyTie[]>([])
  useEffect(() => {
    let live = true
    void askInterclub({ action: 'mine' }).then(r => {
      if (live && r.ok && Array.isArray(r.ties)) setTies(r.ties as MyTie[])
    })
    return () => { live = false }
  }, [])
  if (ties.length === 0) return null
  return (
    <section className="mt-6">
      <SectionHeader hint="The matches your club has on Green Dot.">Your interclub matches</SectionHeader>
      <ListGroup className="mt-3">
        {ties.map(t => (
          <ListRow
            key={t.code}
            label={`${t.nameA} v ${t.nameB}`}
            hint={[t.competitionName, t.date ? describeShortDate(t.date) : null].filter(Boolean).join(' · ')}
            href={`/interclub/tie/${t.code}`}
          />
        ))}
      </ListGroup>
    </section>
  )
}
