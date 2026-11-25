'use client'

import { useEffect, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { GROUP_NAME_MAX } from '@/lib/feed'
import { IconCheck } from '../icons'
import Initials from '../Initials'
import { FIELD, FIELD_LABEL, buttonClass } from '../ui'
import { Sheet } from './ItemActions'

type Person = { id: string; name: string; club: string | null }
type Member = Person & { admin: boolean; me: boolean }
type Read = { group: { id: string; name: string }; admin: boolean; members: Member[]; canAdd: Person[] }

/** A person in a list: their initial, their name, their club small under it. */
function Who({ p, children }: { p: Person; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2 min-h-14">
      <Initials name={p.name} size={36} />
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] text-ink truncate">{p.name}</span>
        {p.club && <span className="block t-cap text-ink/65 truncate">{p.club}</span>}
      </span>
      {children}
    </li>
  )
}

/**
 * Making a stream group (D343, Ross, 25 Nov 2026): a name, and which of your
 * friends are in it. You are its first admin.
 */
export function NewGroupSheet({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [name, setName] = useState('')
  const [friends, setFriends] = useState<Person[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void askFeed<{ friends: Person[] }>('friends').then(r => setFriends(r.ok ? r.friends : []))
  }, [])
  const toggle = (id: string) => setChosen(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })
  async function make() {
    setBusy(true); setError('')
    const r = await askFeed<{ id: string }>('group.create', { name, members: [...chosen] })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    onMade(r.id)
  }
  return (
    <Sheet title="New group" onClose={onClose}>
      <label htmlFor="group-name" className={`${FIELD_LABEL} mt-4`}>Name it</label>
      <input id="group-name" type="text" value={name} maxLength={GROUP_NAME_MAX} onChange={e => setName(e.target.value)}
        className={FIELD} autoComplete="off" placeholder="Sunday fourball" />
      <p className={`${FIELD_LABEL} mt-5`}>Add your friends</p>
      {!friends && <div className="skeleton h-14 rounded-tile" aria-busy="true" />}
      {friends && friends.length === 0 && (
        <p className="t-cap text-ink/65">You have no friends on Green Dot yet — find them in Settings, then add them here. You can make the group now and add them later.</p>
      )}
      {friends && friends.length > 0 && (
        <ul className="divide-y divide-line">
          {friends.map(f => (
            <Who key={f.id} p={f}>
              <button type="button" onClick={() => toggle(f.id)} aria-pressed={chosen.has(f.id)} aria-label={`${chosen.has(f.id) ? 'Leave out' : 'Add'} ${f.name}`}
                className={`w-11 h-11 rounded-tile border flex items-center justify-center press ch-focus ${chosen.has(f.id) ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong text-transparent'}`}>
                <IconCheck size={18} />
              </button>
            </Who>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
      <button type="button" disabled={busy || !name.trim()} onClick={() => void make()} className={`${buttonClass('primary')} mt-5`}>
        {busy ? 'Making it…' : chosen.size ? `Make the group with ${chosen.size}` : 'Make the group'}
      </button>
    </Sheet>
  )
}

/**
 * A group's settings (D343, Ross: "Stream settings — allow admins to make
 * other admins"): who is in it, and — for its admins — renaming it, adding
 * their friends, taking people out and making other admins. Anybody may leave.
 */
export function GroupSettingsSheet({ groupId, onClose, onChanged, onLeft }: {
  groupId: string
  onClose: () => void
  /** Its name or members changed — the stream's list asks again. */
  onChanged: () => void
  onLeft: () => void
}) {
  const [read, setRead] = useState<Read | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    void askFeed<Read>('group.read', { groupId }).then(r => {
      if (!live) return
      if (!r.ok) { setError(r.error); return }
      setRead(r); setName(r.group.name)
    })
    return () => { live = false }
  }, [groupId, n])

  async function act(key: string, action: string, body: Record<string, unknown>) {
    setBusy(key); setError('')
    const r = await askFeed(action, { groupId, ...body })
    setBusy(null)
    if (!r.ok) { setError(r.error); return false }
    setN(x => x + 1)
    onChanged()
    return true
  }
  async function leave() {
    setBusy('leave'); setError('')
    const r = await askFeed('group.leave', { groupId })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    onLeft()
  }

  return (
    <Sheet title={read?.group.name ?? 'Group'} onClose={onClose}>
      {!read && !error && <div className="skeleton h-40 rounded-card mt-4" aria-busy="true" />}
      {read?.admin && (
        <div className="mt-4">
          <label htmlFor="group-rename" className={FIELD_LABEL}>Name</label>
          <div className="flex gap-2">
            <input id="group-rename" type="text" value={name} maxLength={GROUP_NAME_MAX} onChange={e => setName(e.target.value)} className={`${FIELD} flex-1 min-w-0`} autoComplete="off" />
            <button type="button" disabled={busy === 'rename' || !name.trim() || name.trim() === read.group.name}
              onClick={() => void act('rename', 'group.rename', { name })} className={buttonClass('secondary', false)}>Save</button>
          </div>
        </div>
      )}
      {read && (
        <>
          <h3 className="t-label text-ink/80 mt-6">{read.members.length} in the group</h3>
          <ul className="divide-y divide-line">
            {read.members.map(m => (
              <Who key={m.id} p={{ ...m, name: m.me ? `${m.name} (you)` : m.name }}>
                {m.admin && <span className="t-cap text-accent-deep font-semibold">Admin</span>}
                {read.admin && !m.me && (
                  <span className="flex items-center gap-1">
                    <button type="button" disabled={!!busy} onClick={() => void act(`a-${m.id}`, 'group.admin', { userId: m.id, on: !m.admin })}
                      className={buttonClass('quiet', false, true)}>{m.admin ? 'Not admin' : 'Make admin'}</button>
                    <button type="button" disabled={!!busy} onClick={() => void act(`r-${m.id}`, 'group.remove', { userId: m.id })}
                      className={`${buttonClass('quiet', false, true)} !text-rust-deep`}>Take out</button>
                  </span>
                )}
              </Who>
            ))}
          </ul>
          {read.admin && (
            <>
              <h3 className="t-label text-ink/80 mt-6">Add your friends</h3>
              {read.canAdd.length === 0
                ? <p className="t-cap text-ink/65 mt-1">Every friend of yours is in it already — find more in Settings.</p>
                : (
                  <ul className="divide-y divide-line">
                    {read.canAdd.map(p => (
                      <Who key={p.id} p={p}>
                        <button type="button" disabled={!!busy} onClick={() => void act(`add-${p.id}`, 'group.add', { userIds: [p.id] })}
                          className={buttonClass('secondary', false, true)}>{busy === `add-${p.id}` ? 'Adding…' : 'Add'}</button>
                      </Who>
                    ))}
                  </ul>
                )}
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
      {read && (confirmLeave ? (
        <div className="mt-6">
          <p className="text-ink/80 text-[15px]">Leave {read.group.name}? You’ll stop seeing it, and only an admin can add you back.</p>
          <div className="flex gap-3 mt-3">
            <button type="button" disabled={busy === 'leave'} onClick={() => void leave()} className={buttonClass('danger', false)}>{busy === 'leave' ? 'Leaving…' : 'Leave the group'}</button>
            <button type="button" onClick={() => setConfirmLeave(false)} className={buttonClass('quiet', false)}>Stay</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmLeave(true)} className={`${buttonClass('quiet', false)} mt-6 !text-rust-deep`}>Leave the group</button>
      ))}
    </Sheet>
  )
}
