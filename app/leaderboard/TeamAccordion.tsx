"use client"

import { useState } from "react"
import type { Team } from "./data"
import { HOLES, playerTotal, playerGrossTotal, hasNR } from "./data"

function cellStyle(pts: number, isBest: boolean): string {
  if (isBest) {
    if (pts >= 4) return "bg-emerald-700 text-white font-bold"
    if (pts === 3) return "bg-[#C9A84C] text-black font-bold"
    if (pts === 2) return "bg-white/10 text-white font-semibold"
    if (pts === 1) return "text-white/50"
    return "text-red-400/60"
  }
  if (pts >= 4) return "text-emerald-400/60"
  if (pts === 3) return "text-[#C9A84C]/60"
  if (pts === 2) return "text-white/30"
  if (pts === 1) return "text-white/20"
  return "text-red-400/30"
}

export default function TeamAccordion({
  team,
  best,
}: {
  team: Team
  best: { pts: number; gross: number; role: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-[#1e3d28]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0f2418] hover:bg-[#142e1f] transition-colors text-left"
      >
        <span className="text-white/60 text-xs tracking-[0.2em] uppercase">Individual Scores</span>
        <span className="text-[#C9A84C] text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-[#0a1a0e]">
                <th className="text-left px-3 py-2 text-white/40 tracking-widest uppercase font-normal w-32">Player</th>
                {HOLES.map(h => (
                  <th key={h} className="px-1 py-2 text-white/30 font-normal text-center w-9">{h}</th>
                ))}
                <th className="px-3 py-2 text-white/40 tracking-widest uppercase font-normal text-center">Gross</th>
                <th className="px-3 py-2 text-white/40 tracking-widest uppercase font-normal text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {team.players.map(player => {
                const nr = player.nr ?? []
                const playerHasNR = hasNR(player)
                return (
                  <tr key={player.name} className="border-t border-[#1e3d28]">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-white/80">{player.name}</span>
                      <span className="text-white/30 ml-1 text-[10px]">({player.handicap})</span>
                    </td>

                    {player.scores.map((pts, i) => {
                      if (nr[i]) {
                        return (
                          <td key={i} className="text-center py-2 w-9 text-white/30 text-[10px] tracking-tight">
                            NR
                          </td>
                        )
                      }
                      const isBest = pts === best[i].pts && pts > 0
                      return (
                        <td key={i} className={`text-center py-2 w-9 ${cellStyle(pts, isBest)}`}>
                          {player.gross[i]}<sup className="text-[8px] opacity-70">{pts}</sup>
                        </td>
                      )
                    })}

                    {/* Gross total with NR indicator */}
                    <td className="text-center px-3 py-2 text-white/60 whitespace-nowrap">
                      {playerGrossTotal(player)}
                      {playerHasNR && (
                        <span className="ml-1 text-[9px] text-orange-400/70 border border-orange-400/30 px-1 rounded-sm">NR</span>
                      )}
                    </td>

                    {/* Stableford total */}
                    <td className="text-center px-3 py-2 text-white font-semibold">
                      {playerTotal(player)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
