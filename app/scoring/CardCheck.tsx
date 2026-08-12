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
import type { CardDiff, HoleChange, NewCard } from "@/lib/cardCheck"

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
  | { kind: "diff"; diff: CardDiff; readCourseName: string | null }
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
  courseId, tripCode, onApplied,
}: {
  courseId: string
  /** Scopes the re-score of already-committed cards. Absent on the legacy route. */
  tripCode?: string
  /** The corrected card, for the screens already holding the old one. */
  onApplied: (holes: unknown[], tees: unknown[]) => void
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
      if (diff.holeChanges.length === 0 && diff.teeChanges.length === 0) {
        setStep({ kind: "match" })
      } else {
        setStep({ kind: "diff", diff, readCourseName: body.readCourseName ?? null })
      }
    } catch {
      setStep({ kind: "error", message: "Could not check the card — try again.", problems: [] })
    }
  }

  async function apply(diff: CardDiff) {
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
        changed: diff.holeChanges.length + diff.teeChanges.length,
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

  const camera = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )

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
      className="flex items-center gap-2 px-4 py-2.5 border border-accent/40 text-accent-deep text-sm tracking-[0.15em] uppercase hover:bg-accent/10 transition-colors rounded-xl"
    >
      {camera}
      {label}
    </button>
  )

  if (step.kind === "idle") {
    return (
      <div className="border border-bark/12 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        {fileInput}
        <p className="text-ink/65 text-sm leading-snug min-w-0">
          Check pars, indices and slopes against the printed card before anyone tees off.
        </p>
        {takePhoto("Confirm card")}
      </div>
    )
  }

  if (step.kind === "reading" || step.kind === "applying") {
    return (
      <div className="border border-bark/12 rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-accent dot-live flex-shrink-0" />
        <p className="text-ink/80 text-sm">
          {step.kind === "reading" ? "Reading the card…" : "Updating the card…"}
        </p>
      </div>
    )
  }

  if (step.kind === "match") {
    return (
      <div className="border border-accent/30 bg-accent/[0.07] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        {fileInput}
        <p className="text-accent-deep text-sm">✓ The card matches the photo — nothing to change.</p>
        {takePhoto("Retake")}
      </div>
    )
  }

  if (step.kind === "error") {
    return (
      <div className="border border-rust/40 bg-rust/[0.06] rounded-xl px-4 py-3 space-y-2">
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
            className="text-ink/50 text-sm tracking-widest uppercase hover:text-ink/80 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (step.kind === "done") {
    return (
      <div className="border border-accent/30 bg-accent/[0.07] rounded-xl px-4 py-3">
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
      <div className="border border-accent/40 bg-accent/[0.05] rounded-xl px-4 py-4 space-y-3">
        {fileInput}
        <p className="text-ink text-sm font-semibold">
          No card is recorded for this course yet. The photo reads
          {step.readCourseName ? ` (${step.readCourseName})` : ""}:
        </p>
        <ul className="text-ink/80 text-sm space-y-1 tabular-nums">
          <li>18 holes, par {parTotal}{ladiesTotal != null ? ` — ladies par ${ladiesTotal}` : ""}</li>
          {newCard.tees.map((t, i) => (
            <li key={i}>
              {t.name} tee ({genderWord(t.gender)}) — par {t.par}, CR {t.course_rating}, slope {t.slope}
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
            className="flex-1 py-2.5 bg-accent-deep text-ink text-sm tracking-[0.15em] uppercase hover:bg-accent transition-colors rounded-xl"
          >
            Save this card
          </button>
          <button
            type="button"
            onClick={() => setStep({ kind: "idle" })}
            className="px-4 py-2.5 text-ink/65 text-sm tracking-[0.15em] uppercase border border-bark/12 hover:border-bark/25 transition-colors rounded-xl"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  // ── The difference, and the question ──
  const { diff } = step
  const scoringChanges = diff.holeChanges.filter(c => !isYardage(c))
  const yardageChanges = diff.holeChanges.filter(isYardage)
  const yardageByTee = new Map<string, number>()
  for (const c of yardageChanges) {
    yardageByTee.set(c.label, (yardageByTee.get(c.label) ?? 0) + 1)
  }
  const genderWord = (g: string) => (g === "F" ? "ladies" : "men's")

  return (
    <div className="border border-accent/40 bg-accent/[0.05] rounded-xl px-4 py-4 space-y-3">
      {fileInput}
      <p className="text-ink text-sm font-semibold">
        The photo disagrees with the recorded card
        {step.readCourseName ? ` (${step.readCourseName})` : ""}:
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

      {diff.unmatchedTees.length > 0 && (
        <p className="text-ink/50 text-sm">
          On the card but not recorded here: {diff.unmatchedTees.join(", ")}.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => apply(diff)}
          className="flex-1 py-2.5 bg-accent-deep text-ink text-sm tracking-[0.15em] uppercase hover:bg-accent transition-colors rounded-xl"
        >
          Use the photo&apos;s card
        </button>
        <button
          type="button"
          onClick={() => setStep({ kind: "idle" })}
          className="px-4 py-2.5 text-ink/65 text-sm tracking-[0.15em] uppercase border border-bark/12 hover:border-bark/25 transition-colors rounded-xl"
        >
          Keep current
        </button>
      </div>
    </div>
  )
}
