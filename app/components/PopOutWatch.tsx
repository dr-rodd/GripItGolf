'use client'

import { useEffect } from 'react'
import { watchTaps } from './popOut'

/**
 * One listener for the whole site (D335): remembers the tile last tapped, so
 * any pop-out opened by it grows out of it (`app/components/popOut.ts`).
 * Draws nothing.
 */
export default function PopOutWatch() {
  useEffect(() => { watchTaps() }, [])
  return null
}
