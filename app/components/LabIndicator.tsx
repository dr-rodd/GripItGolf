'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { labCount, resetSetup } from '@/lib/styleLab'
import { useLabSetup } from './useLabSetup'

/**
 * "Lab · 2" — the sign that this phone is wearing a style lab setup.
 *
 * Inside the header's own right-hand slot rather than a banner, so the
 * header keeps its height and nothing below it moves: the landing animation
 * measures from the top of the page and the scoring screens measure their
 * chrome. Renders nothing at all on a house phone, which is every player's.
 *
 * 32px tall, in a 44px hit area. Tapping it offers the way to the lab and
 * the way out of it.
 */
export default function LabIndicator() {
  const count = labCount(useLabSetup())
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  if (count === 0) return null

  return (
    <span ref={box} className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Style lab on, ${count} change${count === 1 ? '' : 's'}`}
        onClick={() => setOpen(o => !o)}
        className="flex items-center h-11 px-1"
      >
        <span className="inline-flex items-center h-8 px-3 rounded-full bg-ink text-cream text-[13px] font-semibold leading-none whitespace-nowrap">
          Lab · {count}
        </span>
      </button>
      {open && (
        <span
          role="menu"
          className="absolute right-0 top-full mt-1 w-60 flex flex-col p-1.5 bg-surface border border-line shadow-floating rounded-tile"
        >
          <Link
            href="/admin/style"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center min-h-11 px-3 rounded-tile t-label text-ink hover:bg-tint"
          >
            Open style lab
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => { resetSetup(); setOpen(false) }}
            className="flex items-center min-h-11 px-3 rounded-tile t-label text-ink text-left hover:bg-tint"
          >
            Reset to the house style
          </button>
        </span>
      )}
    </span>
  )
}
