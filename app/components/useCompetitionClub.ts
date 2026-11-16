'use client'

import { useEffect, useState } from 'react'
import { competitionClub } from '@/lib/entryClient'

/**
 * The club running this event when it is a club competition — read after
 * the page mounts, from what the server said on entering (stage (d2)). A
 * competition's PIN prompts draw no PIN box: its admins open it by being
 * signed in, and nobody else has a PIN to type (D164).
 */
export function useCompetitionClub(tripCode: string): string | null {
  const [club, setClub] = useState<string | null>(null)
  useEffect(() => { setClub(competitionClub(tripCode)) }, [tripCode])
  return club
}

/** What a competition's PIN prompt says instead of asking. */
export function competitionLockLine(club: string): string {
  return `Run by ${club}’s admins. They open it by signing in to the account on the club’s list.`
}
