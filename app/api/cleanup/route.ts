import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"

// Hourly cleanup of abandoned empty live rounds.
// Protected by CRON_SECRET env var — callers must pass:
//   Authorization: Bearer <CRON_SECRET>
//
// Rules:
//   - Only closes live_rounds where ZERO hole scores have been submitted
//     by the players locked into that round, AND the round was activated
//     more than 2 hours ago.
//   - Finalised rounds are never touched (status = 'active' filter
//     already excludes them, but the intent is explicit).
//   - In-progress rounds (any scores submitted) are never touched,
//     even if the last submission was hours ago.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const auth = req.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  // Find active rounds that were created more than 2 hours ago.
  // Finalised rounds are excluded by the status filter.
  const { data: candidateRounds } = await supabaseAdmin
    .from("live_rounds")
    .select("id, round_id")
    .eq("status", "active")
    .lt("activated_at", twoHoursAgo)

  let closedRounds = 0

  for (const round of candidateRounds ?? []) {
    // Get the players locked into this specific live_round.
    const { data: locks } = await supabaseAdmin
      .from("live_player_locks")
      .select("player_id")
      .eq("live_round_id", round.id)

    const playerIds = (locks ?? []).map((l: any) => l.player_id as string)

    // Check whether any of these players have submitted scores for this round.
    // If no locks exist, the count will be 0 and the round is treated as empty.
    let hasScores = false
    if (playerIds.length > 0) {
      const { count } = await supabaseAdmin
        .from("live_scores")
        .select("id", { count: "exact", head: true })
        .eq("round_id", round.round_id)
        .in("player_id", playerIds)
      hasScores = (count ?? 0) > 0
    }

    // Only close rounds where zero scores have been submitted.
    if (!hasScores) {
      await supabaseAdmin
        .from("live_rounds")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", round.id)
      closedRounds++
    }
  }

  return NextResponse.json({ ok: true, closedRounds })
}
