import Link from 'next/link'
import { cardClass } from '@/app/components/ui'
import { PHASE_WORDS, type CompSection } from '@/lib/compPhase'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { tripBase } from '@/lib/tripPaths'
import { compHome } from '@/lib/clubBar'
import { matchPlayPhase, roundInPlayLine } from '@/lib/clubMatchPlay'
import { eventReader } from '@/lib/eventReader'
import { readClubDraw } from '@/app/api/club/matchPlayStore'
import { IconChevronLeft } from '@/app/components/icons'
import CompShell from './CompShell'
import MyMatch, { type ClubMatchRow } from './MyMatch'
import { MatchPlayMark } from '../../ClubBarContext'
import type { MatchPlayPage } from './read'

/**
 * A club match play's three sections (stage 3; Ross, 17 Nov 2026), in the
 * slots a stroke competition's Tee times, Scoring and Leaderboard hold:
 * **Field** — who has entered; **Matches** — your match, then the round in
 * play's matches; **Draw** — every round with its play-by date and results.
 * A match opens its own page (`/golf/event/<code>/match/<id>`) — arranging,
 * contacts, the card and a walkover — as a stroke competition's card opens
 * its own; "See the full bracket" opens the event's bracket.
 */
export default async function MatchPlaySection({ page, section }: { page: MatchPlayPage; section: CompSection }) {
  const { mp, slug, code } = page
  const phase = matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won }, new Date())
  const today = irishToday(new Date())
  const base = tripBase(code, 'tournament')
  const [draw, field] = await Promise.all([
    mp.drawn ? readClubDraw(code) : Promise.resolve(null),
    section === 'tee'
      ? eventReader(code).from('players').select('id, name').eq('is_composite', false).order('created_at').then(r => (r.data ?? []) as { id: string; name: string }[])
      : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const names = draw?.view.names ?? {}
  const nameOf = (id: string | null, bye: boolean) => (bye ? 'Bye' : id ? names[id] ?? 'A player' : 'To be decided')
  const rows: ClubMatchRow[] = (draw?.rounds ?? []).flatMap(r => r.matches.map(m => ({
    id: m.id, roundNumber: r.roundNumber, roundName: r.roundName, deadline: r.deadline,
    sideA: m.sideA, sideB: m.sideB, aName: nameOf(m.sideA, m.aIsBye), bName: nameOf(m.sideB, m.bIsBye),
    winner: m.winner, result: m.result,
  })))
  const inPlay = draw?.rounds.find(r => r.played < r.total) ?? null
  const title = section === 'tee' ? 'Field' : section === 'scoring' ? 'Matches' : 'Draw'

  return (
    <CompShell page={page}>
      <MatchPlayMark code={code} />
      <Link href={compHome(slug, code)} className="t-cap text-ink/65 inline-flex items-center gap-1 mt-5 press">
        <IconChevronLeft size={16} /> Summary
      </Link>
      <h1 className="t-h1 text-ink mt-2 break-words">{title}</h1>
      <p className="t-cap text-ink/65 mt-1">{mp.name} · {PHASE_WORDS[phase]}{draw ? ` · ${roundInPlayLine(draw.rounds, today)}` : ''}</p>

      {section === 'tee' && (
        field.length === 0
          ? <p className="text-ink/80 text-[15px] mt-6">Nobody has entered yet.</p>
          : (
            <>
              <p className="t-label text-ink mt-6">{field.length}{mp.setup.maxField ? ` of ${mp.setup.maxField}` : ''} entered</p>
              <ol className={`${cardClass()} mt-2 divide-y divide-line`}>
                {field.map(p => <li key={p.id} className="px-4 py-3 t-data text-[15px] text-ink">{p.name}</li>)}
              </ol>
            </>
          )
      )}

      {section !== 'tee' && !draw && (
        <p className="text-ink/80 text-[15px] leading-relaxed mt-6">The matches appear here once the draw is made.</p>
      )}

      {section === 'scoring' && draw && (
        <>
          <MyMatch code={code} matches={rows} matchHref={`${base}/match`} />
          {inPlay && (
            <section className="mt-6">
              <h2 className="t-h2 text-ink">{inPlay.roundName}</h2>
              {inPlay.deadline && <p className="t-cap text-ink/65 mt-1">Play by {clubEventDates(inPlay.deadline, inPlay.deadline)} · {inPlay.played} of {inPlay.total} played</p>}
              <MatchRows rows={rows.filter(m => m.roundNumber === inPlay.roundNumber)} href={`${base}/match`} />
            </section>
          )}
        </>
      )}

      {section === 'board' && draw && (
        <>
          {draw.rounds.map(r => (
            <section key={r.roundNumber} className="mt-6">
              <h2 className="t-h2 text-ink">{r.roundName}</h2>
              <p className="t-cap text-ink/65 mt-1">
                {[r.deadline ? `${r.deadline < today && r.played < r.total ? 'Was due' : 'Play by'} ${clubEventDates(r.deadline, r.deadline)}` : null, `${r.played} of ${r.total} played`].filter(Boolean).join(' · ')}
              </p>
              <MatchRows rows={rows.filter(m => m.roundNumber === r.roundNumber)} href={`${base}/match`} />
            </section>
          ))}
          <Link href={`${base}/matchplay`} className="t-label text-club-deep inline-flex mt-6 press">See the full bracket</Link>
        </>
      )}
    </CompShell>
  )
}

/** A round's matches, one row each — the winner's name in bold with the margin; a match with both sides known opens its page. */
function MatchRows({ rows, href }: { rows: ClubMatchRow[]; href: string }) {
  if (!rows.length) return null
  return (
    <ul className={`${cardClass()} mt-3 divide-y divide-line`}>
      {rows.map(m => {
        const body = (
          <span className="flex items-baseline gap-2 px-4 py-3">
            <span className="flex-1 min-w-0 text-[15px] text-ink">
              <span className={`t-data ${m.winner && m.winner === m.sideA ? 'font-semibold' : ''}`}>{m.aName}</span>
              <span className="text-ink/65"> v </span>
              <span className={`t-data ${m.winner && m.winner === m.sideB ? 'font-semibold' : ''}`}>{m.bName}</span>
            </span>
            {m.result && <span className="t-cap text-ink/80 whitespace-nowrap">{m.result}</span>}
          </span>
        )
        return (
          <li key={m.id}>
            {m.sideA && m.sideB ? <Link href={`${href}/${m.id}`} className="block press">{body}</Link> : body}
          </li>
        )
      })}
    </ul>
  )
}
