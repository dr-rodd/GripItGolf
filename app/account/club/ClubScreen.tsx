'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import BackButton from '@/app/components/BackButton'
import Toggle from '@/app/components/Toggle'
import { FIELD, FIELD_LABEL, ListGroup, Pill, buttonClass } from '@/app/components/ui'
import {
  CLUB_STATUS_WORDS, MAX_LIST_ROWS, clubMembersWord, listRowIssue, cleanRow, mayAdminister, mayChangeRoles,
  parseMemberList, roleWord, type ClubRole,
} from '@/lib/clubs'
import { askClub, type ClubListEntry, type ClubSummary } from '@/lib/accountClient'
import ClubLook from './ClubLook'

type State =
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; club: ClubSummary; list: ClubListEntry[] | null }

/** How many rows are drawn before a search narrows them. */
const SHOWN = 60

const blankRow = { name: '', memberNumber: '', guiNumber: '', email: '' }

/**
 * One club's page. Its owners and admins keep the list here: add one
 * person, paste a whole list (matched by GUI number, then member number,
 * then email — nobody is taken off by being missing), change a row, send its
 * code, take it off the list (the row is kept, the link cut, their account
 * and golf untouched) or put it back. Numbers are only ever shown partly
 * hidden; typing one replaces it. Anybody else on the list sees that they
 * are on it.
 */
export default function ClubScreen({ clubId: given, back }: {
  /** Stage (h): drawn under the club's own address, `/club/[slug]/list`, which knows the club. */
  clubId?: string
  back?: { href: string; label: string }
} = {}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [id, setId] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(blankRow)
  const [paste, setPaste] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string; skipped?: { name: string; why: string }[] } | null>(null)

  const load = useCallback(async (clubId: string) => {
    const r = await askClub('club', { clubId })
    if (!r.ok || !r.club) { setState({ kind: 'failed', error: r.ok ? 'No such club.' : r.error }); return }
    if (!mayAdminister(r.club.role)) { setState({ kind: 'ready', club: r.club, list: null }); return }
    const m = await askClub('members', { clubId })
    setState(m.ok && m.club ? { kind: 'ready', club: m.club, list: m.list ?? [] } : { kind: 'failed', error: m.ok ? 'Could not read the list.' : m.error })
  }, [])

  useEffect(() => {
    const clubId = given ?? new URLSearchParams(window.location.search).get('id') ?? ''
    setId(clubId)
    if (!clubId) { setState({ kind: 'failed', error: 'No club chosen.' }); return }
    void load(clubId)
  }, [load, given])

  // Stage (h): a verified club's list lives in its club area now. The old
  // address, `/account/club?id=`, goes on there; a club still waiting to be
  // verified has no club area and keeps it here.
  useEffect(() => {
    if (given || state.kind !== 'ready' || state.club.status !== 'verified') return
    window.location.replace(state.list ? `/club/${state.club.slug}/list` : `/club/${state.club.slug}`)
  }, [given, state])

  const preview = useMemo(() => (paste.trim() ? parseMemberList(paste) : null), [paste])

  async function act(action: string, body: Record<string, unknown>, done?: string) {
    setBusy(true); setNote(null)
    const r = await askClub(action, { clubId: id, ...body })
    setBusy(false)
    if (!r.ok) { setNote({ tone: 'error', text: r.error }); return false }
    if (r.list && r.club) setState({ kind: 'ready', club: r.club, list: r.list })
    if (action === 'add') {
      const parts = [r.added ? `${r.added} added` : null, r.updated ? `${r.updated} brought up to date` : null].filter(Boolean)
      setNote({ tone: 'ok', text: parts.length ? `${parts.join(', ')}.` : 'Nothing new on that list.', skipped: r.skipped })
    } else if (r.sentTo) setNote({ tone: 'ok', text: `Code sent to ${r.sentTo}.` })
    else if (done) setNote({ tone: 'ok', text: done })
    return true
  }

  async function addOne(e: React.FormEvent) {
    e.preventDefault()
    const row = cleanRow(adding)
    const issue = listRowIssue(row)
    if (issue) { setNote({ tone: 'error', text: issue }); return }
    if (await act('add', { rows: [row] })) setAdding(blankRow)
  }

  async function addPasted() {
    if (!preview || preview.rows.length === 0) return
    if (await act('add', { rows: preview.rows })) { setPaste(''); setPasteOpen(false) }
  }

  if (state.kind !== 'ready') {
    return (
      <Frame back={back}>
        <h1 className="t-h1 text-ink">Your club</h1>
        {state.kind === 'failed' && <p className="t-cap text-rust-deep mt-6" role="alert">{state.error}</p>}
      </Frame>
    )
  }

  const { club, list } = state
  const people = clubMembersWord(club.name)

  if (!list) {
    return (
      <Frame back={back}>
        <h1 className="t-h1 text-ink">{club.name}</h1>
        <p className="text-ink/80 text-[15px] leading-relaxed mt-4">
          You’re on {club.name}’s list.{' '}
          Its events show in My events once the club is verified.
        </p>
      </Frame>
    )
  }

  const q = search.trim().toLowerCase()
  const matches = list.filter(r => !q || r.name.toLowerCase().includes(q) || (r.email ?? '').includes(q))
  const current = list.filter(r => !r.removed).length

  return (
    <Frame back={back}>
      <h1 className="t-h1 text-ink">{club.name}</h1>
      <p className="text-ink/65 text-sm mt-1">
        {CLUB_STATUS_WORDS[club.status]}{club.status === 'pending' ? '. You can build the list meanwhile.' : '.'}
      </p>
      {club.status === 'verified' && !given && (
        <a href={`/club/${club.slug}`} className="t-cap text-accent-deep underline underline-offset-2 mt-2 inline-block">
          See the club’s page
        </a>
      )}

      <ClubLook club={club} onChange={c => setState({ kind: 'ready', club: c, list })} />

      <section className="mt-8">
        <h2 className="t-h2 text-ink">Add to the list</h2>
        <form onSubmit={addOne} className="mt-4 space-y-4">
          <div>
            <label htmlFor="add-name" className={FIELD_LABEL}>Name</label>
            <input id="add-name" type="text" autoComplete="off" value={adding.name}
              onChange={e => setAdding({ ...adding, name: e.target.value })} className={FIELD} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-number" className={FIELD_LABEL}>Member number</label>
              <input id="add-number" type="text" autoComplete="off" value={adding.memberNumber}
                onChange={e => setAdding({ ...adding, memberNumber: e.target.value })} className={FIELD} />
            </div>
            <div>
              <label htmlFor="add-gui" className={FIELD_LABEL}>GUI number</label>
              <input id="add-gui" type="text" inputMode="numeric" autoComplete="off" value={adding.guiNumber}
                onChange={e => setAdding({ ...adding, guiNumber: e.target.value })} className={FIELD} />
            </div>
          </div>
          <div>
            <label htmlFor="add-email" className={FIELD_LABEL}>Email</label>
            <input id="add-email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={adding.email}
              onChange={e => setAdding({ ...adding, email: e.target.value })} className={FIELD} />
            <p className="t-cap text-ink/65 mt-2">Numbers and email are optional. The code to join goes to the email.</p>
          </div>
          <button type="submit" disabled={busy || !adding.name.trim()} className={buttonClass('secondary', false)}>Add</button>
        </form>

        <button type="button" onClick={() => setPasteOpen(o => !o)} className={`${buttonClass('quiet', false)} mt-4`}>
          {pasteOpen ? 'Close' : 'Paste a whole list'}
        </button>
        {pasteOpen && (
          <div className="mt-2">
            <p className="t-cap text-ink/65 leading-snug">
              From a spreadsheet or a file, one person a line: name, member number, GUI number, email — or a first line naming
              the columns. Anyone already on the list is brought up to date by their numbers or email. Nobody is taken off. Up to {MAX_LIST_ROWS} at a time.
            </p>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={8} spellCheck={false}
              aria-label="The list" className={`${FIELD} mt-3 font-mono text-[13px] h-auto`} />
            {preview && (
              <p className="t-cap text-ink/80 mt-2">
                {preview.rows.length} {preview.rows.length === 1 ? 'person' : 'people'} read
                {preview.problems.length ? `, ${preview.problems.length} line${preview.problems.length === 1 ? '' : 's'} to check (${preview.problems.slice(0, 3).map(p => `line ${p.line}: ${p.why}`).join('; ')})` : ''}.
              </p>
            )}
            <button type="button" disabled={busy || !preview || preview.rows.length === 0} onClick={() => void addPasted()}
              className={`${buttonClass('secondary', false)} mt-3`}>
              {busy ? 'Adding…' : `Add ${preview?.rows.length ?? 0}`}
            </button>
          </div>
        )}
      </section>

      {note && (
        <div className="mt-6" role={note.tone === 'error' ? 'alert' : 'status'}>
          <p className={`t-cap ${note.tone === 'error' ? 'text-rust-deep' : 'text-accent-deep'}`}>{note.text}</p>
          {note.skipped && note.skipped.length > 0 && (
            <ul className="t-cap text-ink/80 mt-2 list-disc pl-5 space-y-0.5">
              {note.skipped.slice(0, 20).map((s, i) => <li key={i}>{s.name}: {s.why}</li>)}
              {note.skipped.length > 20 && <li>…and {note.skipped.length - 20} more.</li>}
            </ul>
          )}
        </div>
      )}

      <section className="mt-10">
        <h2 className="t-h2 text-ink">{people}</h2>
        <p className="text-ink/65 text-sm mt-1">{current} on the list{list.length > current ? `, ${list.length - current} taken off` : ''}.</p>
        {list.length > 8 && (
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email"
            aria-label="Search the list" className={`${FIELD} mt-4`} />
        )}
        <ListGroup className="mt-4">
          {matches.slice(0, SHOWN).map(r => (
            <div key={r.id}>
              <button type="button" onClick={() => { setOpen(o => (o === r.id ? null : r.id)); setNote(null) }}
                className="flex items-center gap-3 min-h-14 px-4 py-3 text-left w-full press hover:bg-tint" aria-expanded={open === r.id}>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[17px] font-medium leading-snug ${r.removed ? 'text-ink/50 line-through' : 'text-ink'}`}>{r.name}</span>
                  <span className="block t-cap text-ink/65 mt-0.5">
                    {[r.role !== 'member' ? roleWord(r.role, club.name) : null, r.memberNumber ? `No. ${r.memberNumber}` : null,
                      r.guiNumber ? `GUI ${r.guiNumber}` : null, r.removed ? 'Taken off the list' : null].filter(Boolean).join(' · ') || (r.email ?? 'No email')}
                  </span>
                </span>
                {r.linked && <Pill tone="win">Linked</Pill>}
              </button>
              {open === r.id && (
                <RowEditor key={r.id} row={r} club={club} busy={busy}
                  onAct={(action, body, done) => act(action, { memberId: r.id, ...body }, done)} />
              )}
            </div>
          ))}
        </ListGroup>
        {matches.length > SHOWN && (
          <p className="t-cap text-ink/65 mt-3">Showing {SHOWN} of {matches.length}. Search to find the rest.</p>
        )}
      </section>
    </Frame>
  )
}

function Frame({ children, back }: { children: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <main className="min-h-dvh paper flex flex-col">
      <div className="w-full max-w-md mx-auto px-4 pt-2">
        <BackButton href={back?.href ?? '/account/clubs'} label={back?.label ?? 'Clubs'} />
      </div>
      <div className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-10">{children}</div>
    </main>
  )
}

/** One row opened: change it, send its code, take it off or put it back. */
function RowEditor({ row, club, busy, onAct }: {
  row: ClubListEntry
  club: ClubSummary
  busy: boolean
  onAct: (action: string, body: Record<string, unknown>, done?: string) => Promise<boolean>
}) {
  const [name, setName] = useState(row.name)
  const [memberNumber, setMemberNumber] = useState('')
  const [guiNumber, setGuiNumber] = useState('')
  const [email, setEmail] = useState(row.email ?? '')
  const [role, setRole] = useState<ClubRole>(row.role)
  const [confirmRemove, setConfirmRemove] = useState(false)

  function save() {
    const body: Record<string, unknown> = {}
    if (name.trim() !== row.name) body.name = name
    if (memberNumber.trim()) body.memberNumber = memberNumber
    if (guiNumber.trim()) body.guiNumber = guiNumber
    if (email.trim().toLowerCase() !== (row.email ?? '')) body.email = email
    if (role !== row.role) body.role = role
    void onAct('update', body, 'Saved.').then(ok => { if (ok) { setMemberNumber(''); setGuiNumber('') } })
  }

  return (
    <div className="px-4 pb-5 pt-1 space-y-4 bg-tint">
      <div>
        <label htmlFor={`row-name-${row.id}`} className={FIELD_LABEL}>Name</label>
        <input id={`row-name-${row.id}`} type="text" value={name} onChange={e => setName(e.target.value)} className={FIELD} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`row-number-${row.id}`} className={FIELD_LABEL}>Member number</label>
          <input id={`row-number-${row.id}`} type="text" autoComplete="off" value={memberNumber} placeholder={row.memberNumber ?? ''}
            onChange={e => setMemberNumber(e.target.value)} className={FIELD} />
        </div>
        <div>
          <label htmlFor={`row-gui-${row.id}`} className={FIELD_LABEL}>GUI number</label>
          <input id={`row-gui-${row.id}`} type="text" inputMode="numeric" autoComplete="off" value={guiNumber} placeholder={row.guiNumber ?? ''}
            onChange={e => setGuiNumber(e.target.value)} className={FIELD} />
        </div>
      </div>
      <p className="t-cap text-ink/65 -mt-2">Numbers are shown partly hidden. Type one to replace it.</p>
      <div>
        <label htmlFor={`row-email-${row.id}`} className={FIELD_LABEL}>Email</label>
        <input id={`row-email-${row.id}`} type="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} className={FIELD} />
      </div>
      {mayChangeRoles(club.role) && (
        <div>
          <label htmlFor={`row-role-${row.id}`} className={FIELD_LABEL}>Role</label>
          <select id={`row-role-${row.id}`} value={role} onChange={e => setRole(e.target.value as ClubRole)} className={FIELD}>
            {(['member', 'admin', 'owner'] as ClubRole[]).map(r => <option key={r} value={r}>{roleWord(r, club.name)}</option>)}
          </select>
          <p className="t-cap text-ink/65 mt-2">Owners and admins keep this list and run the club’s events.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={save} className={buttonClass('secondary', false)}>Save</button>
        {!row.linked && !row.removed && row.email && (
          <button type="button" disabled={busy} onClick={() => void onAct('invite', {})} className={buttonClass('quiet', false)}>
            Email their code
          </button>
        )}
      </div>
      {row.linked && <p className="t-cap text-ink/65">Linked to their own Green Dot account.</p>}

      {row.removed ? (
        <>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="t-label text-ink">Still on the club’s leaderboards</p>
              <p className="t-cap text-ink/65 leading-snug">Their scores stay where they are either way.</p>
            </div>
            <Toggle checked={row.onBoards} disabled={busy} label="Still on the club’s leaderboards"
              onChange={v => void onAct('update', { onBoards: v }, 'Saved.')} />
          </div>
          <button type="button" disabled={busy} onClick={() => void onAct('restore', {}, 'Back on the list. Email their code to link their account again.')}
            className={buttonClass('quiet', false)}>
            Put back on the list
          </button>
        </>
      ) : confirmRemove ? (
        <div className="space-y-2">
          <p className="t-cap text-ink/80 leading-snug">
            {row.name} comes off {club.name}’s list and anything the club gave them ends now. Their own account and their golf are untouched.
          </p>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => void onAct('remove', {}, 'Taken off the list.')} className={buttonClass('danger', false)}>
              Take off the list
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)} className={buttonClass('quiet', false)}>Keep</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmRemove(true)} className={buttonClass('quiet', false)}>Take off the list</button>
      )}
    </div>
  )
}
