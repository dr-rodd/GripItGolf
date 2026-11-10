'use client'

import { useState } from 'react'
import { MAX_PASSCODE } from '@/lib/passcode'
import { EVENT_CODE, NO_FIELD_SEED, tidyCode, type FieldSeed, type SeedBoard, type SeedPlayer } from '@/lib/fieldSeed'
import Toggle from '@/app/components/Toggle'
import { IconCheck } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, buttonClass, cardClass } from '@/app/components/ui'

/**
 * "Seed the field from another event" on a match play event's field step
 * (Ross, 4 Nov 2026; lib/fieldSeed.ts has the rules). Off to start with
 * and easy to pass by. On, it asks for the other event's code, and its
 * public PIN where it has one, as its door would; once they check out the
 * Enter button becomes a tick and that event's players join the list below.
 * Then, optionally, its organiser PIN — and everything its players shared
 * with it comes across too when this event is made.
 */
type Found = { tripId: string; code: string; name: string; publicLocked: boolean; adminLocked: boolean }

type SeedAnswer =
  | { needsPublicPin: true; name: string }
  | { tripId: string; code: string; name: string; adminLocked: boolean; players: SeedPlayer[]; adminOk?: boolean }
  | { error: string }

/**
 * Ask the server about the other event (app/api/event/seed): it reads that
 * event on its own key and checks its PINs, so this phone never needs to be
 * able to read it — or to hold either PIN's hash.
 */
async function askSeed(body: { code: string; publicPin?: string; adminPin?: string }): Promise<SeedAnswer> {
  try {
    const res = await fetch('/api/event/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const out = await res.json().catch(() => null) as SeedAnswer | null
    return out ?? { error: 'Could not check that event — try again.' }
  } catch {
    return { error: 'Could not check that event — try again.' }
  }
}

export default function SeedFromEvent({ value, onChange, onSeed, onUnseed }: {
  value: FieldSeed
  onChange: (next: FieldSeed) => void
  /** The other event's players, to join the list. */
  onSeed: (players: SeedPlayer[]) => void
  /** Take the players brought in back out. */
  onUnseed: () => void
}) {
  const [code, setCode] = useState(value.source?.code ?? '')
  // Back on this step after moving on: what was found is the form's to keep.
  const [found, setFound] = useState<Found | null>(() => value.source
    ? { tripId: value.source.tripId, code: value.source.code, name: value.source.name, adminLocked: value.source.adminLocked, publicLocked: false }
    : null)
  const [publicPin, setPublicPin] = useState('')
  const [adminPin, setAdminPin] = useState(value.adminPin ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adminError, setAdminError] = useState<string | null>(null)

  const seeded = !!value.source
  const asksPublic = !!found?.publicLocked && !seeded

  function reset() {
    if (seeded) onUnseed()
    onChange({ ...NO_FIELD_SEED, on: true })
    setFound(null)
    setPublicPin('')
    setAdminPin('')
    setError(null)
    setAdminError(null)
  }

  async function bringIn(f: Found, players: SeedPlayer[]) {
    if (players.length === 0) { setError(`${f.name} has no players to bring in yet.`); return }
    // Its leaderboards' finishing orders too, while its public PIN is to
    // hand — the draw step offers them as seeds. Never in the way: none
    // read means none offered.
    let boards: SeedBoard[] = []
    try {
      const res = await fetch('/api/event/standings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: f.code, pin: publicPin }),
      })
      const out = await res.json().catch(() => null) as { boards?: SeedBoard[] } | null
      if (res.ok && Array.isArray(out?.boards)) boards = out.boards
    } catch { /* no seeds offered */ }
    onSeed(players)
    onChange({ on: true, source: { code: f.code, name: f.name, tripId: f.tripId, adminLocked: f.adminLocked, boards }, adminPin: null })
  }

  async function findEvent() {
    const c = tidyCode(code)
    if (!EVENT_CODE.test(c)) { setError('An event code is six letters and numbers.'); return }
    setBusy(true)
    setError(null)
    try {
      const out = await askSeed({ code: c })
      if ('error' in out) { setError(out.error); return }
      if ('needsPublicPin' in out) {
        setFound({ tripId: '', code: c, name: out.name, publicLocked: true, adminLocked: false })
        return
      }
      const f: Found = { tripId: out.tripId, code: out.code, name: out.name, publicLocked: false, adminLocked: out.adminLocked }
      setFound(f)
      await bringIn(f, out.players)
    } finally {
      setBusy(false)
    }
  }

  async function checkPublic() {
    if (!found?.publicLocked) return
    setBusy(true)
    setError(null)
    try {
      const out = await askSeed({ code: found.code, publicPin })
      if ('error' in out) { setError(out.error); return }
      if ('needsPublicPin' in out) { setError('That PIN is not right — try again.'); return }
      const f: Found = { tripId: out.tripId, code: out.code, name: out.name, publicLocked: true, adminLocked: out.adminLocked }
      setFound(f)
      await bringIn(f, out.players)
    } finally {
      setBusy(false)
    }
  }

  async function checkAdmin() {
    if (!found?.adminLocked || !value.source) return
    setAdminError(null)
    const out = await askSeed({ code: found.code, publicPin: publicPin || undefined, adminPin })
    if ('error' in out) { setAdminError(out.error); return }
    if (!('adminOk' in out) || !out.adminOk) { setAdminError('That PIN is not right — try again.'); return }
    onChange({ ...value, adminPin })
  }

  return (
    <div className={`p-4 ${cardClass()}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">Seed the field from another event</p>
          <p className="text-ink/65 text-[13px] mt-0.5 leading-snug">
            Bring in the players from an event you have run before — last year&apos;s, or a qualifier.
          </p>
        </div>
        <Toggle
          checked={value.on}
          onChange={on => {
            if (on) { onChange({ ...NO_FIELD_SEED, on: true }); return }
            if (seeded) onUnseed()
            onChange(NO_FIELD_SEED)
            setFound(null)
            setError(null)
          }}
          label="Seed the field from another event"
        />
      </div>

      {value.on && (
        <div className="mt-4 space-y-4">
          <div>
            <label className={FIELD_LABEL} htmlFor="seed-code">That event&apos;s code</label>
            <EnterRow
              done={seeded}
              busy={busy && !asksPublic}
              disabled={!EVENT_CODE.test(tidyCode(code))}
              onEnter={findEvent}
              label="Find the event"
            >
              <input
                id="seed-code"
                type="text"
                value={code}
                onChange={e => { if (found || seeded) reset(); setCode(tidyCode(e.target.value)) }}
                onKeyDown={e => { if (e.key === 'Enter' && !seeded) { e.preventDefault(); void findEvent() } }}
                placeholder="e.g. QX7K2P"
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                className={`${FIELD} field-code min-w-0 flex-1`}
              />
            </EnterRow>
          </div>

          {asksPublic && (
            <div>
              <label className={FIELD_LABEL} htmlFor="seed-public">Its public PIN</label>
              <p className="text-ink/65 text-[13px] -mt-1 mb-2 leading-snug">
                {found?.name} is behind a public PIN — enter it to bring its players in.
              </p>
              <EnterRow done={false} busy={busy} disabled={!publicPin} onEnter={checkPublic} label="Check the public PIN">
                <input
                  id="seed-public"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={publicPin}
                  onChange={e => setPublicPin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void checkPublic() } }}
                  maxLength={MAX_PASSCODE}
                  enterKeyHint="go"
                  className={`${FIELD} min-w-0 flex-1`}
                />
              </EnterRow>
            </div>
          )}

          {error && <p className="text-rust-deep text-[13px] leading-snug">{error}</p>}

          {seeded && (
            <p className="text-ink/80 text-[13px] leading-snug">
              The players from {value.source!.name} are in the list below — add to them, or take anybody out.
            </p>
          )}

          {seeded && found?.adminLocked && (
            <div className="pt-4 border-t border-line">
              <label className={FIELD_LABEL} htmlFor="seed-admin">Bring across everything (optional)</label>
              <p className="text-ink/65 text-[13px] -mt-1 mb-2 leading-snug">
                With {value.source!.name}&apos;s organiser PIN, its players&apos; contact details,
                nicknames, colours and home clubs, and its notices, come across too — for running
                the same event again.
              </p>
              <EnterRow
                done={!!value.adminPin}
                busy={false}
                disabled={!adminPin}
                onEnter={checkAdmin}
                label="Check the organiser PIN"
              >
                <input
                  id="seed-admin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={adminPin}
                  onChange={e => {
                    setAdminPin(e.target.value.replace(/\D/g, ''))
                    setAdminError(null)
                    if (value.adminPin) onChange({ ...value, adminPin: null })
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void checkAdmin() } }}
                  maxLength={MAX_PASSCODE}
                  enterKeyHint="go"
                  className={`${FIELD} min-w-0 flex-1`}
                />
              </EnterRow>
              {adminError && <p className="text-rust-deep text-[13px] mt-2 leading-snug">{adminError}</p>}
              {value.adminPin && (
                <p className="text-ink/80 text-[13px] mt-2 leading-snug">
                  Everything comes across when you create the event.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A box and its Enter button, which turns into a tick once what was typed checks out. */
function EnterRow({ done, busy, disabled, onEnter, label, children }: {
  done: boolean
  busy: boolean
  disabled: boolean
  onEnter: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2">
      {children}
      {done ? (
        <span
          className={`${buttonClass('secondary', false, true)} w-[4.5rem] flex-shrink-0 text-accent-deep`}
          role="img"
          aria-label="Checked"
        >
          <IconCheck size={20} />
        </span>
      ) : (
        <button
          type="button"
          onClick={onEnter}
          disabled={disabled || busy}
          aria-label={label}
          className={`${buttonClass('secondary', false, true)} w-[4.5rem] flex-shrink-0`}
        >
          {busy ? '…' : 'Enter'}
        </button>
      )}
    </div>
  )
}

/**
 * Everything brought across, once the new event and its players exist —
 * when the field was seeded with the other event's organiser PIN given.
 * Returns a line to show if any of it could not come, else null. The event
 * is made either way; this never stands in its way.
 */
export async function bringAcross(
  seed: FieldSeed, toCode: string, toPin: string, pairs: { from: string; to: string }[],
): Promise<string | null> {
  if (!seed.source || !seed.adminPin) return null
  try {
    const res = await fetch('/api/event/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: seed.source.code, fromPin: seed.adminPin, to: toCode, toPin, players: pairs }),
    })
    const out = await res.json().catch(() => null) as { ok?: boolean; missed?: string[] } | null
    if (res.ok && out?.ok) return null
    const missed = out?.missed?.length ? out.missed.join(', ') : 'its details'
    return `The event is made, but ${missed} from ${seed.source.name} could not be brought across.`
  } catch {
    return `The event is made, but the details from ${seed.source.name} could not be brought across.`
  }
}
