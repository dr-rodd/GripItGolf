'use client'

// While a phone's keyboard is up, the bars fixed to the bottom of the screen
// step aside (`html.keyboard-open`, `.hide-with-keyboard` in globals.css).
// Some browsers lift fixed elements above the keyboard rather than letting
// it cover them, and the tab bar and the match card's arrows then sat on
// top of the very boxes being typed into. A page can't put the keyboard on
// top, so the bars go while it is open and come back when it closes.
//
// **Open means a text box has focus and the screen has actually shrunk**
// (Ross, 26 Oct 2026). Focus alone was the first version, and the bars did
// not always come back: a phone's keyboard can be put away — the ✓ above a
// number pad, a swipe down — with the box still focused, and nothing blurs.
// So the visible height is watched too (`visualViewport`, against the
// tallest seen at this width): the keyboard is up while it is more than
// KEYBOARD_PX short. A tap into a box hides the bars at once rather than
// waiting for the keyboard to finish rising, and shows them again if no
// keyboard came (a box focused by the page itself, which raises none on an
// iPhone). Every fixed or sticky bar along the bottom of any screen carries
// `.hide-with-keyboard`; a sheet that holds the box being typed in never
// does, or it would hide itself.
//
// Touch screens only: on a laptop there is no keyboard to make room for.

import { useEffect } from 'react'

const NO_KEYBOARD = new Set([
  'checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file',
  'image', 'hidden', 'date', 'time', 'datetime-local', 'month', 'week',
])

function opensKeyboard(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLInputElement) return !el.readOnly && !NO_KEYBOARD.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

/** Shorter than this and it is the address bar folding, not a keyboard. */
const KEYBOARD_PX = 150
/** How long a tap into a box keeps the bars away while the keyboard rises. */
const RISE_MS = 800

export default function KeyboardWatch() {
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const root = document.documentElement
    const vv = window.visualViewport
    const height = () => vv?.height ?? window.innerHeight
    let width = window.innerWidth
    let tallest = height()
    let risingUntil = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = () => {
      if (window.innerWidth !== width) { width = window.innerWidth; tallest = height() }
      tallest = Math.max(tallest, height())
      const shrunk = tallest - height() > KEYBOARD_PX
      const focused = opensKeyboard(document.activeElement)
      root.classList.toggle('keyboard-open', focused && (shrunk || Date.now() < risingUntil))
    }
    // Read after the focus has moved, so going from one box to the next
    // never flickers the bars back in between.
    const onFocusIn = () => setTimeout(() => {
      if (opensKeyboard(document.activeElement)) {
        risingUntil = Date.now() + RISE_MS
        clearTimeout(timer)
        timer = setTimeout(sync, RISE_MS + 20)
      }
      sync()
    }, 0)
    const onFocusOut = () => setTimeout(sync, 0)

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    vv?.addEventListener('resize', sync)
    window.addEventListener('resize', sync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', sync)
      window.removeEventListener('resize', sync)
      root.classList.remove('keyboard-open')
    }
  }, [])
  return null
}
