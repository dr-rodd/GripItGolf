"use server"

import { revalidatePath } from "next/cache"

export async function revalidateLeaderboards() {
  revalidatePath("/leaderboard")
  revalidatePath("/leaderboard/individual")
}
