import Link from 'next/link'
import { PageTitle, cardClass } from '@/app/components/ui'
import { PHASE_WORDS, type CompSection } from '@/lib/compPhase'
import { irishToday } from '@/lib/clubs'
import { compHome } from '@/lib/clubBar'
import { matchPlayPhase, roundInPlayLine } from '@/lib/clubMatchPlay'
import { eventReader } from '@/lib/eventReader'
import { readClubDraw } from '@/app/api/club/matchPlayDraw'
import { IconChevronLeft } from '@/app/components/icons'
import CompShell from './CompShell'
import MyMatch, { type ClubMatchRow } from './MyMatch'
import DrawView from './DrawView'
import { MatchPlayMark } from '../../ClubBarContext'
import type { MatchPlayPage } from './read'
import EnsureMember from '@/app/components/EnsureMember'
import { TripBaseProvider } from '@/app/golf/[root]/[tripCode]/TripBase'
import { BracketContent, readBracketPage } from '@/app/golf/[root]/[tripCode]/matchplay/bracketPage'

/**
 * A club match play's three sections (stage 3; Ross, 17 Nov 2026), in the
 * slots a stroke competition's Tee times, Scoring and Leaderboard hold:
 * **Field** — who has entered; **Matches** — your match, then every round's
 * matches with their play-by dates and results; **Bracket** — the event's
 * own bracket (D336, Ross, 25 Nov 2026: "use the one from events"), in the
 * Leaderboard's place, read and drawn by `bracketPage.tsx` exactly as an
 * event's bracket tab is — swiping a round at a time, a match's card over it,
 * scoring straight in for whoever may. A match opens its own page
 * (`/club/<slug>/comp/<code>/match/<id>`, D284) — arranging, contacts, the
 * card and a walkover — as a stroke competition's card opens its own.
 */
export default async function MatchPlaySection({ page, section }: { page: MatchPlayPage; section: CompSection }) {
  const { mp, slug, code } = page
  const phase = matchPlayPhase(mp.setup, { drawn: mp.drawn, won: mp.won, fielded: mp.entered > 0 }, new Date())
  const today = irishToday(new Date())
  // D284: a match, its card and the bracket open inside the club.
  const base = compHome(slug, code)
  const pairsMode = mp.setup.format !== 'singles'
  const db = eventReader(code)
  const [draw, field, pairRows, bracket] = await Promise.all([
    mp.drawn && section !== 'board' ? readClubDraw(code) : Promise.resolve(null),
    section === 'tee'
      ? db.from('players').select('id, name').eq('is_composite', false).order('created_at').then(r => (r.data ?? []) as { id: string; name: string }[])
      : Promise.resolve([] as { id: string; name: string }[]),
    // Stage 4: a Fourball or Foursomes field is its pairs, each a team on the draw's sheet.
    section === 'tee' && pairsMode
      ? Promise.all([
          db.from('teams').select('id').eq('team_set', 'set-2').order('created_at').order('id'),
          db.from('team_members').select('team_id, player_id').eq('team_set', 'set-2'),
        ]).then(([t, m]) => ({ teams: (t.data ?? []) as { id: string }[], members: (m.data ?? []) as { team_id: string; player_id: string }[] }))
      : Promise.resolve(null),
    // D336: the Bracket tab is the event's own bracket, its links inside the club.
    section === 'board' ? readBracketPage(code, base) : Promise.resolve(null),
  ])
  const nameById = new Map(field.map(p => [p.id, p.name]))
  const pairs = pairRows ? pairRows.teams.map(t => pairRows.members.filter(m => m.team_id === t.id).map(m => nameById.get(m.player_id)).filter((n): n is string => !!n)).filter(p => p.length > 0) : null
  const names = draw?.view.names ?? {}
  const nameOf = (id: string | null, bye: boolean) => (bye ? 'Bye' : id ? names[id] ?? 'A player' : 'To be decided')
  const rows: ClubMatchRow[] = (draw?.rounds ?? []).flatMap(r => r.matches.map(m => ({
    id: m.id, roundNumber: r.roundNumber, roundName: r.roundName, deadline: r.deadline,
    sideA: m.sideA, sideB: m.sideB, aName: nameOf(m.sideA, m.aIsBye), bName: nameOf(m.sideB, m.bIsBye),
    winner: m.winner, result: m.result,
  })))
  const inPlay = draw?.rounds.find(r => r.played < r.total) ?? null
  const title = section === 'tee' ? 'Field' : section === 'scoring' ? 'Matches' : 'Bracket'

  return (
    <CompShell page={page}>
      <MatchPlayMark code={code} />
      <PageTitle back={{ href: compHome(slug, code), label: 'Summary' }} className="mt-5"
        sub={<>{mp.name} · {PHASE_WORDS[phase]}{draw ? ` · ${roundInPlayLine(draw.rounds, today)}` : ''}</>}>{title}</PageTitle>
      {section === 'board' && bracket && (
        // D336: the event's bracket, read and drawn as an event's bracket tab draws it;
        // its writes (a result recorded, a card opened to score) entered as the event's own.
        <TripBaseProvider base={base}>
          <EnsureMember tripCode={code.toUpperCase()} />
          <div className="mt-6">
            <BracketContent page={bracket} empty="club" />
          </div>
        </TripBaseProvider>
      )}

      {section === 'tee' && pairs && (
        pairs.length === 0
          ? <p className="text-ink/80 text-[15px] mt-6">Nobody has entered yet.</p>
          : (
            <>
              <p className="t-label text-ink mt-6">{pairs.length}{mp.setup.maxField ? ` of ${mp.setup.maxField}` : ''} {pairs.length === 1 ? 'pair' : 'pairs'} entered</p>
              <ol className={`${cardClass()} mt-2 divide-y divide-line`}>
                {pairs.map((p, i) => (
                  <li key={i} className="px-4 py-3 text-[15px] text-ink">
                    <span className="t-data">{p.join(' & ')}</span>
                    {p.length < 2 && <span className="t-cap text-ink/65"> · looking for a partner</span>}
                  </li>
                ))}
              </ol>
            </>
          )
      )}
      {section === 'tee' && !pairs && (
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

      {section === 'scoring' && !draw && (
        <p className="text-ink/80 text-[15px] leading-relaxed mt-6">The matches appear here once the draw is made.</p>
      )}

      {section === 'scoring' && draw && <MyMatch code={code} matches={rows} matchHref={`${base}/match`} />}
      {section === 'scoring' && draw && (
        <DrawView rows={rows} matchHref={`${base}/match`} today={today}
          rounds={draw.rounds.map(r => ({ roundNumber: r.roundNumber, roundName: r.roundName, deadline: r.deadline, played: r.played, total: r.total }))}
          startRound={inPlay?.roundNumber ?? null} />
      )}
    </CompShell>
  )
}
