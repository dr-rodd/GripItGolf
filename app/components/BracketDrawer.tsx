'use client'

import { useRef, useState } from 'react'
import {
  AUTO_SEEDINGS, DRAW_METHODS, DRAW_TIMINGS, byHandicap, draftSlots, moveToSeed, placeInSlot,
  shuffled, unplaced,
  type AutoSeeding, type DrawDraft, type DrawEntrant, type DrawMethod, type DrawWhen,
} from '@/lib/bracketDraw'
import { roundName } from '@/lib/matchplay'
import { formatHandicap } from '@/lib/handicap'
import DateField from './DateField'
import { FIELD, FIELD_LABEL, buttonClass, cardClass, chipClass, optionClass } from './ui'

/**
 * Making a knockout's draw (lib/bracketDraw.ts) — the same builder at
 * creation and in the organiser area:
 *
 * * **Random** — the field out of a hat, drawn again as often as you like.
 * * **Seeded** — a numbered list: type a number against a player to move
 *   them to it, or drag the handle; start it from handicap order, or
 *   shuffle it, as many times as wanted.
 * * **Pick the matches** — the draw sized off the field so far, each empty
 *   place a dropdown of the players not yet placed. A place left empty is
 *   a bye.
 *
 * Under every method, the first round as it will be drawn. The builder only
 * edits a draft; whoever holds it saves it.
 */
export default function BracketDrawer({ entrants, value, onChange }: {
  entrants: readonly DrawEntrant[]
  value: DrawDraft
  onChange: (next: DrawDraft) => void
}) {
  const byId = new Map(entrants.map(e => [e.id, e]))
  const nameOf = (id: string | null) => (id ? byId.get(id)?.name ?? 'A player' : 'Bye')
  const field = entrants.map(e => e.id)
  const setMethod = (method: DrawMethod) => onChange({ ...value, method })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="How the draw is made">
        {DRAW_METHODS.map(m => (
          <button
            key={m.key}
            type="button"
            role="radio"
            aria-checked={value.method === m.key}
            onClick={() => setMethod(m.key)}
            className={optionClass(value.method === m.key)}
          >
            <span className="block text-sm font-medium text-ink">{m.label}</span>
            <span className="block t-cap text-ink/65">{m.hint}</span>
          </button>
        ))}
      </div>

      {value.method === 'random' && (
        <div className="flex justify-center">
          <button type="button" onClick={() => onChange({ ...value, order: shuffled(value.order) })} className={buttonClass('secondary', false)}>
            Draw again
          </button>
        </div>
      )}

      {value.method === 'seeded' && (
        <SeedList entrants={entrants} order={value.order} onChange={order => onChange({ ...value, order })} />
      )}

      {value.method === 'manual' && (
        <ManualDraw
          slots={value.slots}
          field={field}
          nameOf={nameOf}
          onChange={slots => onChange({ ...value, slots })}
        />
      )}

      {value.method !== 'manual' && <FirstRound draft={value} nameOf={nameOf} />}
    </div>
  )
}

// ─── Seeded ────────────────────────────────────────────────────

function SeedList({ entrants, order, onChange }: {
  entrants: readonly DrawEntrant[]
  order: string[]
  onChange: (order: string[]) => void
}) {
  const byId = new Map(entrants.map(e => [e.id, e]))
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  // What is being typed into a number box, until it is left.
  const [typing, setTyping] = useState<{ id: string; text: string } | null>(null)

  function commitTyped() {
    if (!typing) return
    const n = Number(typing.text)
    if (typing.text && Number.isFinite(n) && n >= 1) onChange(moveToSeed(order, typing.id, n))
    setTyping(null)
  }

  // Drag by the handle: the row under the finger is where it lands.
  function rowAt(y: number): number | null {
    for (let i = 0; i < rows.current.length; i++) {
      const r = rows.current[i]?.getBoundingClientRect()
      if (r && y >= r.top && y <= r.bottom) return i
    }
    return null
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button type="button" onClick={() => onChange(byHandicap(order.flatMap(id => byId.get(id) ?? [])).map(e => e.id))} className={chipClass(false)}>
          By handicap
        </button>
        <button type="button" onClick={() => onChange(shuffled(order))} className={chipClass(false)}>
          Shuffle
        </button>
        <button type="button" onClick={() => onChange(entrants.map(e => e.id))} className={chipClass(false)}>
          Order entered
        </button>
      </div>
      <p className="t-cap text-ink/65 mb-2">Type a number to move a player there, or drag the handle.</p>
      <ol className={`${cardClass()} divide-y divide-line`} aria-label="Seeds">
        {order.map((id, i) => {
          const e = byId.get(id)
          return (
            <li
              key={id}
              ref={el => { rows.current[i] = el }}
              className={`flex items-center gap-3 px-3 py-2 ${over === i && dragging !== null && dragging !== i ? 'bg-accent-tint' : ''} ${dragging === i ? 'opacity-60' : ''}`}
            >
              <input
                type="text"
                inputMode="numeric"
                aria-label={`Seed for ${e?.name ?? 'player'}`}
                value={typing?.id === id ? typing.text : String(i + 1)}
                onFocus={ev => { setTyping({ id, text: '' }); ev.currentTarget.select() }}
                onChange={ev => setTyping({ id, text: ev.target.value.replace(/\D/g, '').slice(0, 2) })}
                onBlur={commitTyped}
                onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur() }}
                className={`${FIELD} field-dense text-center tabular-nums`}
                style={{ width: '3.5rem' }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink truncate">{e?.name ?? 'A player'}</span>
                <span className="block t-cap text-ink/65">{e?.handicap == null ? 'Handicap to come' : `Handicap ${formatHandicap(e.handicap)}`}</span>
              </span>
              <button
                type="button"
                aria-label={`Drag ${e?.name ?? 'player'} to a new seed`}
                className="w-11 h-11 flex items-center justify-center text-ink/50 cursor-grab"
                style={{ touchAction: 'none' }}
                onPointerDown={ev => { ev.currentTarget.setPointerCapture(ev.pointerId); setDragging(i); setOver(i) }}
                onPointerMove={ev => { if (dragging !== null) setOver(rowAt(ev.clientY) ?? over) }}
                onPointerUp={() => {
                  if (dragging !== null && over !== null && over !== dragging) onChange(moveToSeed(order, order[dragging], over + 1))
                  setDragging(null); setOver(null)
                }}
                onPointerCancel={() => { setDragging(null); setOver(null) }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 8h16M4 16h16" />
                </svg>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── Manual ────────────────────────────────────────────────────

function ManualDraw({ slots, field, nameOf, onChange }: {
  slots: (string | null)[]
  field: string[]
  nameOf: (id: string | null) => string
  onChange: (slots: (string | null)[]) => void
}) {
  const free = unplaced(slots, field)
  const matches = Array.from({ length: slots.length / 2 }, (_, i) => i)
  return (
    <div>
      <p className="t-cap text-ink/65 mb-2">
        {roundName(slots.length)} · {free.length === 0 ? 'everybody is in the draw' : `${free.length} still to place`}.
        A place left empty is a bye.
      </p>
      <ol className="space-y-2" aria-label="First-round matches">
        {matches.map(m => (
          <li key={m} className={`p-3 ${cardClass()}`}>
            <p className="t-cap text-ink/65 mb-2">Match {m + 1}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {[m * 2, m * 2 + 1].map((place, side) => (
                <PlaceSelect
                  key={place}
                  label={`Match ${m + 1}, ${side === 0 ? 'top' : 'bottom'} place`}
                  value={slots[place]}
                  options={[...(slots[place] ? [slots[place] as string] : []), ...free]}
                  nameOf={nameOf}
                  onChange={id => onChange(placeInSlot(slots, place, id))}
                  className={side === 0 ? 'order-1' : 'order-3'}
                />
              ))}
              <span className="order-2 t-cap text-ink/50">v</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PlaceSelect({ label, value, options, nameOf, onChange, className }: {
  label: string
  value: string | null
  options: string[]
  nameOf: (id: string | null) => string
  onChange: (id: string | null) => void
  className: string
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      className={`${FIELD} field-dense min-w-0 ${value ? '' : 'text-ink/65'} ${className}`}
    >
      <option value="">{value ? 'Empty — a bye' : 'Add a player'}</option>
      {options.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
    </select>
  )
}

// ─── The first round, as it will be drawn ──────────────────────

function FirstRound({ draft, nameOf }: { draft: DrawDraft; nameOf: (id: string | null) => string }) {
  const { slots, seeds } = draftSlots(draft)
  if (slots.length < 2) return null
  return (
    <div>
      <p className={FIELD_LABEL}>{roundName(slots.length)}</p>
      <ol className={`${cardClass('flat')} divide-y divide-line`}>
        {Array.from({ length: slots.length / 2 }, (_, i) => (
          <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
            <Side name={nameOf(slots[i * 2])} seed={seeds?.[i * 2] ?? null} bye={!slots[i * 2]} />
            <span className="t-cap text-ink/50 flex-shrink-0">v</span>
            <Side name={nameOf(slots[i * 2 + 1])} seed={seeds?.[i * 2 + 1] ?? null} bye={!slots[i * 2 + 1]} right />
          </li>
        ))}
      </ol>
    </div>
  )
}

function Side({ name, seed, bye, right = false }: { name: string; seed: number | null; bye: boolean; right?: boolean }) {
  return (
    <span className={`flex-1 min-w-0 truncate ${right ? 'text-right' : ''} ${bye ? 'text-ink/50' : 'text-ink'}`}>
      {seed && !bye ? <span className="t-cap text-ink/50 tabular-nums mr-1">{seed}</span> : null}
      {name}
    </span>
  )
}

// ─── When ──────────────────────────────────────────────────────

export type DrawTimingValue = { when: DrawWhen; on: string; seeding: AutoSeeding }

/**
 * When the draw is made — now, later from the organiser area, or by itself
 * overnight on a date, at random, by handicap or in the order set here.
 * `now` is offered only where there is a field to draw from.
 */
export function DrawTiming({ value, onChange, allowNow = true, allowOrder = false, min }: {
  value: DrawTimingValue
  onChange: (next: DrawTimingValue) => void
  allowNow?: boolean
  /** "My order" is offered when a seeded order has been set. */
  allowOrder?: boolean
  min?: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="When the draw is made">
        {DRAW_TIMINGS.filter(t => allowNow || t.key !== 'now').map(t => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={value.when === t.key}
            onClick={() => onChange({ ...value, when: t.key })}
            className={optionClass(value.when === t.key)}
          >
            <span className="block text-sm font-medium text-ink">{t.label}</span>
            <span className="block t-cap text-ink/65">{t.hint}</span>
          </button>
        ))}
      </div>
      {value.when === 'date' && (
        <div className="space-y-3">
          <DateField label="The day of the draw" value={value.on} onChange={on => onChange({ ...value, on })} min={min} />
          <div>
            <p className={FIELD_LABEL}>How it is drawn</p>
            <div className="flex flex-wrap gap-1.5">
              {AUTO_SEEDINGS.filter(s => allowOrder || s.key !== 'order').map(s => (
                <button key={s.key} type="button" onClick={() => onChange({ ...value, seeding: s.key })}
                  aria-pressed={value.seeding === s.key} className={chipClass(value.seeding === s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="t-cap text-ink/65 mt-1.5">{AUTO_SEEDINGS.find(s => s.key === value.seeding)?.hint}</p>
          </div>
        </div>
      )}
    </div>
  )
}
