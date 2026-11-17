import { cardClass } from '@/app/components/ui'
import { PHASE_WORDS } from '@/lib/compPhase'
import { clubEventDates } from '@/lib/clubs'
import { formatLine } from '@/lib/clubhouse'
import { matchPlayLine, matchPlayPhase, matchPlayRules } from '@/lib/clubMatchPlay'
import CompShell from './CompShell'
import type { MatchPlayPage } from './read'

/**
 * A club match play's Summary (Ross, 17 Nov 2026; stage 1 of the plan in
 * docs/pending-concepts.md): its name and format, where it stands, then its
 * rules and every round's play-by date, as members read them before they
 * enter (P7). Entering, the draw and the matches come in the next stages.
 */
export default function MatchPlaySummary({ page }: { page: MatchPlayPage }) {
  const { mp } = page
  const phase = matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won }, new Date())
  const rules = matchPlayRules(mp.setup, { allowance: mp.allowance, qualifierName: mp.qualifierName, entryLine: mp.entryLine })
  const pairs = mp.setup.format !== 'singles'
  return (
    <CompShell page={page}>
      <h1 className="t-h1 text-ink mt-6 break-words">{mp.name}</h1>
      <p className="t-cap text-ink/65 mt-1">
        {[formatLine({ scoring: 'stableford', allowance: mp.allowance, matchPlay: { format: mp.setup.format } }),
          mp.endDate ? `Final by ${clubEventDates(mp.endDate, mp.endDate)}` : null].filter(Boolean).join(' · ')}
      </p>

      <section className={`${cardClass('floating')} p-4 mt-6`}>
        <p className="text-[13px] font-semibold text-club-deep">{PHASE_WORDS[phase]}</p>
        <p className="text-ink text-[17px] leading-snug mt-1">{matchPlayLine(mp.setup, phase, { qualifierName: mp.qualifierName })}</p>
        {mp.setup.field === 'entries' && (
          <p className="t-cap text-ink/65 mt-2">
            {mp.entered === 0 ? `Nobody has entered yet.` : `${mp.entered} ${mp.entered === 1 ? 'player has' : 'players have'} entered.`}
            {phase === 'entries' ? ` Entering here opens soon — ask the club in the meantime.` : ''}
          </p>
        )}
      </section>

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
        {pairs && <p className="t-cap text-ink/65 mt-2">You enter with a partner; both of you must be able to enter.</p>}
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
