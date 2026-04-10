import { supabase } from "@/lib/supabase"
import { notFound } from "next/navigation"
import Link from "next/link"
import ScorecardClient from "./ScorecardClient"
import BackButton from "@/app/components/BackButton"

export const revalidate = 30

export default async function ScorecardPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>
  searchParams: Promise<{ from?: string; round?: string }>
}) {
  const { playerId } = await params
  const { from, round } = await searchParams
  const initialRoundIdx = round ? Math.max(0, parseInt(round, 10)) : 0

  const [playerRes, roundsRes, holesRes, scoresRes, hcpsRes, teesRes, compositeHolesRes] = await Promise.all([
    supabase.from("players").select("id, name, role, gender, handicap, is_composite, teams(name, color)").eq("id", playerId).single(),
    supabase.from("rounds").select("id, round_number, status, courses(id, name)").order("round_number"),
    supabase.from("holes").select("id, hole_number, par, stroke_index, course_id, yardage_black, yardage_blue, yardage_white, yardage_red, yardage_sandstone, yardage_slate, yardage_granite, yardage_claret").order("hole_number"),
    supabase.from("scores").select("hole_id, round_id, gross_score, stableford_points, no_return").eq("player_id", playerId),
    supabase.from("round_handicaps").select("round_id, playing_handicap").eq("player_id", playerId),
    supabase.from("tees").select("id, course_id, name, gender, par"),
    supabase.from("composite_holes").select("hole_id, round_id, source_player_name").eq("composite_player_id", playerId),
  ])

  if (!playerRes.data) notFound()

  const backHref = from === "individual" ? "/leaderboard/individual" : "/leaderboard"

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="border-b border-[#1e3d28]">
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between">
          <BackButton href={backHref} />
          <div className="flex items-center gap-2">
            {(playerRes.data as any).teams && (
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: (playerRes.data as any).teams.color }} />
            )}
            <h1 className="font-[family-name:var(--font-playfair)] text-xl text-white tracking-wide flex items-center gap-2">
              {(playerRes.data as any).is_composite
                ? playerRes.data.name.replace(/^Composite\s+/i, "")
                : playerRes.data.name}
              {(playerRes.data as any).is_composite && (
                <span className="text-[11px] font-bold text-[#C9A84C] border border-[#C9A84C]/40 px-1 rounded-sm leading-tight font-[family-name:var(--font-playfair)]">C</span>
              )}
            </h1>
          </div>
          <div className="w-12" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <ScorecardClient
          player={playerRes.data as any}
          rounds={(roundsRes.data ?? []) as any}
          holes={(holesRes.data ?? []) as any}
          scores={scoresRes.data ?? []}
          roundHandicaps={hcpsRes.data ?? []}
          tees={(teesRes.data ?? []) as any}
          compositeHoles={compositeHolesRes.data ?? []}
          initialRoundIdx={initialRoundIdx}
        />
      </div>
    </div>
  )
}
