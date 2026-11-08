"use server"

import { revalidatePath } from "next/cache"

export async function revalidateLeaderboards() {
  revalidatePath("/leaderboard")
  revalidatePath("/leaderboard/individual")
}

/**
 * Everything under one trip.
 *
 * Called when teams are confirmed against a leaderboard. The leaderboard page
 * is already `force-dynamic`, but the client router keeps its last payload for
 * a short while, so without this a confirmation is followed by the old tables.
 * The layout scope covers the leaderboard, the teams screen and setup at once.
 */
export async function revalidateTrip(tripCode: string) {
  revalidatePath(`/trip/${tripCode}`, "layout")
}
