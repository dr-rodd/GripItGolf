'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { askFeed } from '@/lib/feedClient'
import { clubhouseHref } from '@/lib/clubhouse'
import { IconChevronLeft } from '@/app/components/icons'
import { buttonClass, cardClass } from '@/app/components/ui'
import { useShell } from '../ShellContext'

type Report = {
  id: string; itemId: string; reason: string | null; createdAt: string
  item: { kind: string; name: string; text: string; event: string | null; removed: boolean }
  reporter: string
}

const KIND: Record<string, string> = { card: 'A card’s status', comment: 'A comment', highlight: 'A highlight', board_move: 'A leaderboard move', match_result: 'A match result' }

/**
 * Reports on the feed (D303): what was reported on this club's cards, by
 * whom and why. Take it down — gone from every stream — or leave it up.
 * The Clubhouse's alone; the server asks again.
 */
export default function Reports() {
  const { face, club, may } = useShell()
  const [list, setList] = useState<Report[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await askFeed<{ reports: Report[] }>('reports.club', { clubId: club.id })
    if (!r.ok) { setError(r.error); setList([]); return }
    setList(r.reports)
  }, [club.id])
  useEffect(() => { void load() }, [load])

  if (!may('open_clubhouse')) return <p className="text-ink/80 text-[15px]">Only the club’s Clubhouse sees its reports.</p>

  async function resolve(r: Report, outcome: 'removed' | 'dismissed') {
    setBusy(r.itemId); setError('')
    const a = await askFeed('reports.resolve', { clubId: club.id, itemId: r.itemId, outcome })
    setBusy(null)
    if (!a.ok) { setError(a.error); return }
    await load()
  }

  // One row an item, however many reported it.
  const items = [...new Map((list ?? []).map(r => [r.itemId, r])).values()]
  const reasons = (itemId: string) => (list ?? []).filter(r => r.itemId === itemId)

  return (
    <section>
      <Link href={clubhouseHref(face.slug)} className="t-cap text-ink/65 inline-flex items-center gap-1 press ch-focus"><IconChevronLeft size={16} /> Overview</Link>
      <h1 className="t-h1 text-ink mt-2">Feed reports</h1>
      <p className="t-cap text-ink/65 mt-1">Reported on your club’s cards. Taking something down removes it from everybody’s feed.</p>
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
      {!list && <div className="space-y-2 mt-5">{[0, 1].map(i => <div key={i} className="skeleton h-24 rounded-card" />)}</div>}
      {list && items.length === 0 && <p className="text-ink/80 text-[15px] mt-5">Nothing waiting.</p>}
      <ul className="mt-5 space-y-3">
        {items.map(r => (
          <li key={r.itemId} className={`${cardClass()} p-4`}>
            <p className="t-cap text-ink/65">{KIND[r.item.kind] ?? 'An item'}{r.item.event ? ` · ${r.item.event}` : ''}</p>
            <p className="t-label text-ink mt-1">{r.item.name}</p>
            {r.item.text && <p className="text-ink text-[15px] mt-1 break-words">“{r.item.text}”</p>}
            <ul className="mt-2 space-y-0.5">
              {reasons(r.itemId).map(x => (
                <li key={x.id} className="t-cap text-ink/80">Reported by {x.reporter}{x.reason ? `: ${x.reason}` : ''}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 mt-3">
              <button type="button" disabled={busy !== null} onClick={() => void resolve(r, 'removed')} className={buttonClass('danger', false, true)}>Take it down</button>
              <button type="button" disabled={busy !== null} onClick={() => void resolve(r, 'dismissed')} className={buttonClass('secondary', false, true)}>Leave it up</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
