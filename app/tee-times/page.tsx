import { supabase } from "@/lib/supabase"
import TeeTimesClient from "./TeeTimesClient"
import Link from "next/link"
import BackButton from "@/app/components/BackButton"

export const dynamic = "force-dynamic"

export default async function TeeTimesPage() {
  const [playersRes, teeTimesRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, role, team_id, is_composite, teams(id, name, color)")
      .order("name"),
    supabase
      .from("tee_times")
      .select("day_number, group_number, player_id")
      .order("day_number")
      .order("group_number"),
  ])

  const players = playersRes.data
  const teeTimes = teeTimesRes.data

  return (
    <div className="bg-[#0a1a0e] text-white">
      {/* Header */}
      <div className="border-b border-[#1e3d28] sticky top-0 z-20 bg-[#0a1a0e]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <BackButton href="/" />
          <h1 className="font-[family-name:var(--font-playfair)] text-lg text-white tracking-wide">
            Tee Times
          </h1>
          <div className="w-[60px]" />
        </div>
      </div>

      <TeeTimesClient
        players={(players ?? []) as any}
        teeTimes={teeTimes ?? []}
      />
    </div>
  )
}
