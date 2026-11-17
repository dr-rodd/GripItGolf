'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { askClub, type ClubAnswer } from '@/lib/accountClient'
import { clubhouseHref, type ListCounts, type Need } from '@/lib/clubhouse'
import { PHASE_WORDS, type CompPhase } from '@/lib/compPhase'
import { IconChevronRight } from '@/app/components/icons'
import { buttonClass, cardClass } from '@/app/components/ui'
import { useShell } from './ShellContext'

const PHASES: CompPhase[] = ['announced', 'booking', 'in_play', 'awaiting', 'certified']

/**
 * The Overview (stage (k1)): the list by standing and by credential, the
 * season's competitions by phase, and "Needs you" — each figure a way into
 * the section that holds it. Read on the server, counts only, no rows.
 */
export default function Overview() {
  const { face, club } = useShell()
  const [data, setData] = useState<Pick<ClubAnswer, 'counts' | 'byPhase' | 'needs'> | null>(null)
  const [lost, setLost] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void askClub('overview', { clubId: club.id }).then(r => {
      if (!live) return
      if (r.ok) { setData(r); setLost(false) } else setLost(true)
    })
    return () => { live = false }
  }, [club.id, attempt])

  const members = (filter: string) => `${clubhouseHref(face.slug, 'members')}?filter=${filter}`
  const c: ListCounts | undefined = data?.counts
  return (
    <>
      <h1 className="t-h1 text-ink">Overview</h1>
      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={() => setAttempt(a => a + 1)} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}
      <div className="grid gap-4 mt-6 lg:grid-cols-3">
        <section className={`${cardClass()} p-5`} aria-labelledby="ov-list">
          <h2 id="ov-list" className="t-card text-ink">The list</h2>
          {!c ? <Skeleton /> : (
            <ul className="mt-3">
              <Figure href={members('all')} label="On the list" value={c.onList} />
              <Figure href={members('joined')} label="Joined" value={c.joined} />
              {c.invited !== null && <Figure href={members('invited')} label="Invited" value={c.invited} />}
              <Figure href={members('not_invited')} label={c.invited === null ? 'Not joined' : 'Not invited'} value={c.invited === null ? c.notJoined : Math.max(0, c.notJoined - c.invited)} />
              <Figure href={members('off')} label="Taken off" value={c.off} />
              <li aria-hidden="true" className="h-px bg-line my-2" />
              <Figure href={members('plays')} label="Plays here" value={c.playsHere} />
              <Figure href={members('officer')} label="Officers" value={c.officer} />
              <Figure href={members('clubhouse')} label="Clubhouse" value={c.clubhouse} />
              {c.byCategory && Object.keys(c.byCategory).length > 0 && (
                <>
                  <li aria-hidden="true" className="h-px bg-line my-2" />
                  {Object.entries(c.byCategory).map(([name, n]) => <Figure key={name} href={clubhouseHref(face.slug, 'memberships')} label={name} value={n} />)}
                  {!!c.noCategory && <Figure href={`${clubhouseHref(face.slug, 'members')}?category=none`} label="No membership" value={c.noCategory} />}
                </>
              )}
            </ul>
          )}
        </section>
        <section className={`${cardClass()} p-5`} aria-labelledby="ov-comps">
          <h2 id="ov-comps" className="t-card text-ink">Competitions this season</h2>
          {!data ? <Skeleton /> : (
            <ul className="mt-3">
              {PHASES.map(p => <Figure key={p} href={clubhouseHref(face.slug, 'competitions')} label={PHASE_WORDS[p]} value={data.byPhase?.[p] ?? 0} />)}
            </ul>
          )}
        </section>
        <section className={`${cardClass()} p-5`} aria-labelledby="ov-needs">
          <h2 id="ov-needs" className="t-card text-ink">Needs you</h2>
          {!data ? <Skeleton /> : (data.needs ?? []).length === 0 ? (
            <p className="text-ink/65 text-[15px] mt-3">Nothing needs you.</p>
          ) : (
            <ul className="mt-2">
              {(data.needs ?? []).map((n: Need) => (
                <li key={n.key}>
                  <Link href={n.href} className="ch-hover ch-focus flex items-center gap-3 min-h-12 px-2 -mx-2 rounded-tile">
                    <span className="flex-1 text-ink text-[15px] leading-snug">{n.line}</span>
                    <IconChevronRight size={18} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function Figure({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <li>
      <Link href={href} className="ch-hover ch-focus flex items-center justify-between min-h-10 px-2 -mx-2 rounded-tile">
        <span className="text-ink/80 text-[15px]">{label}</span>
        <span className="text-ink text-[15px] font-semibold tabular-nums">{value}</span>
      </Link>
    </li>
  )
}

function Skeleton() {
  return <div className="mt-3 space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-8 rounded-tile" />)}</div>
}
