'use client'

import { createContext, useContext } from 'react'
import type { ClubSummary } from '@/lib/accountClient'
import { clubMay, type ClubAct } from '@/lib/clubMay'

/** The club as the server drew it: identity only (D202). */
export interface ClubhouseFace {
  id: string
  slug: string
  name: string
  style: Record<string, string>
  crestUrl: string | null
}

/** What every section reads once the door has let this account in. */
export interface Shell {
  face: ClubhouseFace
  club: ClubSummary
  setClub: (c: ClubSummary) => void
  /** Whether this account is Green Dot staff here (D222). */
  staff: boolean
  /** What this account may do here — drawn from, never trusted: the server asks again. */
  may: (act: ClubAct) => boolean
}

export const ShellContext = createContext<Shell | null>(null)

export function useShell(): Shell {
  const s = useContext(ShellContext)
  if (!s) throw new Error('useShell outside the Clubhouse')
  return s
}

export function shellOf(face: ClubhouseFace, club: ClubSummary, setClub: (c: ClubSummary) => void): Shell {
  const staff = !!club.staff
  return { face, club, setClub, staff, may: act => clubMay(act, { row: club.credentials, staff }) }
}
