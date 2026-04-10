"use client"

import { useState, useRef } from "react"
import ScoreShape from "@/app/components/ScoreShape"

// ─── Types ─────────────────────────────────────────────────────

type Course = { id: string; name: string }
type Round = { id: string; round_number: number; status: string; courses: Course | null }
type Team = { name: string; color: string }
type Player = { id: string; name: string; role: string; gender: string; handicap: number; is_composite?: boolean; teams: Team | null }
type CompositeHole = { hole_id: string; round_id: string; source_player_name: string }
type Hole = {
  id: string
  hole_number: number
  par: number
  stroke_index: number
  course_id: string
  yardage_black?: number | null
  yardage_blue?: number | null
  yardage_white?: number | null
  yardage_red?: number | null
  yardage_sandstone?: number | null
  yardage_slate?: number | null
  yardage_granite?: number | null
  yardage_claret?: number | null
}
type Score = { hole_id: string; round_id: string; gross_score: number; stableford_points: number; no_return: boolean }
type RoundHcp = { round_id: string; playing_handicap: number }
type Tee = { id: string; course_id: string; name: string; gender: string; par: number }

interface Props {
  player: Player
  rounds: Round[]
  holes: Hole[]
  scores: Score[]
  roundHandicaps: RoundHcp[]
  tees: Tee[]
  compositeHoles?: CompositeHole[]
  initialRoundIdx?: number
}

// ─── Constants ─────────────────────────────────────────────────

const COURSE_SHORT: Record<string, string> = {
  "Old Tom Morris":    "Old Tom",
  "St Patricks Links": "St Patrick",
  "Sandy Hills":       "Sandy Hills",
}

const TEE_PREF_M = ["blue", "white", "black", "sandstone", "slate", "granite", "claret", "red"]
const TEE_PREF_F = ["red", "sandstone", "claret", "white", "blue", "black"]

// ─── Helpers ───────────────────────────────────────────────────

function defaultTee(tees: Tee[], courseId: string, gender: string): Tee | null {
  const ct = tees.filter(t => t.course_id === courseId)
  const prefs = gender === "F" ? TEE_PREF_F : TEE_PREF_M
  for (const p of prefs) {
    const t = ct.find(x => x.name.toLowerCase() === p)
    if (t) return t
  }
  return ct[0] ?? null
}

function getYardage(hole: Hole, teeName: string): number | null {
  const key = `yardage_${teeName.toLowerCase()}` as keyof Hole
  const v = hole[key]
  return typeof v === "number" ? v : null
}


// ─── Subtotal row ───────────────────────────────────────────────

function SubtotalRow({
  label, par, yards, gross, pts, hasScores, hasNR, isTotal,
}: {
  label: string; par: number; yards: number | null
  gross: number; pts: number; hasScores: boolean; hasNR?: boolean; isTotal?: boolean
}) {
  const crimson = "font-[family-name:var(--font-crimson)]"
  const bg = isTotal ? "bg-[#1a3a22]" : "bg-gray-100"
  const textLabel = isTotal ? "text-white/70" : "text-gray-500"
  const textData = isTotal ? "text-white" : "text-gray-700"
  const textPts = isTotal ? "text-[#C9A84C] font-semibold" : "text-[#2d6a4f] font-semibold"

  return (
    <tr className={`border-t-2 ${isTotal ? "border-[#1e3a22]" : "border-gray-200"} ${bg}`}>
      <td className={`py-2 px-3 text-sm uppercase tracking-wider font-semibold ${textLabel} font-[family-name:var(--font-playfair)]`}>
        {label}
      </td>
      <td className={`text-center py-2 px-2 ${isTotal ? "text-lg" : "text-base"} font-semibold ${textData} ${crimson}`}>{par}</td>
      <td className="py-2 px-2" />
      <td className={`text-center py-2 px-2 text-base ${textData} ${crimson}`}>
        {yards ?? "—"}
      </td>
      <td className={`text-center py-2 px-2 ${isTotal ? "text-lg" : "text-base"} font-semibold ${textData} ${crimson}`}>
        {hasScores
          ? <>
              {gross > 0 ? gross : "—"}
              {hasNR && <span className="text-orange-500 text-[9px] ml-0.5">NR</span>}
            </>
          : "—"
        }
      </td>
      <td className={`text-center py-2 px-2 ${isTotal ? "text-lg font-bold" : "text-base"} ${textPts} ${crimson}`}>
        {hasScores ? pts : "—"}
      </td>
    </tr>
  )
}

// ─── Main component ────────────────────────────────────────────

export default function ScorecardClient({ player, rounds, holes, scores, roundHandicaps, tees, compositeHoles = [], initialRoundIdx = 0 }: Props) {
  const [{ idx, dir }, setNav] = useState({ idx: Math.min(initialRoundIdx, Math.max(0, rounds.length - 1)), dir: "" })
  const touchStartX = useRef(0)

  function goTo(newIdx: number) {
    if (newIdx === idx || newIdx < 0 || newIdx >= rounds.length) return
    setNav({ idx: newIdx, dir: newIdx > idx ? "animate-slide-from-right" : "animate-slide-from-left" })
  }

  const round = rounds[idx]
  if (!round) return null

  const courseId = round.courses?.id ?? ""
  const courseName = round.courses?.name ?? ""
  const shortName = COURSE_SHORT[courseName] ?? courseName

  // Build hole_id → initials map for composite scorecards
  const compositeMap: Record<string, string> = {}
  if (player.is_composite) {
    for (const ch of compositeHoles) {
      if (ch.round_id === round.id) {
        const initials = ch.source_player_name
          .split(" ")
          .map(w => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
        compositeMap[ch.hole_id] = initials
      }
    }
  }

  const courseHoles = holes
    .filter(h => h.course_id === courseId)
    .sort((a, b) => a.hole_number - b.hole_number)

  const roundScores = scores.filter(s => s.round_id === round.id)
  const playingHcp = roundHandicaps.find(h => h.round_id === round.id)?.playing_handicap ?? null
  const tee = defaultTee(tees, courseId, player.gender)
  const hasScores = roundScores.length > 0

  const front = courseHoles.slice(0, 9)
  const back = courseHoles.slice(9, 18)

  function holeScore(hole: Hole): Score | null {
    return roundScores.find(s => s.hole_id === hole.id) ?? null
  }

  function nrGross(hole: Hole): number {
    const ph = playingHcp ?? 0
    const shots = Math.floor(ph / 18) + (hole.stroke_index <= ph % 18 ? 1 : 0)
    return hole.par + 2 + shots
  }

  function sumGross(hs: Hole[]): number {
    return hs.reduce((sum, h) => {
      const s = holeScore(h)
      if (!s) return sum
      return sum + (s.no_return ? nrGross(h) : s.gross_score)
    }, 0)
  }

  function sumPts(hs: Hole[]): number {
    return hs.reduce((sum, h) => sum + (holeScore(h)?.stableford_points ?? 0), 0)
  }

  function sumPar(hs: Hole[]): number {
    return hs.reduce((sum, h) => sum + h.par, 0)
  }

  function sumYards(hs: Hole[]): number | null {
    if (!tee) return null
    let total = 0
    for (const h of hs) {
      const y = getYardage(h, tee.name)
      if (y == null) return null
      total += y
    }
    return total
  }

  const outPar = sumPar(front)
  const inPar = sumPar(back)
  const outGross = sumGross(front)
  const inGross = sumGross(back)
  const outPts = sumPts(front)
  const inPts = sumPts(back)
  const outYards = sumYards(front)
  const inYards = sumYards(back)
  const totalPar = outPar + inPar
  const totalGross = outGross + inGross
  const totalPts = outPts + inPts
  const totalYards = outYards != null && inYards != null ? outYards + inYards : null
  const hasNR = roundScores.some(s => s.no_return)

  const crimson = "font-[family-name:var(--font-crimson)]"

  return (
    <div>
      {/* ── Round tabs ── */}
      <div className="flex gap-1.5 mb-5">
        {rounds.map((r, i) => {
          const name = r.courses?.name ?? ""
          const short = COURSE_SHORT[name] ?? name
          const active = i === idx
          return (
            <button
              key={r.id}
              onClick={() => goTo(i)}
              className={`flex-1 py-2.5 px-2 rounded-sm text-center transition-colors border ${
                active
                  ? "bg-[#C9A84C]/15 border-[#C9A84C]/40 text-[#C9A84C]"
                  : "bg-white/[0.03] border-[#1e3d28] text-white/35 hover:text-white/60"
              }`}
            >
              <div className="font-[family-name:var(--font-playfair)] text-base font-semibold leading-tight">{short}</div>
              <div className={`text-xs mt-0.5 tracking-[0.15em] uppercase ${active ? "text-[#C9A84C]/50" : "text-white/20"}`}>
                Day {r.round_number}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Animated scorecard ── */}
      <div
        key={idx}
        className={dir || undefined}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (Math.abs(dx) > 60) goTo(idx + (dx < 0 ? 1 : -1))
        }}
      >
        {/* ── Navigation arrows ── */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => goTo(idx - 1)}
            disabled={idx === 0}
            className="text-[#C9A84C] text-2xl disabled:opacity-15 px-1 leading-none"
          >
            ‹
          </button>
          <div className="text-center">
            <span className="text-white/50 text-xs tracking-widest uppercase">{shortName}</span>
            {playingHcp != null && (
              <span className="text-white/25 text-xs ml-2">hcp {playingHcp}</span>
            )}
            {tee && (
              <span className="text-white/20 text-xs ml-2 capitalize">{tee.name.toLowerCase()}</span>
            )}
          </div>
          <button
            onClick={() => goTo(idx + 1)}
            disabled={idx === rounds.length - 1}
            className="text-[#C9A84C] text-2xl disabled:opacity-15 px-1 leading-none"
          >
            ›
          </button>
        </div>

        {/* ── White scorecard card ── */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">

          {/* Card header */}
          <div className="bg-[#1a3a22] px-4 py-3 flex items-center justify-between">
            <span className="font-[family-name:var(--font-playfair)] text-white text-lg">{courseName}</span>
            <div className={`flex items-center gap-3 text-sm ${crimson}`}>
              {tee && (
                <span className="text-[#C9A84C]/80 capitalize">{tee.name.toLowerCase()} tees</span>
              )}
              {playingHcp != null && (
                <span className="text-white/40">hcp {playingHcp}</span>
              )}
            </div>
          </div>

          {courseHoles.length === 0 ? (
            <p className="text-gray-300 text-sm text-center py-10">Course data unavailable</p>
          ) : (
            <table className="w-full border-collapse">
              {/* Column headers */}
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="text-left py-2 px-3 text-sm font-semibold text-gray-400 uppercase tracking-wide font-[family-name:var(--font-playfair)] w-10">Hole</th>
                  <th className="text-center py-2 px-2 text-sm font-normal text-gray-400 uppercase tracking-wide w-9">Par</th>
                  <th className="text-center py-2 px-2 text-sm font-normal text-gray-400 uppercase tracking-wide w-9">SI</th>
                  <th className="text-center py-2 px-2 text-sm font-normal text-gray-400 uppercase tracking-wide w-12">Yds</th>
                  <th className="text-center py-2 px-2 text-sm font-normal text-gray-400 uppercase tracking-wide">Score</th>
                  <th className="text-center py-2 px-2 text-sm font-normal text-gray-400 uppercase tracking-wide w-10">Pts</th>
                </tr>
              </thead>

              <tbody>
                {/* ── Front 9 ── */}
                {front.map((hole, i) => {
                  const s = holeScore(hole)
                  const pts = s?.stableford_points ?? null
                  const isOdd = i % 2 === 0
                  const initials = compositeMap[hole.id]
                  return (
                    <tr key={hole.id} className={`border-t border-gray-100 ${isOdd ? "bg-white" : "bg-gray-50/40"}`}>
                      <td className={`py-2.5 px-3 text-lg font-semibold text-gray-700 ${crimson}`}>
                        <div className="flex items-center gap-1">
                          {hole.hole_number}
                          {initials && (
                            <span className="text-[9px] font-bold text-[#C9A84C] border border-[#C9A84C]/40 px-0.5 rounded-sm leading-tight">{initials}</span>
                          )}
                        </div>
                      </td>
                      <td className={`text-center py-2.5 px-2 text-base text-gray-500 ${crimson}`}>{hole.par}</td>
                      <td className={`text-center py-2.5 px-2 text-sm text-gray-300 ${crimson}`}>{hole.stroke_index}</td>
                      <td className={`text-center py-2.5 px-2 text-sm text-gray-400 ${crimson}`}>
                        {tee ? (getYardage(hole, tee.name) ?? "—") : "—"}
                      </td>
                      <td className="text-center py-1.5 px-2">
                        {s
                          ? s.no_return
                            ? <span className={`inline-flex items-center justify-center w-7 h-7 border border-orange-500/60 rounded-sm text-orange-500 text-xs font-semibold ${crimson}`}>NR</span>
                            : <ScoreShape gross={s.gross_score} par={hole.par} />
                          : <span className="text-gray-200 text-sm">—</span>
                        }
                      </td>
                      <td className={`text-center py-2.5 px-2 text-lg font-semibold ${crimson} ${
                        pts == null ? "text-gray-200"
                        : pts >= 3 ? "text-[#2d6a4f]"
                        : pts === 0 ? "text-gray-300"
                        : "text-gray-500"
                      }`}>
                        {pts != null ? pts : "—"}
                      </td>
                    </tr>
                  )
                })}

                {/* ── OUT subtotal ── */}
                <SubtotalRow
                  label="Out"
                  par={outPar}
                  yards={outYards}
                  gross={outGross}
                  pts={outPts}
                  hasScores={hasScores}
                />

                {/* ── Back 9 ── */}
                {back.map((hole, i) => {
                  const s = holeScore(hole)
                  const pts = s?.stableford_points ?? null
                  const isOdd = i % 2 === 0
                  const initials = compositeMap[hole.id]
                  return (
                    <tr key={hole.id} className={`border-t border-gray-100 ${isOdd ? "bg-white" : "bg-gray-50/40"}`}>
                      <td className={`py-2.5 px-3 text-lg font-semibold text-gray-700 ${crimson}`}>
                        <div className="flex items-center gap-1">
                          {hole.hole_number}
                          {initials && (
                            <span className="text-[9px] font-bold text-[#C9A84C] border border-[#C9A84C]/40 px-0.5 rounded-sm leading-tight">{initials}</span>
                          )}
                        </div>
                      </td>
                      <td className={`text-center py-2.5 px-2 text-base text-gray-500 ${crimson}`}>{hole.par}</td>
                      <td className={`text-center py-2.5 px-2 text-sm text-gray-300 ${crimson}`}>{hole.stroke_index}</td>
                      <td className={`text-center py-2.5 px-2 text-sm text-gray-400 ${crimson}`}>
                        {tee ? (getYardage(hole, tee.name) ?? "—") : "—"}
                      </td>
                      <td className="text-center py-1.5 px-2">
                        {s
                          ? s.no_return
                            ? <span className={`inline-flex items-center justify-center w-7 h-7 border border-orange-500/60 rounded-sm text-orange-500 text-xs font-semibold ${crimson}`}>NR</span>
                            : <ScoreShape gross={s.gross_score} par={hole.par} />
                          : <span className="text-gray-200 text-sm">—</span>
                        }
                      </td>
                      <td className={`text-center py-2.5 px-2 text-lg font-semibold ${crimson} ${
                        pts == null ? "text-gray-200"
                        : pts >= 3 ? "text-[#2d6a4f]"
                        : pts === 0 ? "text-gray-300"
                        : "text-gray-500"
                      }`}>
                        {pts != null ? pts : "—"}
                      </td>
                    </tr>
                  )
                })}

                {/* ── IN subtotal ── */}
                <SubtotalRow
                  label="In"
                  par={inPar}
                  yards={inYards}
                  gross={inGross}
                  pts={inPts}
                  hasScores={hasScores}
                />

                {/* ── TOTAL ── */}
                <SubtotalRow
                  label="Total"
                  par={totalPar}
                  yards={totalYards}
                  gross={totalGross}
                  pts={totalPts}
                  hasScores={hasScores}
                  hasNR={hasNR}
                  isTotal
                />
              </tbody>
            </table>
          )}

          {!hasScores && courseHoles.length > 0 && (
            <p className={`text-center text-gray-300 text-sm py-4 border-t border-gray-100 ${crimson}`}>
              No scores recorded yet
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
