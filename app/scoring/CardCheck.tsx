"use client"

// Confirming the course record against a photo of the real scorecard, from
// the pick-player screen — the last moment before the numbers start to
// matter. Mid-trip corrections of indices, slopes and pars were last trip's
// biggest headache; this is the thirty seconds on the first tee that make
// them unnecessary.
//
// The flow is deliberately one-way: photograph → what disagrees → yes or no.
// Nothing is written until "Use the photo's card" is tapped, and taking
// another photo replaces the pending reading outright — the most recent
// photo always wins.

import React, { useRef, useState } from "react"
import type { CardDiff, HoleChange, NewCard, TeeColourFill } from "@/lib/cardCheck"
import { buttonClass, cardClass } from "@/app/components/ui"
import { IconCamera } from "@/app/components/icons"
import { GATE_TITLE } from "@/lib/courseCard"

// The client-side halves of the two route calls. The shapes mirror the
// routes' JSON exactly; lib/cardCheck.ts owns the real types.

type CheckResponse = {
  ok: boolean
  reason?: string
  message?: string
  problems?: string[]
  courseName?: string
  readCourseName?: string | null
  diff?: CardDiff
  /** 'create' when the course had no card and the photo is offered as one. */
  mode?: string
  newCard?: NewCard
  /** Stored tees with no colour, given the one the photo suggests. */
  teeColours?: TeeColourFill[]
}

type ApplyResponse = {
  ok: boolean
  message?: string
  holes?: unknown[] | null
  tees?: unknown[] | null
  rescored?: number
}

type Step =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "match" }
  | { kind: "diff"; diff: CardDiff; readCourseName: string | null; colours: TeeColourFill[] }
  | { kind: "new-card"; newCard: NewCard; readCourseName: string | null }
  | { kind: "applying" }
  | { kind: "done"; changed: number; rescored: number; reloadNeeded: boolean; created?: boolean }
  | { kind: "error"; message: string; problems: string[] }

/**
 * A photo, downscaled for the wire.
 *
 * 2400px on the long edge keeps the small figures legible — the whole point
 * — while a phone's straight-off-the-camera 12MP would be several times the
 * upload for no more reading accuracy.
 */
async function toJpegBase64(file: File): Promise<{ data: string; mediaType: string }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("unreadable image"))
      el.src = url
    })
    const MAX = 2400
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no canvas")
    ctx.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88)
    return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const isYardage = (c: HoleChange) => c.column.startsWith("yardage_")

export default function CardCheck({
  courseId, tripCode, onApplied, face = "row", summary, gateLine,
}: {
  courseId: string
  /** Scopes the re-score of already-committed cards. Absent on the legacy route. */
  tripCode?: string
  /** The corrected card, for the screens already holding the old one. */
  onApplied: (holes: unknown[], tees: unknown[]) => void
  /**
   * How it waits to be asked. `gate` — a course with no scorecard: the
   * screen's one emerald action (ScorecardGate draws it). `row` — a course
   * that has one: a quiet row, "Something wrong?", with a camera button.
   */
  face?: "gate" | "row"
  /** The row's first line — "Scorecard · 18 holes · par 72". */
  summary?: string
  /** The gate's line under its title. */
  gateLine?: string
}) {
  const [step, setStep] = useState<Step>({ kind: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File) {
    setStep({ kind: "reading" })
    try {
      const { data, mediaType } = await toJpegBase64(file)
      const res = await fetch("/api/card-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, image: data, mediaType }),
      })
      const body = (await res.json().catch(() => null)) as CheckResponse | null
      if (!body) throw new Error("no answer")
      if (!body.ok) {
        setStep({
          kind: "error",
          message: body.message ?? "Could not check the card — try again.",
          problems: body.problems ?? [],
        })
        return
      }
      if (body.mode === "create" && body.newCard) {
        // No card recorded: the photo is offered back whole, for a yes.
        setStep({ kind: "new-card", newCard: body.newCard, readCourseName: body.readCourseName ?? null })
        return
      }
      const diff = body.diff!
      const colours = body.teeColours ?? []
      if (diff.holeChanges.length === 0 && diff.teeChanges.length === 0 && colours.length === 0) {
        setStep({ kind: "match" })
      } else {
        setStep({ kind: "diff", diff, readCourseName: body.readCourseName ?? null, colours })
      }
    } catch {
      setStep({ kind: "error", message: "Could not check the card — try again.", problems: [] })
    }
  }

  async function apply(diff: CardDiff, colours: TeeColourFill[] = []) {
    setStep({ kind: "applying" })
    // Grouped here rather than in the route so what is sent is exactly what
    // was shown. Same shape lib/cardCheck.ts's holeUpdates/teeUpdates build.
    const holesByNumber = new Map<number, Record<string, number>>()
    for (const c of diff.holeChanges) {
      const f = holesByNumber.get(c.holeNumber) ?? {}
      f[c.column] = c.to
      holesByNumber.set(c.holeNumber, f)
    }
    const teesById = new Map<string, Record<string, number>>()
    for (const c of diff.teeChanges) {
      const f = teesById.get(c.teeId) ?? {}
      f[c.column] = c.to
      teesById.set(c.teeId, f)
    }
    try {
      const res = await fetch("/api/card-check/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          tripCode: tripCode ?? "",
          holes: [...holesByNumber.entries()].map(([holeNumber, fields]) => ({ holeNumber, fields })),
          tees: [...teesById.entries()].map(([teeId, fields]) => ({ teeId, fields })),
          teeColours: colours.map(c => ({ teeId: c.teeId, colour: c.colour })),
        }),
      })
      const body = (await res.json().catch(() => null)) as ApplyResponse | null
      if (!body?.ok) {
        setStep({ kind: "error", message: body?.message ?? "Could not update the card — try again.", problems: [] })
        return
      }
      const reloadNeeded = !Array.isArray(body.holes) || !Array.isArray(body.tees)
      if (!reloadNeeded) onApplied(body.holes!, body.tees!)
      setStep({
        kind: "done",
        changed: diff.holeChanges.length + diff.teeChanges.length + colours.length,
        rescored: body.rescored ?? 0,
        reloadNeeded,
      })
    } catch {
      setStep({ kind: "error", message: "Could not update the card — try again.", problems: [] })
    }
  }

  async function applyNewCard(newCard: NewCard) {
    setStep({ kind: "applying" })
    try {
      const res = await fetch("/api/card-check/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          tripCode: tripCode ?? "",
          mode: "create",
          newHoles: newCard.holes,
          newTees: newCard.tees,
        }),
      })
      const body = (await res.json().catch(() => null)) as ApplyResponse | null
      if (!body?.ok) {
        setStep({ kind: "error", message: body?.message ?? "Could not save the card — try again.", problems: [] })
        return
      }
      const reloadNeeded = !Array.isArray(body.holes) || !Array.isArray(body.tees)
      if (!reloadNeeded) onApplied(body.holes!, body.tees!)
      setStep({ kind: "done", changed: newCard.holes.length, rescored: 0, reloadNeeded, created: true })
    } catch {
      setStep({ kind: "error", message: "Could not save the card — try again.", problems: [] })
    }
  }

  const camera = <IconCamera size={20} />
  // A tee's suggested colour as a dot, ringed so a pale one still shows.
  const swatch = (colour?: string | null) => colour
    ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-1 ring-line-strong" style={{ backgroundColor: colour }} aria-hidden="true" />
    : null

  // One hidden input serves every photo — first, or another after a bad one.
  // No `capture` attribute on purpose: the phone offers camera or library.
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ""
        if (f) onFile(f)
      }}
    />
  )

  const takePhoto = (label: string) => (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className={buttonClass("secondary", false, true)}
    >
      {camera}
      {label}
    </button>
  )

  if (step.kind === "idle") {
    if (face === "gate") {
      return (
        <div className={`${cardClass("raised")} p-5 flex flex-col gap-4`}>
          {fileInput}
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-tile bg-tint text-ink/65 flex items-center justify-center flex-shrink-0" aria-hidden>
              {camera}
            </span>
            <div className="min-w-0">
              <p className="t-card text-ink">{GATE_TITLE.none}</p>
              <p className="t-cap text-ink/65 mt-1 leading-snug">{gateLine}</p>
            </div>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()} className={buttonClass("primary")}>
            Photograph the scorecard
          </button>
        </div>
      )
    }
    return (
      <div className="bg-tint rounded-card px-4 py-3 flex items-center justify-between gap-3">
        {fileInput}
        <div className="min-w-0">
          {summary && <p className="t-label text-ink">{summary}</p>}
          <p className="t-cap text-ink/65 leading-snug">Something wrong? Check it against a photo.</p>
        </div>
        <button
          type="button"
          aria-label="Check the scorecard against a photo"
          title="Check the scorecard against a photo"
          onClick={() => inputRef.current?.click()}
          className="w-11 h-11 rounded-tile bg-surface shadow-raised text-ink/80 flex items-center justify-center flex-shrink-0 press"
        >
          {camera}
        </button>
      </div>
    )
  }

  if (step.kind === "reading" || step.kind === "applying") {
    return (
      <div className={`${cardClass("raised")} px-4 py-3 flex items-center gap-3`}>
        <span className="w-2 h-2 rounded-full bg-accent dot-live flex-shrink-0" />
        <p className="text-ink/80 text-sm">
          {step.kind === "reading" ? "Reading the card…" : "Updating the card…"}
        </p>
      </div>
    )
  }

  if (step.kind === "match") {
    return (
      <div className={`${cardClass("chosen")} px-4 py-3 flex items-center justify-between gap-3`}>
        {fileInput}
        <p className="text-accent-deep text-sm">✓ The card matches the photo — nothing to change.</p>
        {takePhoto("Retake")}
      </div>
    )
  }

  if (step.kind === "error") {
    return (
      <div className={`${cardClass("raised")} px-4 py-3 space-y-2`}>
        {fileInput}
        <p className="text-rust-deep text-sm">{step.message}</p>
        {step.problems.length > 0 && (
          <ul className="text-ink/65 text-sm space-y-0.5">
            {step.problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        )}
        <div className="flex items-center gap-3 pt-1">
          {takePhoto("Try another photo")}
          <button
            type="button"
            onClick={() => setStep({ kind: "idle" })}
            className={buttonClass("quiet", false, true)}
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (step.kind === "done") {
    return (
      <div className={`${cardClass("chosen")} px-4 py-3`}>
        {fileInput}
        <p className="text-accent-deep text-sm">
          {step.created
            ? "✓ Card saved — this course is set up and verified."
            : `✓ Card updated to match the photo${step.rescored > 0 ? ` — ${step.rescored} saved scores re-scored.` : "."}`}
        </p>
        {step.reloadNeeded && (
          <p className="text-ink/65 text-sm mt-1">Reload the page to see the corrected card.</p>
        )}
      </div>
    )
  }

  // ── A course with no card: the photo becomes one, on a yes ──
  if (step.kind === "new-card") {
    const { newCard } = step
    const parTotal = newCard.holes.reduce((s, h) => s + h.par, 0)
    const ladiesTotal = newCard.holes.every(h => h.par_ladies != null)
      ? newCard.holes.reduce((s, h) => s + (h.par_ladies ?? 0), 0)
      : null
    const genderWord = (g: string) => (g === "F" ? "ladies" : "men's")
    return (
      <div className={`${cardClass("raised")} px-4 py-4 space-y-3`}>
        {fileInput}
        <p className="text-ink text-sm font-semibold">
          No card is recorded for this course yet. The photo reads
          {step.readCourseName ? ` (${step.readCourseName})` : ""}:
        </p>
        <ul className="text-ink/80 text-sm space-y-1 tabular-nums">
          <li>18 holes, par {parTotal}{ladiesTotal != null ? ` — ladies par ${ladiesTotal}` : ""}</li>
          {newCard.tees.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              {swatch(t.colour)}
              <span>{t.name} tee ({genderWord(t.gender)}) — par {t.par}, CR {t.course_rating}, slope {t.slope}</span>
            </li>
          ))}
        </ul>
        {newCard.skippedTees.length > 0 && (
          <p className="text-ink/50 text-sm">
            On the card without printed ratings, so not recorded: {newCard.skippedTees.join(", ")}.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => applyNewCard(newCard)}
            className={`${buttonClass("primary", false, true)} flex-1`}
          >
            Save this card
          </button>
          <button
            type="button"
            onClick={() => setStep({ kind: "idle" })}
            className={buttonClass("secondary", false, true)}
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  // ── The difference, and the question ──
  const { diff, colours } = step
  const scoringChanges = diff.holeChanges.filter(c => !isYardage(c))
  const yardageChanges = diff.holeChanges.filter(isYardage)
  const yardageByTee = new Map<string, number>()
  for (const c of yardageChanges) {
    yardageByTee.set(c.label, (yardageByTee.get(c.label) ?? 0) + 1)
  }
  const genderWord = (g: string) => (g === "F" ? "ladies" : "men's")

  return (
    <div className={`${cardClass("raised")} px-4 py-4 space-y-3`}>
      {fileInput}
      <p className="text-ink text-sm font-semibold">
        {diff.holeChanges.length + diff.teeChanges.length === 0
          ? "The card matches the photo"
          : "The photo disagrees with the recorded card"}
        {step.readCourseName ? ` (${step.readCourseName})` : ""}
        {diff.holeChanges.length + diff.teeChanges.length === 0 ? "." : ":"}
      </p>

      {scoringChanges.length > 0 && (
        <ul className="text-ink/80 text-sm space-y-1 tabular-nums">
          {scoringChanges.map((c, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="text-ink/50 w-14 flex-shrink-0">Hole {c.holeNumber}</span>
              <span>{c.label}</span>
              <span className="ml-auto">
                {c.from == null ? "—" : c.from} → <span className="font-semibold text-accent-deep">{c.to}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {diff.teeChanges.length > 0 && (
        <ul className="text-ink/80 text-sm space-y-1 tabular-nums">
          {diff.teeChanges.map((c, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="text-ink/50 flex-shrink-0">{c.teeName} tee ({genderWord(c.gender)})</span>
              <span>{c.label}</span>
              <span className="ml-auto">
                {c.from} → <span className="font-semibold text-accent-deep">{c.to}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {yardageByTee.size > 0 && (
        <p className="text-ink/65 text-sm">
          Yardages: {[...yardageByTee.entries()].map(([label, n]) => `${label} on ${n} hole${n === 1 ? "" : "s"}`).join(", ")}.
        </p>
      )}

      {/* Colours for tees that have none yet — read off the card, or
          worked out from a name like Granite or Sandstone. */}
      {colours.length > 0 && (
        <div className="space-y-1">
          <p className="text-ink/65 text-sm">Tee colours, from the card:</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink/80 text-sm">
            {colours.map(c => (
              <li key={c.teeId} className="flex items-center gap-1.5">
                {swatch(c.colour)}
                {c.teeName} ({genderWord(c.gender)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.unmatchedTees.length > 0 && (
        <p className="text-ink/50 text-sm">
          On the card but not recorded here: {diff.unmatchedTees.join(", ")}.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => apply(diff, colours)}
          className={`${buttonClass("primary", false, true)} flex-1`}
        >
          {diff.holeChanges.length + diff.teeChanges.length === 0 ? "Save the colours" : "Use the photo\u2019s card"}
        </button>
        <button
          type="button"
          onClick={() => setStep({ kind: "idle" })}
          className={buttonClass("secondary", false, true)}
        >
          Keep current
        </button>
      </div>
    </div>
  )
}
