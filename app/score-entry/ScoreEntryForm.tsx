"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { supabase } from "@/lib/supabase"
import BackButton from "@/app/components/BackButton"

// ─── Types ────────────────────────────────────────────────

interface Player { id: string; name: string; role: string; handicap: number; gender: string; is_composite: boolean }
interface Course  { id: string; name: string }
interface Tee     { id: string; name: string; gender: string; par: number; course_rating: number; slope: number }
interface Hole    {
  id: string; hole_number: number; par: number; stroke_index: number
  par_ladies?: number; stroke_index_ladies?: number
  yardage_black?: number; yardage_blue?: number; yardage_white?: number; yardage_red?: number
  yardage_sandstone?: number; yardage_slate?: number; yardage_granite?: number; yardage_claret?: number
}

const ST_PATRICKS_COURSE_ID = '11111111-0000-0000-0000-000000000003'

interface SubmittedSnapshot {
  playerName: string
  courseName: string
  teeName: string
  handicapIndex: number
  playingHcp: number
  roundNumber: number
  holes: Hole[]
  scores: (number | null)[]
  nrs: boolean[]
  yardages: Record<string, number>
  submittedAt: Date
}

// CSS filter to tint any image to gold (#C9A84C)
const GOLD_FILTER = "brightness(0) saturate(100%) invert(64%) sepia(36%) saturate(600%) hue-rotate(6deg) brightness(95%) contrast(88%)"

const COURSE_LOGO: Record<string, string> = {
  "Old Tom Morris":    "/oldtomlogo.png",
  "St Patricks Links": "/stpatrickslogo.png",
  "Sandy Hills":       "/sandyhillslogo.png",
}

type Phase = "selecting" | "entering" | "submitting" | "done"

// ─── Helpers ──────────────────────────────────────────────

/** WHS playing handicap formula */
function calcPlayingHandicap(hcpIndex: number, slope: number, courseRating: number, par: number): number {
  return Math.round(hcpIndex * (slope / 113) + (courseRating - par))
}

function shotsReceived(si: number, playingHcp: number): number {
  return Math.floor(playingHcp / 18) + (si <= playingHcp % 18 ? 1 : 0)
}

function calcStableford(gross: number, par: number, si: number, playingHcp: number): number {
  return Math.max(0, par + 2 - (gross - shotsReceived(si, playingHcp)))
}

function nrGross(par: number, si: number, playingHcp: number): number {
  return par + 2 + shotsReceived(si, playingHcp)
}

function scoreToPar(gross: number, par: number) {
  const diff = gross - par
  if (diff <= -2) return { label: "Eagle",  color: "text-emerald-400" }
  if (diff === -1) return { label: "Birdie", color: "text-[#C9A84C]" }
  if (diff === 0)  return { label: "Par",    color: "text-white/60" }
  if (diff === 1)  return { label: "Bogey",  color: "text-orange-400/70" }
  return { label: `+${diff}`, color: "text-red-400/70" }
}

// ─── Tee colour map ───────────────────────────────────────

const TEE_STYLES: Record<string, { dot: string; active: string; text: string }> = {
  Black:     { dot: "bg-zinc-300",      active: "border-zinc-300 text-zinc-200",      text: "text-zinc-300" },
  Blue:      { dot: "bg-blue-400",      active: "border-blue-400 text-blue-300",      text: "text-blue-400" },
  White:     { dot: "bg-white",         active: "border-white text-white",             text: "text-white" },
  Red:       { dot: "bg-red-500",       active: "border-red-400 text-red-300",         text: "text-red-400" },
  Yellow:    { dot: "bg-yellow-400",    active: "border-yellow-400 text-yellow-300",   text: "text-yellow-400" },
  Sandstone: { dot: "bg-amber-300",     active: "border-amber-300 text-amber-200",     text: "text-amber-300" },
  Slate:     { dot: "bg-slate-400",     active: "border-slate-400 text-slate-300",     text: "text-slate-400" },
  Granite:   { dot: "bg-stone-400",     active: "border-stone-400 text-stone-300",     text: "text-stone-400" },
  Claret:    { dot: "bg-rose-800",      active: "border-rose-700 text-rose-300",       text: "text-rose-400" },
}

function teeStyle(name: string) {
  return TEE_STYLES[name] ?? { dot: "bg-white/40", active: "border-white/40 text-white/60", text: "text-white/60" }
}

// ─── Step dot ─────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border
      ${done   ? "bg-[#C9A84C] border-[#C9A84C] text-black"
      : active ? "border-[#C9A84C] text-[#C9A84C]"
               : "border-white/20 text-white/20"}`}>
      {done ? "✓" : n}
    </div>
  )
}

// ─── Accessibility toggle icon ────────────────────────────

function GlassesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="15" r="4" />
      <circle cx="18" cy="15" r="4" />
      <path d="M2 15c0-5 2-8 4-9h12c2 1 4 4 4 9" />
      <line x1="10" y1="15" x2="14" y2="15" />
    </svg>
  )
}

// ─── Submitted scorecard components ───────────────────────

function ScoreCell({ gross, par, pts, a11y }: { gross: number; par: number; pts: number; a11y: boolean }) {
  const diff = gross - par
  const numSz = a11y ? "text-xl" : "text-base"
  const f = `font-[family-name:var(--font-crimson)] leading-none ${numSz}`
  const ptsColor = a11y
    ? (pts >= 3 ? "text-green-900" : pts === 0 ? "text-red-700" : "text-gray-800")
    : (pts >= 3 ? "text-green-700" : pts === 0 ? "text-red-500" : "text-gray-500")

  let shape: React.ReactNode
  const sz   = a11y ? "w-12 h-12" : "w-9 h-9"
  const szSm = a11y ? "w-11 h-11" : "w-8 h-8"

  if (diff <= -2) {
    // Eagle: filled gold circle
    shape = (
      <span className={`inline-flex items-center justify-center ${sz} rounded-full bg-[#C9A84C]`}>
        <span className={`${f} font-semibold text-[#1a0a00]`}>{gross}</span>
      </span>
    )
  } else if (diff === -1) {
    // Birdie: open circle
    shape = (
      <span className={`inline-flex items-center justify-center ${sz} rounded-full border-2 ${a11y ? "border-green-900" : "border-[#2d6a4f]"}`}>
        <span className={`${f} ${a11y ? "text-green-900" : "text-[#1a5235]"}`}>{gross}</span>
      </span>
    )
  } else if (diff === 0) {
    shape = <span className={`${f} ${a11y ? "text-black" : "text-gray-700"}`}>{gross}</span>
  } else if (diff === 1) {
    // Bogey: open square
    shape = (
      <span className={`inline-flex items-center justify-center ${szSm} border ${a11y ? "border-2 border-black" : "border border-gray-600"}`}>
        <span className={`${f} ${a11y ? "text-black" : "text-gray-600"}`}>{gross}</span>
      </span>
    )
  } else {
    // Double bogey+: filled square
    shape = (
      <span className={`inline-flex items-center justify-center ${szSm} ${a11y ? "bg-black" : "bg-gray-600"}`}>
        <span className={`${f} text-white`}>{gross}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-start gap-0.5">
      {shape}
      <sup className={`${a11y ? "text-sm" : "text-xs"} font-bold leading-none mt-0.5 ${ptsColor}`}>{pts}</sup>
    </span>
  )
}

function SubtotalRow({ label, par, yards, gross, pts, isTotal, a11y, hasNR }: {
  label: string; par: number; yards: number | null; gross: number; pts: number; isTotal?: boolean; a11y: boolean; hasNR?: boolean
}) {
  const crimson = "font-[family-name:var(--font-crimson)]"
  const bg        = isTotal ? "bg-[#1a3a22]" : "bg-[#e8e2d4]"
  const textLabel = isTotal ? "text-white"   : "text-[#5a4a2a]"
  const textData  = isTotal ? "text-white"   : "text-gray-900"
  const textPts   = isTotal ? "text-[#C9A84C] font-bold" : "text-[#2d6a4f] font-semibold"
  const txNum = a11y ? "text-xl"   : "text-base"
  const txLbl = a11y ? "text-base" : "text-sm"
  const nrClr = isTotal ? "text-orange-300 border-orange-400/50" : "text-orange-700 border-orange-500/50"
  return (
    <tr className={`border-t-2 ${isTotal ? "border-[#0f2418]" : "border-[#C9A84C]/40"} ${bg}`}>
      <td className={`py-3 px-3 ${txLbl} uppercase tracking-wider font-bold ${textLabel} font-[family-name:var(--font-playfair)]`}>{label}</td>
      <td className={`text-center py-3 px-2 ${txNum} font-semibold ${textData} ${crimson}`}>{par}</td>
      <td className="py-3 px-2" />
      <td className={`text-center py-3 px-2 ${txLbl} ${textData} ${crimson}`}>{yards ?? "—"}</td>
      <td className={`text-center py-3 px-2 ${crimson}`}>
        {gross > 0 ? (
          <div className="inline-flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1">
              <span className={`${txNum} font-semibold ${textData}`}>{gross}</span>
              {hasNR && (
                <span className={`text-[10px] font-bold border rounded-sm px-0.5 leading-tight ${nrClr}`}>NR</span>
              )}
            </div>
            <span className={`${txLbl} ${textPts}`}>{pts}</span>
          </div>
        ) : "—"}
      </td>
    </tr>
  )
}

function SubmittedScorecard({ snapshot, a11y }: { snapshot: SubmittedSnapshot; a11y: boolean }) {
  const { playerName, courseName, handicapIndex, playingHcp, roundNumber, holes, scores, nrs, yardages, submittedAt } = snapshot
  const crimson  = "font-[family-name:var(--font-crimson)]"
  const playfair = "font-[family-name:var(--font-playfair)]"
  const front = holes.slice(0, 9)
  const back  = holes.slice(9, 18)

  const d = submittedAt
  const dateStr = `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`

  // Size tokens — normal is substantially bigger than before; a11y = maximum
  const txLabel  = a11y ? "text-sm"   : "text-[11px]" // section labels (Competition, Player…)
  const txHdr    = a11y ? "text-xl"   : "text-base"   // header row data values
  const txHcp    = a11y ? "text-base" : "text-sm"     // handicap values
  const txTblHdr = a11y ? "text-sm"   : "text-xs"     // table column headings
  const txNum    = a11y ? "text-xl"   : "text-base"   // hole numbers, par, gross
  const txSi     = a11y ? "text-base" : "text-sm"     // SI and yardage

  function holePts(i: number): number {
    if (nrs[i] || scores[i] === null) return 0
    return calcStableford(scores[i]!, holes[i].par, holes[i].stroke_index, playingHcp)
  }
  function holeGrossVal(i: number): number {
    if (nrs[i]) return nrGross(holes[i].par, holes[i].stroke_index, playingHcp)
    return scores[i] ?? 0
  }
  function sumGross(offset: number, len: number) { let t = 0; for (let j = 0; j < len; j++) t += holeGrossVal(offset + j); return t }
  function sumPts(offset: number, len: number)   { let t = 0; for (let j = 0; j < len; j++) t += holePts(offset + j);    return t }
  function sumPar(hs: Hole[])   { return hs.reduce((s, h) => s + h.par, 0) }
  function sumYards(hs: Hole[]) {
    let t = 0; for (const h of hs) { const y = yardages[h.id]; if (!y) return null; t += y }; return t
  }

  const outPar = sumPar(front), inPar = sumPar(back)
  const outYards = sumYards(front), inYards = sumYards(back)
  const totalYards = outYards != null && inYards != null ? outYards + inYards : null
  const outHasNR   = nrs.slice(0, 9).some(Boolean)
  const inHasNR    = nrs.slice(9, 18).some(Boolean)
  const totalHasNR = nrs.some(Boolean)

  // Gold bar that doesn't reach the card edges
  function GoldBar() {
    return <div className="mx-4 h-[2px] bg-[#C9A84C]" />
  }

  function HoleRow({ hole, i, alt }: { hole: Hole; i: number; alt: boolean }) {
    const pts  = holePts(i)
    const isNR = nrs[i]
    return (
      <tr className={`border-t border-[#d8d0be] ${alt ? "bg-[#f5f0e6]" : "bg-[#fdfaf4]"}`}>
        <td className={`py-3 px-3 ${txNum} font-bold text-gray-900 ${crimson}`}>{hole.hole_number}</td>
        <td className={`text-center py-3 px-2 ${txNum} font-semibold text-gray-900 ${crimson}`}>{hole.par}</td>
        <td className={`text-center py-3 px-2 ${txSi} text-[#7a6a4a] ${crimson}`}>{hole.stroke_index}</td>
        <td className={`text-center py-3 px-2 ${txSi} text-[#7a6a4a] ${crimson}`}>{yardages[hole.id] ?? "—"}</td>
        <td className="text-center py-2 px-2">
          {isNR
            ? <span className={`text-orange-700 ${txNum} font-bold ${crimson}`}>NR</span>
            : scores[i] !== null
              ? <ScoreCell gross={scores[i]!} par={hole.par} pts={pts} a11y={a11y} />
              : <span className={`text-[#7a6a4a] ${txNum}`}>—</span>
          }
        </td>
      </tr>
    )
  }

  return (
    <div
      className="rounded-xl shadow-2xl overflow-hidden"
      style={{ background: "linear-gradient(160deg, #fdfaf4 0%, #f5f1e8 50%, #faf7f0 100%)" }}
    >
      {/* ── Top bar: course name (full-bleed dark green) ── */}
      <div className="bg-[#1a3a22] px-4 py-3 text-center">
        <span className={`${playfair} ${a11y ? "text-xl" : "text-base"} font-semibold text-white tracking-wide`}>
          {courseName}
        </span>
      </div>

      {/* ── Header section — inset gold bars, 60/40 split ── */}
      <div className="pt-4 pb-2">

        <GoldBar />

        {/* Competition (60%) | Date (40%) */}
        <div className="grid grid-cols-[3fr_2fr] px-4 py-3">
          <div className="pr-4 border-r-2 border-[#C9A84C]">
            <div className={`${txLabel} text-[#8a7255] uppercase tracking-wider font-bold ${playfair} mb-1`}>Competition</div>
            <div className={`${txHdr} font-semibold text-gray-900 ${playfair}`}>Donegal Masters — Day {roundNumber}</div>
          </div>
          <div className="pl-4">
            <div className={`${txLabel} text-[#8a7255] uppercase tracking-wider font-bold ${playfair} mb-1`}>Date</div>
            <div className={`${txHdr} font-semibold text-gray-900 ${crimson}`}>{dateStr}</div>
          </div>
        </div>

        <GoldBar />

        {/* Player (60%) | Handicap (40%) */}
        <div className="grid grid-cols-[3fr_2fr] px-4 py-3">
          <div className="pr-4 border-r-2 border-[#C9A84C]">
            <div className={`${txLabel} text-[#8a7255] uppercase tracking-wider font-bold ${playfair} mb-1`}>Player</div>
            <div className={`${txHdr} font-bold text-gray-900 ${playfair}`}>{playerName}</div>
          </div>
          <div className="pl-4 flex flex-col justify-center gap-1">
            <div className={`${txLabel} text-[#8a7255] uppercase tracking-wider font-bold ${playfair} mb-0.5`}>Handicap</div>
            <div className={`${txHcp} text-gray-800 ${crimson}`}>
              Index: <span className="font-bold text-gray-900">{handicapIndex}</span>
            </div>
            <div className={`${txHcp} text-gray-800 ${crimson}`}>
              Playing: <span className="font-bold text-gray-900">{playingHcp}</span>
            </div>
          </div>
        </div>

        <GoldBar />
      </div>

      {/* ── Hole table (full-bleed) ── */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#e8e0cc]">
            <th className={`text-left py-2.5 px-3 ${txTblHdr} font-bold text-[#6b5530] uppercase tracking-wide ${playfair} w-10`}>Hole</th>
            <th className={`text-center py-2.5 px-2 ${txTblHdr} font-bold text-[#6b5530] uppercase tracking-wide w-10`}>Par</th>
            <th className={`text-center py-2.5 px-2 ${txTblHdr} font-bold text-[#6b5530] uppercase tracking-wide w-9`}>SI</th>
            <th className={`text-center py-2.5 px-2 ${txTblHdr} font-bold text-[#6b5530] uppercase tracking-wide w-16`}>Yds</th>
            <th className={`text-center py-2.5 px-2 ${txTblHdr} font-bold text-[#6b5530] uppercase tracking-wide`}>Score</th>
          </tr>
        </thead>
        <tbody>
          {front.map((hole, j) => <HoleRow key={hole.id} hole={hole} i={j}   alt={j % 2 !== 0} />)}
          <SubtotalRow label="Out"   par={outPar}         yards={outYards}   gross={sumGross(0, 9)}  pts={sumPts(0, 9)}  a11y={a11y} hasNR={outHasNR} />
          {back.map((hole,  j) => <HoleRow key={hole.id} hole={hole} i={9+j} alt={j % 2 !== 0} />)}
          <SubtotalRow label="In"    par={inPar}          yards={inYards}    gross={sumGross(9, 9)}  pts={sumPts(9, 9)}  a11y={a11y} hasNR={inHasNR} />
          <SubtotalRow label="Total" par={outPar + inPar} yards={totalYards} gross={sumGross(0, 18)} pts={sumPts(0, 18)} a11y={a11y} isTotal hasNR={totalHasNR} />
        </tbody>
      </table>

      {/* ── Footer (matches top bar) ── */}
      <div className="bg-[#1a3a22] px-4 py-2 text-center">
        <span className={`${a11y ? "text-xs" : "text-[11px]"} uppercase tracking-[0.25em] font-bold text-[#C9A84C] ${playfair}`}>
          Stableford
        </span>
      </div>
    </div>
  )
}

// ─── Hole card ────────────────────────────────────────────

function HoleCard({
  hole, score, isNR, playingHcp, yardage,
  onChange, onToggleNR,
}: {
  hole: Hole; score: number | null; isNR: boolean; playingHcp: number; yardage?: number
  onChange: (v: number | null) => void
  onToggleNR: () => void
}) {
  const netParGross = hole.par + shotsReceived(hole.stroke_index, playingHcp)
  const hasScore = score !== null

  const pts = isNR ? 0 : hasScore ? calcStableford(score, hole.par, hole.stroke_index, playingHcp) : null
  const { label, color } = isNR
    ? { label: "No Return", color: "text-orange-400/70" }
    : hasScore ? scoreToPar(score, hole.par)
    : { label: "", color: "" }

  // Mobile pts badge (border style)
  const ptsBadgeMobile =
    isNR         ? "border-orange-900/50 bg-orange-900/30 text-orange-400/80" :
    pts === null ? "border-white/10 text-white/15" :
    pts >= 3     ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]" :
    pts === 2    ? "border-white/20 bg-white/5 text-white" :
    pts === 1    ? "border-white/10 bg-transparent text-white/40" :
                   "border-red-900/40 bg-red-900/20 text-red-400/70"

  // Desktop pts badge (filled square, original style)
  const ptsBadgeDesktop =
    isNR         ? "bg-orange-900/40 text-orange-400/70" :
    pts === null ? "bg-transparent text-white/15" :
    pts >= 3     ? "bg-[#C9A84C] text-black" :
    pts === 2    ? "bg-white/10 text-white" :
    pts === 1    ? "bg-white/5 text-white/50" :
                   "bg-red-900/30 text-red-400/70"

  function handleStep(delta: number) {
    if (isNR) return
    if (score === null) onChange(netParGross)
    else onChange(Math.max(1, Math.min(12, score + delta)))
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (v === "") { onChange(null); return }
    const n = parseInt(v, 10)
    if (!isNaN(n) && n >= 1 && n <= 12) onChange(n)
  }

  // Shared sub-components rendered in both layouts
  const nrButton = (extra: string) => (
    <button
      onClick={onToggleNR}
      className={`text-xs tracking-widest uppercase border rounded-sm transition-colors ${extra}
        ${isNR
          ? "border-orange-400/60 text-orange-400 bg-orange-900/20"
          : "border-white/15 text-white/30 hover:border-orange-400/40 hover:text-orange-400/60"}`}>
      NR
    </button>
  )

  const scoreInput = (cls: string, lineH: string) => isNR ? (
    <span className={`font-[family-name:var(--font-playfair)] text-4xl flex items-center justify-center text-white/20 ${cls}`}>
      —
    </span>
  ) : (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={score === null ? "" : String(score)}
      onChange={handleInputChange}
      className={`font-[family-name:var(--font-playfair)] text-4xl text-center bg-transparent
        outline-none text-white caret-[#C9A84C] border rounded-sm transition-colors p-0
        ${score === null ? "border-[#C9A84C]/50" : "border-[#C9A84C]/15"} ${cls}`}
      style={{ lineHeight: lineH }}
    />
  )

  return (
    <div className={`bg-[#0f2418] border rounded-sm transition-colors
      ${isNR ? "border-orange-900/50" : "border-[#1e3d28]"}`}>

      {/* ══ MOBILE LAYOUT — single column, 3 rows (hidden at sm+) ══ */}
      <div className="sm:hidden">

        {/* Row 1: hole info + NR toggle */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-baseline gap-3">
            <span className="font-[family-name:var(--font-playfair)] text-3xl text-white leading-none w-8">
              {hole.hole_number}
            </span>
            <span className="text-white/50 text-sm">
              Par <span className="text-white font-semibold">{hole.par}</span>
            </span>
            <span className="text-white/30 text-sm">SI {hole.stroke_index}</span>
            {yardage && <span className="text-white/25 text-xs">{yardage} yds</span>}
          </div>
          {nrButton("px-3 py-1.5")}
        </div>

        {/* Row 2: score stepper — buttons flex to fill width */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <button onClick={() => handleStep(-1)} disabled={isNR}
            className="flex-1 h-16 rounded-sm border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed">
            −
          </button>
          {scoreInput("w-20 h-16", "4rem")}
          <button onClick={() => handleStep(1)} disabled={isNR}
            className="flex-1 h-16 rounded-sm border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed">
            +
          </button>
        </div>

        {/* Row 3: score label + stableford pts */}
        <div className="flex items-center justify-between px-4 pb-4">
          <span className={`text-sm font-semibold ${color || "text-white/15"}`}>
            {label || "—"}
          </span>
          <div className={`flex items-baseline gap-1.5 px-3 py-1.5 rounded-sm border ${ptsBadgeMobile}`}>
            <span className="text-xl font-bold leading-none font-[family-name:var(--font-playfair)]">
              {pts ?? "·"}
            </span>
            <span className="text-xs opacity-60 leading-none">pts</span>
          </div>
        </div>
      </div>

      {/* ══ DESKTOP LAYOUT — single horizontal row (hidden below sm) ══ */}
      <div className="hidden sm:flex items-center gap-3 px-4 py-4">

        {/* Hole badge */}
        <div className="flex flex-col items-center justify-center w-9 flex-shrink-0">
          <span className="font-[family-name:var(--font-playfair)] text-2xl text-white leading-none">
            {hole.hole_number}
          </span>
          <span className="text-white/20 text-[10px] uppercase tracking-widest mt-0.5">hole</span>
        </div>

        {/* Hole info */}
        <div className="flex flex-col gap-0.5 w-16 flex-shrink-0">
          <span className="text-white/60 text-sm">Par <span className="text-white font-semibold">{hole.par}</span></span>
          <span className="text-white/50 text-xs">SI {hole.stroke_index}</span>
          {yardage && <span className="text-white/50 text-xs">{yardage} yds</span>}
          {label && label !== "Par" && (
            <span className={`text-xs font-semibold mt-0.5 ${color}`}>{label}</span>
          )}
        </div>

        {/* Score stepper + NR */}
        <div className="flex items-center gap-2 flex-1 justify-center">
          <button onClick={() => handleStep(-1)} disabled={isNR}
            className="w-14 h-14 rounded-full border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed">
            −
          </button>
          {scoreInput("w-14 h-14", "3.5rem")}
          <button onClick={() => handleStep(1)} disabled={isNR}
            className="w-14 h-14 rounded-full border border-[#1e3d28] text-white/60 text-4xl leading-none
              hover:border-[#C9A84C] hover:text-[#C9A84C] active:scale-95 transition-all
              flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed">
            +
          </button>
          {nrButton("px-2 py-1.5 flex-shrink-0")}
        </div>

        {/* Stableford badge */}
        <div className={`w-9 h-9 rounded-sm flex flex-col items-center justify-center flex-shrink-0 ${ptsBadgeDesktop}`}>
          <span className="text-base font-bold leading-none">{pts ?? "·"}</span>
          <span className="text-[10px] opacity-60 leading-none mt-0.5">{pts !== null || isNR ? "pts" : ""}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────

export default function ScoreEntryForm({ players, courses }: { players: Player[]; courses: Course[] }) {
  const [phase, setPhase]       = useState<Phase>("selecting")
  const [playerId, setPlayerId] = useState("")
  const [courseId, setCourseId] = useState("")
  const [teeId, setTeeId]       = useState("")
  const [tees, setTees]         = useState<Tee[]>([])
  const [roundId, setRoundId]       = useState("")
  const [roundNumber, setRoundNumber] = useState(1)
  const [holes, setHoles]       = useState<Hole[]>([])
  const [scores, setScores]     = useState<(number | null)[]>([])
  const [nrs, setNRs]           = useState<boolean[]>([])
  const [yardages, setYardages] = useState<Record<string, number>>({})
  const [error, setError]           = useState<string | null>(null)
  const [snapshot, setSnapshot]     = useState<SubmittedSnapshot | null>(null)
  const [a11y, setA11y]             = useState(false)
  const isFirstRender = useRef(true)

  // Scroll to top on mount
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }) }, [])

  // Scroll to top when entering hole-entry or submitted-scorecard view
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (phase === "entering" || phase === "done") window.scrollTo({ top: 0, behavior: "instant" })
  }, [phase])

  const nonCompositePlayers = players.filter(p => !p.is_composite)
  const player      = players.find(p => p.id === playerId)
  const course      = courses.find(c => c.id === courseId)
  const selectedTee = tees.find(t => t.id === teeId)

  const playerGender = player?.gender ?? null
  const filteredTees = playerGender ? tees.filter(t => t.gender === playerGender) : tees

  const playingHcp = selectedTee && player
    ? calcPlayingHandicap(player.handicap, selectedTee.slope, selectedTee.course_rating, selectedTee.par)
    : Math.round(player?.handicap ?? 0)

  // Fetch tees when course or player changes, auto-default by role
  useEffect(() => {
    if (!courseId) { setTees([]); setTeeId(""); return }

    supabase
      .from("tees")
      .select("id, name, gender, par, course_rating, slope")
      .eq("course_id", courseId)
      .order("slope", { ascending: false }) // hardest → easiest
      .then(({ data }) => {
        const list = data ?? []
        setTees(list)
        if (!list.length) return

        setTeeId("")
      })
  }, [courseId, playerId])

  // ── Step 1 → Step 2 ──────────────────────────────────────
  async function handleStart() {
    if (!playerId || !courseId || !teeId) return
    setError(null)

    const [{ data: holeData, error: holesError }, { data: roundData }] = await Promise.all([
      supabase
        .from("holes")
        .select("id, hole_number, par, stroke_index, par_ladies, stroke_index_ladies, yardage_black, yardage_blue, yardage_white, yardage_red, yardage_sandstone, yardage_slate, yardage_granite, yardage_claret")
        .eq("course_id", courseId)
        .order("hole_number"),
      supabase.from("rounds").select("id, round_number").eq("course_id", courseId).single(),
    ])

    if (holesError || !holeData?.length) {
      setError("Could not load holes for this course.")
      return
    }

    const teeCol = `yardage_${selectedTee?.name.toLowerCase()}` as keyof Hole
    const yardageMap: Record<string, number> = {}
    for (const h of holeData) {
      const y = h[teeCol as keyof typeof h] as number | undefined
      if (y) yardageMap[h.id] = y
    }

    // Use ladies par/stroke_index for female players on St Patrick's course
    const isLadies = player?.gender === 'F' && courseId === ST_PATRICKS_COURSE_ID
    const resolvedHoles = isLadies
      ? holeData.map(h => ({
          ...h,
          par:          h.par_ladies          ?? h.par,
          stroke_index: h.stroke_index_ladies ?? h.stroke_index,
        }))
      : holeData

    setRoundId(roundData?.id ?? "")
    setRoundNumber(roundData?.round_number ?? 1)
    setHoles(resolvedHoles)
    setYardages(yardageMap)
    setScores(holeData.map(() => null))
    setNRs(holeData.map(() => false))
    setPhase("entering")
  }

  function toggleNR(i: number) {
    setNRs(prev => prev.map((v, j) => j === i ? !v : v))
  }

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit() {
    if (!player || !roundId) return
    setPhase("submitting")
    setError(null)

    await supabase.from("round_handicaps").upsert(
      { round_id: roundId, player_id: playerId, playing_handicap: playingHcp, tee_id: teeId || null },
      { onConflict: "round_id,player_id" }
    )

    await supabase.from("scores").delete().eq("player_id", playerId).eq("round_id", roundId)

    const rows = holes.map((hole, i) => ({
      round_id:    roundId,
      player_id:   playerId,
      hole_id:     hole.id,
      gross_score: nrs[i] ? nrGross(hole.par, hole.stroke_index, playingHcp)
                           : (scores[i] ?? hole.par + shotsReceived(hole.stroke_index, playingHcp)),
      no_return:   nrs[i],
    }))

    const { error } = await supabase
      .from("scores")
      .upsert(rows, { onConflict: "round_id,player_id,hole_id" })

    if (error) { setError(error.message); setPhase("entering"); return }

    setSnapshot({
      playerName:    player.name,
      courseName:    course?.name ?? "",
      teeName:       selectedTee?.name ?? "",
      handicapIndex: player.handicap,
      playingHcp,
      roundNumber,
      holes:       [...holes],
      scores:      [...scores],
      nrs:         [...nrs],
      yardages:    { ...yardages },
      submittedAt: new Date(),
    })
    setPhase("done")
  }

  // ── Running totals ────────────────────────────────────────
  const hasAnyNR = nrs.some(Boolean)

  const totalGross = holes.reduce((sum, h, i) => {
    if (nrs[i]) return sum + nrGross(h.par, h.stroke_index, playingHcp)
    return scores[i] !== null ? sum + scores[i]! : sum
  }, 0)

  const totalPts = holes.reduce((sum, h, i) => {
    if (nrs[i] || scores[i] === null) return sum
    return sum + calcStableford(scores[i]!, h.par, h.stroke_index, playingHcp)
  }, 0)

  // ── Render ────────────────────────────────────────────────

  if (phase === "done") {
    const snapPts = snapshot
      ? snapshot.holes.reduce((sum, h, i) => {
          if (snapshot.nrs[i] || snapshot.scores[i] === null) return sum
          return sum + calcStableford(snapshot.scores[i]!, h.par, h.stroke_index, snapshot.playingHcp)
        }, 0)
      : 0
    const snapHasNR = snapshot?.nrs.some(Boolean) ?? false
    const logo = snapshot ? COURSE_LOGO[snapshot.courseName] : undefined

    return (
      <div className="w-full max-w-lg mx-auto px-4 pb-24">

        {/* ── Header section ── */}
        <div className="flex flex-col items-center text-center pt-10 pb-6 gap-5">

          {/* Course logo — tinted gold */}
          {logo && (
            <Image src={logo} alt={snapshot!.courseName} width={80} height={80} className="object-contain" style={{ filter: GOLD_FILTER }} />
          )}

          {/* Title */}
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl text-white tracking-wide">
            Scorecard Submitted
          </h2>

          {/* Button */}
          <button
            onClick={() => { setPhase("selecting"); setPlayerId(""); setCourseId(""); setTeeId(""); setRoundId("") }}
            className="px-8 py-3 border border-[#C9A84C] text-[#C9A84C] text-sm tracking-[0.25em] uppercase hover:bg-[#C9A84C] hover:text-black transition-colors">
            Submit Another Scorecard
          </button>

          {/* 3-line summary */}
          {snapshot && (
            <div className="flex flex-col items-center gap-1.5 mt-1">
              <p className="font-[family-name:var(--font-playfair)] text-white text-xl font-semibold">
                {snapshot.playerName}
              </p>
              <p className="text-white/80 text-sm tracking-wide">
                {snapshot.courseName} · {snapshot.teeName} Tees
              </p>
              <p className="font-[family-name:var(--font-playfair)] text-[#C9A84C] text-2xl font-bold">
                {snapPts} pts
              </p>
            </div>
          )}
        </div>

        {/* ── Scorecard card ── */}
        {snapshot && <SubmittedScorecard snapshot={snapshot} a11y={a11y} />}

        {/* ── Accessibility toggle ── */}
        <button
          onClick={() => setA11y(v => !v)}
          title={a11y ? "Standard view" : "Accessibility: larger text"}
          className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[#0a1a0e] border-2 flex items-center justify-center transition-all
            ${a11y
              ? "border-[#C9A84C] text-[#C9A84C]"
              : "border-[#1e3d28] text-white/50 hover:border-white/40 hover:text-white/70"}`}
          style={a11y ? { filter: "drop-shadow(0 0 8px #C9A84C)" } : undefined}
        >
          <GlassesIcon />
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg mx-auto px-4 pb-16">

      {/* Progress steps */}
      <div className="flex items-center gap-2 py-6">
        <StepDot n={1} active={phase === "selecting"} done={phase !== "selecting"} />
        <div className="h-px flex-1 bg-[#1e3d28]" />
        <StepDot n={2} active={phase === "entering" || phase === "submitting"} done={false} />
      </div>

      {/* ── Step 1 ── */}
      {phase === "selecting" && (
        <div className="space-y-5">

          {/* Player */}
          <div>
            <label className="block text-sm tracking-[0.2em] uppercase text-white/40 mb-2">Player</label>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)}
              className="w-full bg-[#0f2418] border border-[#1e3d28] text-white px-4 py-3 rounded-sm appearance-none focus:outline-none focus:border-[#C9A84C] text-sm">
              <option value="">Select a player…</option>
              {nonCompositePlayers.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.handicap})</option>
              ))}
            </select>
          </div>

          {/* Course */}
          <div>
            <label className="block text-sm tracking-[0.2em] uppercase text-white/40 mb-2">Course</label>
            <select value={courseId} onChange={e => setCourseId(e.target.value)}
              className="w-full bg-[#0f2418] border border-[#1e3d28] text-white px-4 py-3 rounded-sm appearance-none focus:outline-none focus:border-[#C9A84C] text-sm">
              <option value="">Select a course…</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Tee selector — shown once course is chosen */}
          {filteredTees.length > 0 && (
            <div>
              <label className="block text-sm tracking-[0.2em] uppercase text-white/40 mb-2">Tee</label>
              <div className="flex gap-2 flex-wrap">
                {filteredTees.map(tee => {
                  const s = teeStyle(tee.name)
                  const active = tee.id === teeId
                  return (
                    <button
                      key={tee.id}
                      onClick={() => setTeeId(tee.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 border rounded-sm text-sm transition-colors
                        ${active ? s.active + " bg-white/5" : "border-[#1e3d28] text-white/40 hover:border-white/30"}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.dot}`} />
                      <span>{tee.name}</span>
                    </button>
                  )
                })}
              </div>

              {/* Playing handicap preview */}
              {selectedTee && player && (
                <div className="mt-3 flex items-center gap-2 text-sm text-white/40">
                  <span>Playing handicap:</span>
                  <span className="text-[#C9A84C] font-semibold">{playingHcp}</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button onClick={handleStart} disabled={!playerId || !courseId || !teeId}
            className="w-full py-4 border border-[#C9A84C] text-[#C9A84C] text-sm tracking-[0.25em] uppercase
              hover:bg-[#C9A84C] hover:text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-2">
            Start Scorecard →
          </button>
        </div>
      )}

      {/* ── Step 2 ── */}
      {(phase === "entering" || phase === "submitting") && (
        <>
          {/* Sticky header */}
          <div className="sticky top-[77px] z-10 bg-[#0a1a0e] border border-[#1e3d28] rounded-sm px-4 py-3 mb-4 flex items-center justify-between">
            <div>
              <p className="text-white font-semibold text-base">{player?.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-white/40 text-sm">{course?.name}</p>
                {selectedTee && (
                  <span className={`flex items-center gap-1 text-sm ${teeStyle(selectedTee.name).text}`}>
                    <span className={`w-2 h-2 rounded-full ${teeStyle(selectedTee.name).dot}`} />
                    {selectedTee.name} · PH {playingHcp}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest">Gross</p>
                <p className="font-[family-name:var(--font-playfair)] text-lg text-white flex items-baseline gap-1">
                  {totalGross}
                  {hasAnyNR && <span className="text-[10px] text-orange-400/70 border border-orange-400/30 px-1 rounded-sm">NR</span>}
                </p>
              </div>
              <div>
                <p className="text-white/40 text-xs uppercase tracking-widest">Pts</p>
                <p className="font-[family-name:var(--font-playfair)] text-lg text-[#C9A84C]">{totalPts}</p>
              </div>
            </div>
          </div>

          {/* Hole cards */}
          <div className="space-y-2">
            {holes.map((hole, i) => (
              <HoleCard
                key={hole.id}
                hole={hole}
                score={scores[i]}
                isNR={nrs[i]}
                playingHcp={playingHcp}
                yardage={yardages[hole.id]}
                onChange={v => setScores(s => s.map((g, j) => j === i ? v : g))}
                onToggleNR={() => toggleNR(i)}
              />
            ))}
          </div>

          {error && <p className="text-red-400 text-xs mt-4">{error}</p>}

          <button onClick={handleSubmit} disabled={phase === "submitting"}
            className="w-full mt-6 py-4 border border-[#C9A84C] text-[#C9A84C] text-sm tracking-[0.25em] uppercase hover:bg-[#C9A84C] hover:text-black transition-colors disabled:opacity-50">
            {phase === "submitting" ? "Saving…" : `Submit Scorecard · ${totalPts} pts`}
          </button>

          <div className="flex justify-center mt-3">
            <BackButton onClick={() => setPhase("selecting")} />
          </div>
        </>
      )}
    </div>
  )
}
