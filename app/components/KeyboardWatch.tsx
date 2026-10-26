'use client'

// While a phone's keyboard is up, the bars fixed to the bottom of the screen
// step aside (`html.keyboard-open`, `.hide-with-keyboard` in globals.css).
// Some browsers lift fixed elements above the keyboard rather than letting
// it cover them, and the tab bar and the match card's arrows then sat on
// top of the very boxes being typed into. A page can't put the keyboard on
// top, so the bars go while it is open and come back when it closes.
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

export default function KeyboardWatch() {
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const root = document.documentElement
    // Read after the focus has moved, so going from one box to the next
    // never flickers the bars back in between.
    const sync = () => setTimeout(() => {
      root.classList.toggle('keyboard-open', opensKeyboard(document.activeElement))
    }, 0)
    // No reading on mount: a box autofocused on page load has no keyboard
    // on iOS, and hiding the tab bar then would hide it for nothing.
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', sync)
    return () => {
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', sync)
      root.classList.remove('keyboard-open')
    }
  }, [])
  return null
}
