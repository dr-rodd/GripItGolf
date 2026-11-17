'use client'

import { useEffect, useRef, useState } from 'react'
import Toggle from '@/app/components/Toggle'
import HandicapField from '@/app/components/HandicapField'
import { IconX } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, buttonClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { CREDENTIAL_WORDS, clubMay, credentialLine, type Asker, type CredentialKey } from '@/lib/clubMay'
import { STANDING_WORDS, standingOf, type GridRow } from '@/lib/clubhouse'
import { indexLabel, readIndex } from '@/lib/handicapIndex'
import { listRowIssue, cleanRow } from '@/lib/clubs'

export const GRANT_FOR: Record<CredentialKey, 'grant_plays_here' | 'grant_officer' | 'grant_clubhouse' | 'grant_owner'> = {
  playsHere: 'grant_plays_here', officer: 'grant_officer', clubhouse: 'grant_clubhouse', owner: 'grant_owner',
}

/** A typed index as the server will store it (a plus index negative), or what was there. */
export function indexValue(typed: string, was: number | null): number | null {
  const r = readIndex(typed.trim())
  return r.ok ? r.value : was
}

/** Why a tick cannot be changed by this account on this row — or null. */
export function tickWhy(asker: Asker, row: Pick<GridRow, 'credentials'>, key: CredentialKey): string | null {
  if (!clubMay(GRANT_FOR[key], asker)) return key === 'clubhouse' || key === 'owner' ? 'Only an owner or Green Dot gives this.' : 'Only someone with Clubhouse gives this.'
  if (row.credentials.owner && (key === 'officer' || key === 'clubhouse')) return 'An owner always holds this.'
  return null
}

/**
 * One person, opened from the right (400 wide; the whole screen on a
 * phone): their details, their ticks, their code, and taking them off the
 * list or putting them back. `row` null is a new person. Everything saves
 * through /api/club and the grid takes the answer.
 */
export default function RowPanel({ clubId, clubName, asker, row, onClose, onSaved }: {
  clubId: string
  clubName: string
  asker: Asker
  row: GridRow | null
  onClose: () => void
  /** The row as it now stands (null when a new one was added: the grid reads again). */
  onSaved: (next: GridRow | null, note: string) => void
}) {
  const [name, setName] = useState(row?.name ?? '')
  const [email, setEmail] = useState(row?.email ?? '')
  const [memberNumber, setMemberNumber] = useState(row?.memberNumber ?? '')
  const [guiNumber, setGuiNumber] = useState(row?.guiNumber ?? '')
  const shownIndex = row?.handicapIndex === null || row?.handicapIndex === undefined ? '' : indexLabel(row.handicapIndex)
  const [index, setIndex] = useState(shownIndex)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmOff, setConfirmOff] = useState(false)
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setError('')
    if (!row) {
      const r0 = cleanRow({ name, email, memberNumber, guiNumber })
      const why = listRowIssue(r0)
      if (why) { setError(why); return }
      setBusy(true)
      const r = await askClub('add', { clubId, rows: [r0], slim: true })
      setBusy(false)
      if (!r.ok) { setError(r.error); return }
      if (r.skipped?.length) { setError(`${r.skipped[0].name}: ${r.skipped[0].why}`); return }
      onSaved(null, r.added ? `${r0.name} added.` : `${r0.name} was on the list already — brought up to date.`)
      return
    }
    const body: Record<string, unknown> = {}
    if (name.trim() !== row.name) body.name = name
    if (email.trim().toLowerCase() !== (row.email ?? '')) body.email = email
    if (memberNumber.trim() !== (row.memberNumber ?? '')) body.memberNumber = memberNumber
    if (guiNumber.trim() !== (row.guiNumber ?? '')) body.guiNumber = guiNumber
    if (index.trim() !== shownIndex) body.handicapIndex = index.trim()
    if (Object.keys(body).length === 0) { onClose(); return }
    setBusy(true)
    const r = await askClub('update', { clubId, memberId: row.id, whole: true, slim: true, ...body })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    const after = cleanRow({ name, email, memberNumber, guiNumber })
    onSaved({
      ...row, name: after.name, email: after.email, memberNumber: after.memberNumber, guiNumber: after.guiNumber,
      handicapIndex: body.handicapIndex === undefined ? row.handicapIndex : indexValue(index, row.handicapIndex),
    }, 'Saved.')
  }

  async function act(action: 'remove' | 'restore' | 'invite', note: string) {
    if (!row) return
    setBusy(true); setError('')
    const r = await askClub(action, { clubId, memberId: row.id, slim: true })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    if (action === 'remove') onSaved({ ...row, removed: true, linked: false }, note)
    else if (action === 'restore') onSaved({ ...row, removed: false }, note)
    else onSaved({ ...row, invitedAt: new Date().toISOString() }, r.sentTo ? `Code sent to ${r.sentTo}.` : note)
  }

  async function tick(key: CredentialKey, value: boolean) {
    if (!row) return
    setBusy(true); setError('')
    const r = await askClub('update', { clubId, memberId: row.id, [key]: value, slim: true })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    const c = { ...row.credentials, [key]: value }
    onSaved({ ...row, credentials: c.owner ? { ...c, officer: true, clubhouse: true } : c }, 'Saved.')
  }

  async function onBoards(v: boolean) {
    if (!row) return
    setBusy(true)
    const r = await askClub('update', { clubId, memberId: row.id, onBoards: v, slim: true })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onSaved({ ...row, onBoards: v }, 'Saved.')
  }

  const id = row?.id ?? 'new'
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={`panel-${id}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="ch-panel relative w-full md:w-[400px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 id={`panel-${id}`} className="t-h2 text-ink break-words">{row ? row.name : 'Add a person'}</h2>
            {row && (
              <p className="t-cap text-ink/65 mt-1">
                {STANDING_WORDS[standingOf(row)]} · {credentialLine(row.credentials, clubName)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink flex-shrink-0">
            <IconX size={22} />
          </button>
        </div>

        <div className="space-y-4 mt-6">
          <div>
            <label htmlFor={`p-name-${id}`} className={FIELD_LABEL}>Name</label>
            <input ref={first} id={`p-name-${id}`} value={name} onChange={e => setName(e.target.value)} className={`${FIELD} ch-focus`} />
          </div>
          <div>
            <label htmlFor={`p-email-${id}`} className={FIELD_LABEL}>Email</label>
            <input id={`p-email-${id}`} type="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} className={`${FIELD} ch-focus`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`p-no-${id}`} className={FIELD_LABEL}>Member number</label>
              <input id={`p-no-${id}`} value={memberNumber} onChange={e => setMemberNumber(e.target.value)} className={`${FIELD} ch-focus`} />
            </div>
            <div>
              <label htmlFor={`p-gui-${id}`} className={FIELD_LABEL}>GUI number</label>
              <input id={`p-gui-${id}`} inputMode="numeric" value={guiNumber} onChange={e => setGuiNumber(e.target.value)} className={`${FIELD} ch-focus`} />
            </div>
          </div>
          {row && (
            <div>
              <label htmlFor={`p-index-${id}`} className={FIELD_LABEL}>Handicap index</label>
              <HandicapField id={`p-index-${id}`} value={index} onChange={setIndex} placeholder="Not set" className={FIELD} />
              <p className="t-cap text-ink/65 mt-2">
                {row.linked ? 'Their Green Dot account’s, the one value everywhere. A change is kept on record.' : 'Kept here until they link their account.'}
              </p>
            </div>
          )}
          <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className={`${buttonClass('secondary', false)} ch-focus`}>
            {row ? 'Save' : 'Add to the list'}
          </button>
          {error && <p role="alert" className="t-cap text-rust-deep">{error}</p>}
        </div>

        {row && (
          <>
            <div className="space-y-3 mt-8">
              <h3 className="t-card text-ink">Credentials</h3>
              {CREDENTIAL_WORDS.filter(w => w.key !== 'owner' || row.credentials.owner || clubMay('grant_owner', asker)).map(w => {
                const why = tickWhy(asker, row, w.key)
                return (
                  <div key={w.key} className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="t-label text-ink">{w.label}</p>
                      <p className="t-cap text-ink/65 leading-snug">{why ?? w.line}</p>
                    </div>
                    <Toggle checked={row.credentials[w.key]} disabled={busy || !!why} label={w.label} onChange={v => void tick(w.key, v)} />
                  </div>
                )
              })}
            </div>

            <div className="space-y-3 mt-8">
              <h3 className="t-card text-ink">Their account</h3>
              {row.linked ? (
                <p className="text-ink/80 text-[15px]">Linked to their own Green Dot account.</p>
              ) : row.removed ? null : row.email ? (
                <button type="button" disabled={busy} onClick={() => void act('invite', 'Code sent.')} className={`${buttonClass('quiet', false)} ch-focus`}>
                  {row.invitedAt ? 'Email their code again' : 'Email their code'}
                </button>
              ) : (
                <p className="text-ink/65 text-[15px]">Add their email to send them a code.</p>
              )}
            </div>

            <div className="space-y-3 mt-8">
              {row.removed ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="t-label text-ink">Still on the club’s leaderboards</p>
                      <p className="t-cap text-ink/65 leading-snug">Their scores stay where they are either way.</p>
                    </div>
                    <Toggle checked={row.onBoards} disabled={busy} label="Still on the club’s leaderboards" onChange={v => void onBoards(v)} />
                  </div>
                  <button type="button" disabled={busy} onClick={() => void act('restore', 'Back on the list.')} className={`${buttonClass('quiet', false)} ch-focus`}>
                    Put back on the list
                  </button>
                </>
              ) : confirmOff ? (
                <>
                  <p className="t-cap text-ink/80 leading-snug">
                    {row.name} comes off {clubName}’s list and anything the club gave them ends now. Their own account and their golf are untouched.
                  </p>
                  <div className="flex gap-3">
                    <button type="button" disabled={busy} onClick={() => void act('remove', 'Taken off the list.')} className={`${buttonClass('danger', false)} ch-focus`}>Take off the list</button>
                    <button type="button" onClick={() => setConfirmOff(false)} className={`${buttonClass('quiet', false)} ch-focus`}>Keep</button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmOff(true)} className={`${buttonClass('quiet', false)} ch-focus`}>Take off the list</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
