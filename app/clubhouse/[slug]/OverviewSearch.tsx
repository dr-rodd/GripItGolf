'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSearch } from '@/app/components/icons'
import { FIELD } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { clubhouseHref, eventHref, seasonType, type SeasonEvent } from '@/lib/clubhouse'
import { SEARCH_GROUP_MAX, dayWord, matchTier, parseDay, searchEvents, type SearchResult } from '@/lib/clubOverview'
import { typeLabel } from '@/lib/clubEvents'
import { clubEventDates } from '@/lib/clubs'
import { useShell } from './ShellContext'

const GROUP_WORDS: Record<SearchResult['group'], string> = { day: 'Calendar', events: 'Events', members: 'Members' }

/**
 * The Overview's search (D276): events and competitions from the season
 * already read, members through the grid's own search (two letters or more,
 * the list's keepers only), and a date read off what was typed. "/" focuses
 * it, ↑ ↓ move, Enter opens the one lit, Escape clears. Every result opens
 * in its own section of the Clubhouse, in the same window.
 */
export default function OverviewSearch({ events, today }: { events: SeasonEvent[] | null; today: string }) {
  const { face, club, may } = useShell()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [settled, setSettled] = useState('')
  const [people, setPeople] = useState<{ q: string; id: string; name: string; sub: string }[]>([])
  const [lit, setLit] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const keepsList = may('keep_list')

  // "/" anywhere on the Overview, unless a box already has the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault(); box.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { const t = setTimeout(() => setSettled(q.trim()), 200); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    if (!keepsList || settled.length < 2) return
    let live = true
    void askClub('page', { clubId: club.id, q: settled, page: 0 }).then(r => {
      if (!live || !r.ok) return
      const grid = (r.grid ?? []).filter(g => !g.removed)
      setPeople(grid.map(g => ({ q: settled, id: g.id, name: g.name, sub: [g.memberNumber ? `No. ${g.memberNumber}` : null, g.email].filter(Boolean).join(' · ') || 'On the list' })))
    })
    return () => { live = false }
  }, [settled, keepsList, club.id])

  const results: SearchResult[] = useMemo(() => {
    const s = q.trim()
    if (!s) return []
    const out: SearchResult[] = []
    const day = parseDay(s, today)
    if (day) out.push({ key: `day-${day}`, group: 'day', label: dayWord(day, today), sub: 'Open the day — every location side by side', href: `${clubhouseHref(face.slug, 'calendar')}/${day}` })
    for (const e of searchEvents(s, events ?? [], today)) {
      const href = e.note ? `${clubhouseHref(face.slug, 'events')}?event=${e.note.id}` : eventHref(e, face.slug)
      if (!href) continue
      out.push({ key: `ev-${e.code}`, group: 'events', label: e.name, sub: [clubEventDates(e.startDate, e.endDate), typeLabel(seasonType(e))].filter(Boolean).join(' · '), href })
    }
    // The server has already searched names, emails and numbers; a name that matches is put first.
    // Only the answer to what is in the box now — an older one is never shown under a newer search.
    const ranked = people.filter(p => p.q === settled && settled.length >= 2 && s.toLowerCase().startsWith(settled.toLowerCase())).sort((a, b) => (matchTier(a.name, s) ?? 3) - (matchTier(b.name, s) ?? 3)).slice(0, SEARCH_GROUP_MAX)
    for (const p of ranked) out.push({ key: `m-${p.id}`, group: 'members', label: p.name, sub: p.sub, href: `${clubhouseHref(face.slug, 'members')}?row=${p.id}&q=${encodeURIComponent(p.name)}` })
    return out
  }, [q, settled, events, people, today, face.slug])


  const open = (r: SearchResult) => { router.push(r.href) }
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setLit(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setLit(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && results[Math.min(lit, results.length - 1)]) { e.preventDefault(); open(results[Math.min(lit, results.length - 1)]) }
    else if (e.key === 'Escape') { setQ(''); box.current?.blur() }
  }

  const groups = (['day', 'events', 'members'] as const).map(g => ({ g, rows: results.filter(r => r.group === g) })).filter(x => x.rows.length)
  const shown = q.trim().length > 0
  return (
    <div className="relative">
      <label htmlFor="ov-search" className="sr-only">Search events, competitions, members or a date</label>
      <span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/65 pointer-events-none"><IconSearch size={20} /></span>
      <input id="ov-search" ref={box} type="search" value={q} onChange={e => { setQ(e.target.value); setLit(0) }} onKeyDown={onKey} autoComplete="off" spellCheck={false}
        role="combobox" aria-expanded={shown} aria-controls="ov-results" aria-activedescendant={shown && results[lit] ? `ov-r-${results[lit].key}` : undefined}
        placeholder={keepsList ? 'Search events, competitions, members, a date…' : 'Search events, competitions, a date…'}
        className={`${FIELD} ch-focus pl-12 pr-10`} />
      <kbd aria-hidden="true" className="hidden md:block absolute right-3 top-1/2 -translate-y-1/2 t-cap text-ink/65 border border-line rounded px-1.5">/</kbd>
      {shown && (
        <div id="ov-results" role="listbox" aria-label="Results" className="absolute left-0 right-0 top-full mt-2 z-30 paper border border-line rounded-card shadow-floating max-h-[70vh] overflow-y-auto p-2">
          {groups.length === 0 ? (
            <p className="t-cap text-ink/65 px-3 py-3">{keepsList && q.trim().length < 2 ? 'Keep typing to search the list.' : 'Nothing found.'}</p>
          ) : groups.map(({ g, rows }) => (
            <div key={g} className="py-1">
              <p className="t-eyebrow text-ink/65 px-3 py-1">{GROUP_WORDS[g]}</p>
              {rows.map(r => {
                const i = results.indexOf(r)
                return (
                  <a key={r.key} id={`ov-r-${r.key}`} role="option" aria-selected={i === lit} href={r.href}
                    onClick={e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); open(r) }}
                    onMouseEnter={() => setLit(i)}
                    className={`flex items-center gap-3 min-h-11 px-3 rounded-tile ${i === lit ? 'bg-tint' : ''}`}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-ink text-[15px] font-medium truncate">{r.label}</span>
                      <span className="block t-cap text-ink/65 truncate">{r.sub}</span>
                    </span>
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
