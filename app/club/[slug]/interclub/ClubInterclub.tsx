'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ListGroup, ListRow, PageTitle, SectionHeader, buttonClass, cardClass } from '@/app/components/ui'
import { describeShortDate } from '@/lib/itinerary'
import { CLUB_MEMBER_ATTR } from '@/lib/clubHomeCopy'
import { askInterclub } from '@/lib/interclubClient'
import DrawNameField from '@/app/interclub/DrawNameField'
import { useClubBar } from '../ClubBarContext'

type Tie = {
  code: string; competitionName: string; nameA: string; nameB: string; date: string | null
  line: string; state: string; side: 'a' | 'b'
}
type Got = { ready: boolean; captain: boolean; clubId: string; ties: Tie[] }

/**
 * The club's interclub page (D357): its ties on Green Dot — for a member each
 * opens the match itself, to watch or score; for a team captain (D358) the
 * tie's own page, to fill the side and settle it — then a captain's card
 * (how the draws spell the club, the way to set a match up) and every draw
 * in the country.
 */
export default function ClubInterclub({ slug, club }: { slug: string; club: string }) {
  const [got, setGot] = useState<Got | null>(null)
  const [lost, setLost] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // Comps' own page — the footer lights Comps (D291).
  const { setTab } = useClubBar()
  useEffect(() => { setTab('comps') }, [setTab])
  useEffect(() => {
    let live = true
    void askInterclub({ action: 'club', slug }).then(r => {
      if (!live) return
      if (!r.ok) { setLost(r.error); return }
      document.documentElement.setAttribute(CLUB_MEMBER_ATTR, '')
      setLost(null)
      setGot({ ready: r.ready !== false, captain: r.captain === true, clubId: String(r.clubId), ties: (r.ties as Tie[]) ?? [] })
    })
    return () => { live = false }
  }, [slug, attempt])

  const live = got?.ties.filter(t => t.state !== 'won' && t.state !== 'settled') ?? []
  const done = got?.ties.filter(t => t.state === 'won' || t.state === 'settled') ?? []
  const row = (t: Tie) => (
    <ListRow
      key={t.code}
      label={t.side === 'a' ? `${t.nameA} v ${t.nameB}` : `${t.nameB} v ${t.nameA}`}
      hint={[t.competitionName, t.date ? describeShortDate(t.date) : null, t.line].filter(Boolean).join(' · ')}
      href={got?.captain ? `/interclub/tie/${t.code}` : `/${t.code}`}
    />
  )

  return (
    <section>
      <PageTitle back={{ href: `/club/${slug}?tab=comps`, label: 'Comps' }} className="mt-5"
        sub={<>{club}’s inter-club matches — anybody with a match’s link can score it.</>}>Interclub</PageTitle>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">{lost}</p>
          <button type="button" onClick={() => setAttempt(a => a + 1)} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      {!got && !lost && <div className="skeleton h-48 rounded-card mt-6" />}

      {got && (
        <>
          {!got.ready && <p className="t-cap text-ink/65 mt-4">Interclub isn’t set up yet — try again later.</p>}
          {live.length > 0 && (
            <section className="mt-6">
              <SectionHeader hint={got.captain ? 'Open one to fill your side or settle it.' : 'Open one to watch it or score it.'}>Matches</SectionHeader>
              <ListGroup className="mt-3">{live.map(row)}</ListGroup>
            </section>
          )}
          {done.length > 0 && (
            <section className="mt-6">
              <SectionHeader>Results</SectionHeader>
              <ListGroup className="mt-3">{done.map(row)}</ListGroup>
            </section>
          )}
          {got.ready && got.ties.length === 0 && (
            <p className="text-ink/65 text-[15px] mt-6">
              No inter-club matches on Green Dot yet.{got.captain ? ' Set one up from its draw.' : ' A team captain sets them up from the draws.'}
            </p>
          )}

          {got.captain && (
            <div className={`${cardClass()} p-4 mt-6`}>
              <p className="t-card text-ink">You’re a team captain</p>
              <p className="t-cap text-ink/65 mt-1">Find your club’s match on its draw and set it up — the day, where, and who plays.</p>
              <Link href="/interclub" className={`${buttonClass('primary', false)} mt-3`}>Find a match on the draws</Link>
              <div className="mt-5 border-t border-line pt-4">
                <DrawNameField clubId={got.clubId} compact />
              </div>
            </div>
          )}
        </>
      )}

      <ListGroup className="mt-6">
        <ListRow label="Every inter-club draw" hint="Province by province, as it stands." href="/interclub" />
      </ListGroup>
    </section>
  )
}
