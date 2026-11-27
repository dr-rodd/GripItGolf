'use client'

import { useMemo, useState } from 'react'
import { FIELD, ListGroup, ListRow, Segmented } from '@/app/components/ui'
import type { Competition, ProvinceKey } from '@/lib/interclub'

/**
 * The competitions, a province at a time, or found by name across all four.
 * Every list arrives with the page; switching and searching only filter it.
 */
export default function Finder({ provinces }: {
  provinces: { key: ProvinceKey; name: string; competitions: Competition[] | null }[]
}) {
  const [province, setProvince] = useState<ProvinceKey>(provinces[0]?.key ?? 'connacht')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const shown = useMemo(() => {
    if (!q) return provinces.find(p => p.key === province)?.competitions ?? null
    return provinces.flatMap(p => p.competitions ?? []).filter(c => c.name.toLowerCase().includes(q))
  }, [provinces, province, q])

  const nameOf = (key: ProvinceKey) => provinces.find(p => p.key === key)?.name ?? ''

  return (
    <div>
      <label className="sr-only" htmlFor="interclub-search">Find a competition</label>
      <input
        id="interclub-search"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Find a competition — Barton, Junior Cup…"
        className={FIELD}
        autoComplete="off"
      />

      {!q && (
        <Segmented
          className="mt-3"
          label="Province"
          options={provinces.map(p => ({ value: p.key, label: p.name }))}
          value={province}
          onChange={setProvince}
        />
      )}

      <div className="mt-4">
        {shown === null ? (
          <p className="t-body text-ink/80 text-center py-8">Could not read {nameOf(province)}’s competitions just now — try again shortly.</p>
        ) : shown.length === 0 ? (
          <p className="t-body text-ink/80 text-center py-8">No competition by that name.</p>
        ) : (
          <ListGroup>
            {shown.map(c => (
              <ListRow
                key={`${c.province}/${c.slug}`}
                label={c.name}
                hint={q ? nameOf(c.province) : undefined}
                href={`/interclub/${c.province}/${c.slug}`}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </div>
  )
}
