import { cardClass } from '@/app/components/ui'
import { PHASE_WORDS } from '@/lib/compPhase'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { formatLine } from '@/lib/clubhouse'
import { LONE_NOT_DRAWN, drawDueNow, matchPlayLine, matchPlayPhase, matchPlayRules, roundInPlayLine } from '@/lib/clubMatchPlay'
import { compHome } from '@/lib/clubBar'
import { readClubDraw } from '@/app/api/club/matchPlayDraw'
import MyMatch, { type ClubMatchRow } from './MyMatch'
import { MatchPlayMark } from '../../ClubBarContext'
import MatchPlayEnter from './MatchPlayEnter'
import DrawDueAsk from './DrawDueAsk'
import CompShell from './CompShell'
import type { MatchPlayPage } from './read'

/**
 * A club match play's Summary (Ross, 17 Nov 2026; stage 1 of the plan in
 * docs/pending-concepts.md): its name and format, where it stands, then its
 * rules and every round's play-by date, as members read them before they
 * enter (P7), and Enter or Withdraw with the field so far (stage 2). The
 * matches inside the club area come in stage 3.
 */
export default async function MatchPlaySummary({ page }: { page: MatchPlayPage }) {
  const { mp } = page
  const phase = matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, new Date())
  // Drawn (stage 3): the round in play, and this phone's own match asked after it paints.
  const draw = mp.drawn ? await readClubDraw(mp.code) : null
  const nameOf = (id: string | null, bye: boolean) => (bye ? 'Bye' : id ? draw?.view.names[id] ?? 'A player' : 'To be decided')
  const rows: ClubMatchRow[] = (draw?.rounds ?? []).flatMap(r => r.matches.map(m => ({
    id: m.id, roundNumber: r.roundNumber, roundName: r.roundName, deadline: r.deadline,
    sideA: m.sideA, sideB: m.sideB, aName: nameOf(m.sideA, m.aIsBye), bName: nameOf(m.sideB, m.bIsBye), winner: m.winner, result: m.result,
  })))
  const rules = matchPlayRules(mp.setup, { allowance: mp.allowance, qualifierName: mp.qualifierName, entryLine: mp.entryLine })
  const pairs = mp.setup.format !== 'singles'
  return (
    <CompShell page={page}>
      <MatchPlayMark code={mp.code} />
      <h1 className="t-h1 text-ink mt-6 break-words">{mp.name}</h1>
      <p className="t-cap text-ink/65 mt-1">
        {[formatLine({ scoring: 'stableford', allowance: mp.allowance, matchPlay: { format: mp.setup.format } }),
          mp.endDate ? `Final by ${clubEventDates(mp.endDate, mp.endDate)}` : null].filter(Boolean).join(' · ')}
      </p>

      <section className={`${cardClass('floating')} p-4 mt-6`}>
        <p className="text-[13px] font-semibold text-club-deep">{PHASE_WORDS[phase]}</p>
        <p className="text-ink text-[17px] leading-snug mt-1">{draw ? roundInPlayLine(draw.rounds, irishToday(new Date())) : matchPlayLine(mp.setup, phase, { qualifierName: mp.qualifierName, qualifierDate: mp.qualifierDate })}</p>
        {mp.setup.field === 'qualifier' && drawDueNow(mp.setup, phase, new Date(), { qualifierCertified: mp.qualifierCertified }) && <DrawDueAsk code={mp.code} />}
        {mp.setup.field === 'entries' && <MatchPlayEnter code={mp.code} drawDue={drawDueNow(mp.setup, phase, new Date())} pairs={pairs} loneNote={LONE_NOT_DRAWN} />}
      </section>

      {draw && <MyMatch code={mp.code} matches={rows} matchHref={`${compHome(page.slug, mp.code)}/match`} />}

      <section className="mt-6">
        <h2 className="t-h2 text-ink">Rules</h2>
        <dl className={`${cardClass()} mt-3 divide-y divide-line`}>
          {rules.lines.map(l => (
            <div key={l.label} className="px-4 py-3">
              <dt className="t-cap text-ink/65">{l.label}</dt>
              <dd className="text-ink text-[15px] mt-0.5">{l.value}</dd>
            </div>
          ))}
        </dl>
        {pairs && <p className="t-cap text-ink/65 mt-2">You enter with a partner from the club’s list — they don’t need to accept, and both of you must be able to enter. Or enter on your own and another member can join you.</p>}
      </section>

      <section className="mt-6">
        <h2 className="t-h2 text-ink">Play-by dates</h2>
        <p className="t-cap text-ink/65 mt-1">Each round’s match is played by this date. {mp.setup.maxField ? 'A smaller field starts at a later round.' : 'The draw uses as many rounds as the field needs.'}</p>
        <ol className={`${cardClass()} mt-3 divide-y divide-line`}>
          {rules.deadlines.map(d => (
            <li key={d.round} className="flex items-baseline gap-3 px-4 py-3">
              <span className="flex-1 text-ink text-[15px]">{d.round}</span>
              <span className="t-data text-[15px] text-ink tabular-nums">{d.date}</span>
            </li>
          ))}
        </ol>
      </section>
    </CompShell>
  )
}
