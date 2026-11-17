'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconCheck, IconChevronLeft, IconChevronRight } from '@/app/components/icons'
import { FIELD, Pill, buttonClass, cardClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { withChange, type CredentialKey } from '@/lib/clubMay'
import {
  LIST_FILTERS, PAGE_SIZE, STANDING_WORDS, lastPage, listFileName, pageLine, readFilter, standingOf,
  type GridRow, type ListFilter, type ListSort, type Standing,
} from '@/lib/clubhouse'
import { cleanRow, irishToday, listRowIssue } from '@/lib/clubs'
import { indexLabel } from '@/lib/handicapIndex'
import { useShell } from '../ShellContext'
import RowPanel, { indexValue, tickWhy } from './RowPanel'
import PasteSheet, { UPLOAD_ACCEPT, readListFile } from './PasteSheet'

type Field = 'name' | 'email' | 'memberNumber' | 'guiNumber' | 'handicapIndex'
const FIELDS: Field[] = ['name', 'email', 'memberNumber', 'guiNumber', 'handicapIndex']
const TICKS: { key: CredentialKey; label: string }[] = [
  { key: 'playsHere', label: 'Plays here' }, { key: 'officer', label: 'Officer' }, { key: 'clubhouse', label: 'Clubhouse' },
]
const SORTABLE: Partial<Record<Field, ListSort>> = { name: 'name', email: 'email', memberNumber: 'memberNumber', guiNumber: 'guiNumber' }
const HEAD: Record<Field, string> = { name: 'Name', email: 'Email', memberNumber: 'Member no.', guiNumber: 'GUI no.', handicapIndex: 'Index' }

/** A cell's text as the grid shows and edits it. */
function shown(r: GridRow, f: Field): string {
  if (f === 'handicapIndex') return r.handicapIndex === null ? '' : indexLabel(r.handicapIndex)
  return r[f] ?? ''
}

type Toast = { text: string; tone: 'ok' | 'error'; undo?: () => void; skipped?: { name: string; why: string }[] }

/**
 * The club's list as a grid (stage (k1), D207, D217): 50 a page, searched,
 * filtered and ordered on the server. A cell changes in place (Enter or a
 * click; Enter saves, Escape lets go, Tab saves and moves on); the three
 * ticks are each one click; ticked rows change together from the bar that
 * rises at the foot; a list is pasted or uploaded and shown whole before it
 * is saved; the list downloads as a file. The last change can be undone
 * (the toast's Undo, or Ctrl+Z). "/" goes to the search. On a phone the
 * list is one column and a row opens whole; the rest says to open it on a
 * computer (D202).
 */
export default function MembersGrid() {
  const { face, club, may, staff } = useShell()
  const asker = useMemo(() => ({ row: club.credentials, staff }), [club.credentials, staff])
  const [q, setQ] = useState('')
  const [searched, setSearched] = useState('')
  const [filter, setFilter] = useState<ListFilter>('all')
  const [sort, setSort] = useState<ListSort>('name')
  const [desc, setDesc] = useState(false)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ grid: GridRow[]; total: number } | null>(null)
  const [lost, setLost] = useState(false)
  const [reload, setReload] = useState(0)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ id: string; field: Field } | null>(null)
  const [draft, setDraft] = useState('')
  const [failedCell, setFailedCell] = useState<string | null>(null)
  const [panel, setPanel] = useState<{ row: GridRow | null } | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const undoRef = useRef<(() => void) | null>(null)

  // The filter an address asks for (?filter=), from the Overview's figures.
  useEffect(() => { setFilter(readFilter(new URLSearchParams(window.location.search).get('filter'))) }, [])
  // A search settles a moment after the last key.
  useEffect(() => { const t = setTimeout(() => setSearched(q.trim()), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(0); setTicked(new Set()) }, [searched, filter, sort, desc])

  useEffect(() => {
    let live = true
    void askClub('page', { clubId: club.id, q: searched, filter, sort, desc, page }).then(r => {
      if (!live) return
      if (r.ok && r.grid) { setData({ grid: r.grid, total: r.total ?? r.grid.length }); setLost(false) } else setLost(true)
    })
    return () => { live = false }
  }, [club.id, searched, filter, sort, desc, page, reload])

  function chooseFilter(f: ListFilter) {
    setFilter(f)
    const url = f === 'all' ? window.location.pathname : `${window.location.pathname}?filter=${f}`
    window.history.replaceState(window.history.state, '', url)
  }

  const patch = useCallback((id: string, fn: (r: GridRow) => GridRow) => {
    setData(d => (d ? { ...d, grid: d.grid.map(r => (r.id === id ? fn(r) : r)) } : d))
  }, [])

  const say = useCallback((t: Toast) => {
    undoRef.current = t.undo ?? null
    setToast(t)
  }, [])

  // ─── One cell ───
  async function commit(row: GridRow, field: Field, value: string, isUndo = false) {
    const before = shown(row, field)
    const v = value.trim()
    setEditing(null)
    if (v === before) return
    if (field === 'name' || field === 'email' || field === 'memberNumber' || field === 'guiNumber') {
      const why = listRowIssue(cleanRow({ name: row.name, email: row.email, memberNumber: row.memberNumber, guiNumber: row.guiNumber, [field]: v }))
      if (why) { setFailedCell(`${row.id}:${field}`); say({ text: why, tone: 'error' }); return }
    }
    const next: GridRow = field === 'handicapIndex' ? { ...row, handicapIndex: indexValue(v, row.handicapIndex) } : { ...row, [field]: v || null }
    patch(row.id, () => next)
    setFailedCell(null)
    const r = await askClub('update', { clubId: club.id, memberId: row.id, whole: true, slim: true, [field]: v })
    if (!r.ok) {
      patch(row.id, () => row)
      setFailedCell(`${row.id}:${field}`)
      say({ text: r.error, tone: 'error' })
      return
    }
    say({ text: isUndo ? 'Put back.' : 'Saved.', tone: 'ok', undo: isUndo ? undefined : () => void commit(next, field, before, true) })
  }

  // ─── One tick ───
  async function tick(row: GridRow, key: CredentialKey, value: boolean, isUndo = false) {
    const next: GridRow = { ...row, credentials: withChange(row.credentials, { [key]: value }) }
    patch(row.id, () => next)
    const r = await askClub('update', { clubId: club.id, memberId: row.id, slim: true, [key]: value })
    if (!r.ok) {
      patch(row.id, () => row)
      say({ text: r.error, tone: 'error' })
      return
    }
    say({ text: isUndo ? 'Put back.' : `${row.name}: ${TICKS.find(t => t.key === key)?.label} ${value ? 'on' : 'off'}.`, tone: 'ok', undo: isUndo ? undefined : () => void tick(next, key, !value, true) })
  }

  // ─── The ticked rows ───
  async function bulk(op: 'tick' | 'invite' | 'remove' | 'restore', extra: Record<string, unknown> = {}, done = 'Done.') {
    setBusy(true)
    const r = await askClub('bulk', { clubId: club.id, memberIds: [...ticked], op, ...extra })
    setBusy(false)
    setConfirmOff(false)
    if (!r.ok) { say({ text: r.error, tone: 'error' }); return }
    say({ text: r.failed?.length ? `${r.done ?? 0} done. ${r.failed.length} could not be:` : done, tone: r.failed?.length ? 'error' : 'ok', skipped: r.failed })
    setTicked(new Set())
    setReload(n => n + 1)
  }

  async function download() {
    setBusy(true)
    const r = await askClub('export', { clubId: club.id })
    setBusy(false)
    if (!r.ok || r.csv === undefined) { say({ text: r.ok ? 'Could not make the file — try again.' : r.error, tone: 'error' }); return }
    const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = listFileName(face.slug, irishToday(new Date()))
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    say({ text: `${r.total ?? 0} ${r.total === 1 ? 'person' : 'people'} downloaded.`, tone: 'ok' })
  }

  async function upload(file: File | undefined) {
    if (!file) return
    const read = await readListFile(file)
    if (!read.ok) { say({ text: read.why, tone: 'error' }); return }
    setPaste(read.text)
  }

  // "/" to search, Ctrl+Z to undo — never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (typing || panel || paste !== null) return
      if (e.key === '/') { e.preventDefault(); search.current?.focus() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undoRef.current) { e.preventDefault(); const u = undoRef.current; undoRef.current = null; u() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, paste])

  useEffect(() => {
    if (!toast || toast.tone === 'error') return
    const t = setTimeout(() => setToast(cur => (cur === toast ? null : cur)), 6000)
    return () => clearTimeout(t)
  }, [toast])

  if (!may('keep_list')) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse keeps the club’s list.</p>

  const grid = data?.grid ?? []
  const total = data?.total ?? 0
  const empty = !!data && total === 0 && !searched && filter === 'all'
  const allTicked = grid.length > 0 && grid.every(r => ticked.has(r.id))
  const toggleSort = (s: ListSort) => { if (sort === s) setDesc(d => !d); else { setSort(s); setDesc(false) } }

  function editKey(e: React.KeyboardEvent<HTMLInputElement>, row: GridRow, field: Field) {
    if (e.key === 'Enter') { e.preventDefault(); void commit(row, field, draft) }
    else if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
    else if (e.key === 'Tab') {
      e.preventDefault()
      void commit(row, field, draft)
      const i = FIELDS.indexOf(field) + (e.shiftKey ? -1 : 1)
      if (i >= 0 && i < FIELDS.length) { setEditing({ id: row.id, field: FIELDS[i] }); setDraft(shown(row, FIELDS[i])) }
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="t-h1 text-ink">Members</h1>
          <p className="t-cap text-ink/65 mt-1">{data ? pageLine(page, total) : ' '}</p>
        </div>
        <div className="hidden md:flex flex-wrap gap-2">
          <button type="button" onClick={() => setPanel({ row: null })} className={`${buttonClass('secondary', false)} ch-focus`}>Add a person</button>
          <button type="button" onClick={() => setPaste('')} className={`${buttonClass('secondary', false)} ch-focus`}>Paste a list</button>
          <label className={`${buttonClass('secondary', false)} ch-focus cursor-pointer`}>
            Upload a file
            <input type="file" accept={UPLOAD_ACCEPT} className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          <button type="button" disabled={busy || total === 0} onClick={() => void download()} className={`${buttonClass('quiet', false)} ch-focus`}>Download</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-5">
        <input ref={search} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search names, emails, numbers"
          aria-label="Search the list" className={`${FIELD} ch-focus md:max-w-sm`} />
        <select value={filter} onChange={e => chooseFilter(e.target.value as ListFilter)} aria-label="Show" className={`${FIELD} ch-focus md:max-w-[240px]`}>
          {LIST_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>
      <p className="md:hidden t-cap text-ink/65 mt-3">Open this on a computer to paste a list, upload a file, download the list or change many at once.</p>

      {lost && (
        <div role="alert" className="mt-4">
          <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
          <button type="button" onClick={() => setReload(n => n + 1)} className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
        </div>
      )}

      {empty ? (
        <div className={`${cardClass()} p-6 mt-6 max-w-xl`}>
          <p className="t-card text-ink">Nobody on the list yet</p>
          <p className="text-ink/80 text-[15px] mt-2">Paste the list from a spreadsheet, or add people one at a time.</p>
          <div className="flex flex-wrap gap-3 mt-5">
            <button type="button" onClick={() => setPaste('')} className={`${buttonClass('primary', false)} ch-focus`}>Paste a list</button>
            <button type="button" onClick={() => setPanel({ row: null })} className={`${buttonClass('secondary', false)} ch-focus`}>Add a person</button>
          </div>
        </div>
      ) : (
        <>
          {/* A computer: the grid. */}
          <div className={`${cardClass()} mt-5 overflow-x-auto hidden md:block`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="w-12 px-4">
                    <TickBox label="Tick every row on this page" on={allTicked} onChange={v => setTicked(v ? new Set(grid.map(r => r.id)) : new Set())} />
                  </th>
                  {FIELDS.map(f => {
                    const s = SORTABLE[f]
                    const right = f === 'memberNumber' || f === 'guiNumber' || f === 'handicapIndex'
                    return (
                      <th key={f} scope="col" aria-sort={s && sort === s ? (desc ? 'descending' : 'ascending') : undefined}
                        className={`t-eyebrow text-ink/65 font-normal px-4 py-3 whitespace-nowrap ${right ? 'text-right' : ''}`}>
                        {s ? (
                          <button type="button" onClick={() => toggleSort(s)} className="ch-focus rounded-tile">
                            {HEAD[f]}{sort === s ? (desc ? ' ↓' : ' ↑') : ''}
                          </button>
                        ) : HEAD[f]}
                      </th>
                    )
                  })}
                  <th scope="col" className="t-eyebrow text-ink/65 font-normal px-4 py-3">Standing</th>
                  {TICKS.map(t => <th key={t.key} scope="col" className="t-eyebrow text-ink/65 font-normal px-3 py-3 text-center whitespace-nowrap">{t.label}</th>)}
                  <th scope="col" className="px-4"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {!data && Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className="border-b border-line"><td colSpan={11} className="px-4 py-2"><div className="skeleton h-8 rounded-tile" /></td></tr>
                ))}
                {data && grid.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-ink/65 text-[15px]">
                    Nobody matches. <button type="button" onClick={() => { setQ(''); chooseFilter('all') }} className="underline underline-offset-2 text-ink ch-focus">Show everyone</button>
                  </td></tr>
                )}
                {grid.map(r => (
                  <tr key={r.id} aria-selected={ticked.has(r.id)} className="ch-row ch-hover border-b border-line last:border-b-0 h-12">
                    <td className="px-4">
                      <TickBox label={`Tick ${r.name}`} on={ticked.has(r.id)} onChange={v => setTicked(s => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n })} />
                    </td>
                    {FIELDS.map(f => {
                      const key = `${r.id}:${f}`
                      const right = f === 'memberNumber' || f === 'guiNumber' || f === 'handicapIndex'
                      const isEditing = editing?.id === r.id && editing.field === f
                      return (
                        <td key={f} className={`px-2 ${isEditing ? 'ch-cell-editing' : ''} ${right ? 'text-right' : ''}`}>
                          {isEditing ? (
                            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => editKey(e, r, f)}
                              onBlur={() => void commit(r, f, draft)} aria-label={`${HEAD[f]} for ${r.name}`}
                              inputMode={f === 'guiNumber' ? 'numeric' : f === 'handicapIndex' ? 'decimal' : undefined}
                              className={`w-full min-w-[6rem] h-9 px-2 rounded-tile bg-surface border border-accent-deep text-[15px] text-ink outline-none ${right ? 'text-right tabular-nums' : ''}`} />
                          ) : (
                            <button type="button" onClick={() => { setEditing({ id: r.id, field: f }); setDraft(shown(r, f)) }}
                              aria-label={`${HEAD[f]} for ${r.name}: ${shown(r, f) || 'empty'}. Change`}
                              className={`ch-focus w-full min-h-9 px-2 rounded-tile text-[15px] ${right ? 'text-right tabular-nums' : 'text-left'} ${failedCell === key ? 'border border-rust text-rust-deep' : ''} ${f === 'name' ? 'text-ink font-medium' : 'text-ink/80'} ${r.removed ? 'line-through text-ink/50' : ''} ${f === 'email' ? 'break-all' : 'whitespace-nowrap'}`}>
                              {shown(r, f) || <span className="text-ink/65">—</span>}
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-4 whitespace-nowrap"><StandingPill s={standingOf(r)} /></td>
                    {TICKS.map(t => {
                      const why = tickWhy(asker, r, t.key)
                      return (
                        <td key={t.key} className="px-3 text-center">
                          <TickBox label={`${t.label}: ${r.name}`} on={r.credentials[t.key]} disabled={!!why} title={why ?? undefined} onChange={v => void tick(r, t.key, v)} />
                        </td>
                      )
                    })}
                    <td className="px-4 text-right">
                      <button type="button" onClick={() => setPanel({ row: r })} className="ch-hover ch-focus t-label text-ink rounded-tile px-2 min-h-9 whitespace-nowrap">Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* A phone: one column, a row opening whole (D202). */}
          <ul className={`${cardClass()} mt-5 divide-y divide-line md:hidden overflow-hidden`}>
            {!data && [0, 1, 2, 3].map(i => <li key={i} className="p-3"><div className="skeleton h-10 rounded-tile" /></li>)}
            {data && grid.length === 0 && <li className="p-4 text-ink/65 text-[15px]">Nobody matches.</li>}
            {grid.map(r => (
              <li key={r.id}>
                <button type="button" onClick={() => setPanel({ row: r })} className="w-full text-left flex items-center gap-3 min-h-14 px-4 py-3 press">
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[17px] font-medium leading-snug ${r.removed ? 'text-ink/50 line-through' : 'text-ink'}`}>{r.name}</span>
                    <span className="block t-cap text-ink/65 mt-0.5">{[r.memberNumber ? `No. ${r.memberNumber}` : null, r.handicapIndex !== null ? `Index ${indexLabel(r.handicapIndex)}` : null].filter(Boolean).join(' · ') || (r.email ?? 'No email')}</span>
                  </span>
                  <StandingPill s={standingOf(r)} />
                </button>
              </li>
            ))}
          </ul>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <span className="t-cap text-ink/65 mr-2">{pageLine(page, total)}</span>
              <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="The page before" className={`${buttonClass('quiet', false)} ch-focus`}><IconChevronLeft size={20} /></button>
              <button type="button" disabled={page >= lastPage(total)} onClick={() => setPage(p => p + 1)} aria-label="The next page" className={`${buttonClass('quiet', false)} ch-focus`}><IconChevronRight size={20} /></button>
            </div>
          )}
        </>
      )}

      {ticked.size > 0 && (
        <div className="ch-bar-rise fixed left-4 right-4 bottom-4 lg:left-[calc(15rem+2rem)] z-30 hidden md:flex justify-center">
          <div className={`${cardClass('floating')} px-4 py-3 flex flex-wrap items-center gap-2 max-w-full`}>
            <span className="t-label text-ink mr-2">{ticked.size} ticked</span>
            {confirmOff ? (
              <>
                <span className="t-cap text-ink/80">Take {ticked.size} off the list? Their accounts and golf are untouched.</span>
                <button type="button" disabled={busy} onClick={() => void bulk('remove', {}, 'Taken off the list.')} className={`${buttonClass('danger', false)} ch-focus`}>Take off</button>
                <button type="button" onClick={() => setConfirmOff(false)} className={`${buttonClass('quiet', false)} ch-focus`}>Keep</button>
              </>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => void bulk('tick', { key: 'officer', value: true }, 'Made Officers.')} className={`${buttonClass('secondary', false)} ch-focus`}>Make Officer</button>
                <button type="button" disabled={busy} onClick={() => void bulk('tick', { key: 'officer', value: false }, 'Officer taken away.')} className={`${buttonClass('quiet', false)} ch-focus`}>Not Officer</button>
                <button type="button" disabled={busy} onClick={() => void bulk('tick', { key: 'playsHere', value: true }, 'Ticked as playing here.')} className={`${buttonClass('quiet', false)} ch-focus`}>Plays here</button>
                <button type="button" disabled={busy} onClick={() => void bulk('tick', { key: 'playsHere', value: false }, 'Ticked as not playing here.')} className={`${buttonClass('quiet', false)} ch-focus`}>Doesn’t play</button>
                {may('grant_clubhouse') && <button type="button" disabled={busy} onClick={() => void bulk('tick', { key: 'clubhouse', value: true }, 'Given Clubhouse.')} className={`${buttonClass('quiet', false)} ch-focus`}>Give Clubhouse</button>}
                <button type="button" disabled={busy} onClick={() => void bulk('invite', {}, 'Codes sent.')} className={`${buttonClass('quiet', false)} ch-focus`}>Email codes</button>
                {filter === 'off'
                  ? <button type="button" disabled={busy} onClick={() => void bulk('restore', {}, 'Back on the list.')} className={`${buttonClass('quiet', false)} ch-focus`}>Put back</button>
                  : <button type="button" disabled={busy} onClick={() => setConfirmOff(true)} className={`${buttonClass('quiet', false)} ch-focus`}>Take off the list</button>}
                <button type="button" onClick={() => setTicked(new Set())} className={`${buttonClass('quiet', false)} ch-focus`}>Clear</button>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div role={toast.tone === 'error' ? 'alert' : 'status'} className={`fixed right-4 z-40 max-w-sm ${ticked.size > 0 ? 'bottom-24' : 'bottom-4'}`}>
          <div className={`${cardClass('floating')} px-4 py-3`}>
            <div className="flex items-start gap-3">
              <p className={`flex-1 t-cap ${toast.tone === 'error' ? 'text-rust-deep' : 'text-ink'}`}>{toast.text}</p>
              {toast.undo && <button type="button" onClick={() => { const u = toast.undo!; undoRef.current = null; setToast(null); u() }} className="t-label text-accent-deep underline underline-offset-2 ch-focus">Undo</button>}
              <button type="button" onClick={() => setToast(null)} className="t-cap text-ink/65 ch-focus" aria-label="Dismiss">Close</button>
            </div>
            {toast.skipped && toast.skipped.length > 0 && (
              <ul className="t-cap text-ink/80 mt-2 list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
                {toast.skipped.slice(0, 30).map((s, i) => <li key={i}>{s.name}: {s.why}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {panel && (
        <RowPanel clubId={club.id} clubName={face.name} asker={asker} row={panel.row} onClose={() => setPanel(null)}
          onSaved={(next, note) => {
            if (next) { patch(next.id, () => next); setPanel({ row: next }) } else { setPanel(null); setReload(n => n + 1) }
            say({ text: note, tone: 'ok' })
          }} />
      )}
      {paste !== null && (
        <PasteSheet clubId={club.id} startText={paste} onClose={() => setPaste(null)}
          onDone={(note, skipped) => { setPaste(null); setReload(n => n + 1); say({ text: note, tone: skipped.length ? 'error' : 'ok', skipped }) }} />
      )}
    </>
  )
}

function StandingPill({ s }: { s: Standing }) {
  if (s === 'joined') return <Pill tone="win">{STANDING_WORDS[s]}</Pill>
  if (s === 'invited') return <Pill>{STANDING_WORDS[s]}</Pill>
  return <span className="t-cap text-ink/65 whitespace-nowrap">{STANDING_WORDS[s]}</span>
}

/** A tick in the grid: a 24px box, the emerald tick when on; greyed with why when it is not this account's to change. */
function TickBox({ on, onChange, label, disabled = false, title }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; title?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} title={title} onClick={() => onChange(!on)}
      className={`ch-focus inline-flex items-center justify-center w-6 h-6 rounded-[6px] border ${on ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
      {on && <IconCheck size={16} />}
    </button>
  )
}
