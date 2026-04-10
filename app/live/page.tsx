import { supabase } from "@/lib/supabase"
import Link from "next/link"
import LiveClient from "./LiveClient"
import BackButton from "@/app/components/BackButton"

export const dynamic = "force-dynamic"

export default async function LivePage() {
  const [playersRes, roundsRes, holesRes, teesRes, hcpsRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, role, handicap, gender, is_composite, teams(name, color)")
      .order("name"),
    supabase
      .from("rounds")
      .select("id, round_number, status, courses(id, name)")
      .order("round_number"),
    supabase
      .from("holes")
      .select("id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies, yardage_black, yardage_blue, yardage_white, yardage_red, yardage_sandstone, yardage_slate, yardage_granite, yardage_claret")
      .order("hole_number"),
    supabase
      .from("tees")
      .select("id, course_id, name, gender, par, course_rating, slope"),
    supabase
      .from("round_handicaps")
      .select("round_id, player_id, playing_handicap"),
  ])

  return (
    <div className="min-h-dvh bg-[#0a1a0e] text-white">
      <div className="border-b border-[#1e3d28] sticky top-0 z-20 bg-[#0a1a0e]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href="/score-entry" />
          <h1 className="font-[family-name:var(--font-playfair)] text-lg text-white tracking-wide">
            Live Scoring
          </h1>
          <div className="w-[60px]" />
        </div>
      </div>

      <LiveClient
        players={(playersRes.data ?? []) as any}
        rounds={(roundsRes.data ?? []) as any}
        holes={(holesRes.data ?? []) as any}
        tees={(teesRes.data ?? []) as any}
        roundHandicaps={hcpsRes.data ?? []}
      />
    </div>
  )
}
