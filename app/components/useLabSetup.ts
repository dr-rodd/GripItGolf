'use client'

import { useSyncExternalStore } from 'react'
import {
  LAB_ATTRIBUTES, HOUSE_SETUP, currentSetup, parseSetup, serialiseSetup, type Setup,
} from '@/lib/styleLab'

/**
 * The style lab setup this document is wearing, live.
 *
 * Read off <html>'s attributes — the boot script put them there before first
 * paint, and `applySetup` is the only thing that changes them — so the lab
 * page and the header pill agree without passing anything between them.
 * Through useSyncExternalStore so the server renders house (it never reads
 * the cookie) and the browser corrects it on hydration without a mismatch.
 */
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: LAB_ATTRIBUTES })
  return () => mo.disconnect()
}

const read = () => serialiseSetup(currentSetup())
const HOUSE = serialiseSetup(HOUSE_SETUP)
const readOnServer = () => HOUSE

export function useLabSetup(): Setup {
  return parseSetup(useSyncExternalStore(subscribe, read, readOnServer))
}
