'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LinkMark, LinkedBadge } from './LinkMark'
import { buttonClass, cardClass } from './ui'

/**
 * How linking to Golf Ireland works — a walkthrough in the intro's manner.
 *
 * A mimic, not the thing: it shows what happens once Golf Ireland lets a
 * club's members be found by their membership number, which it does not
 * yet. Six pages, each a framed miniature of the screen involved floating
 * on the cream sheet (`intro-veil`, `intro-card`) with the part that
 * matters ringed (`intro-focus`), and the words on a deep-emerald sweep
 * below — deep rather than the intro's bright emerald, so white words
 * read at full contrast and nothing borrows the intro's own exception.
 *
 * Tap Next, swipe, or use the arrow keys; Skip or Escape closes from
 * anywhere. Motion is the wizard's own step slide (`step-in-forward` /
 * `step-in-back`, 340ms, a fade under Reduce Motion), and the number typing
 * itself in on page two is skipped under Reduce Motion too.
 *
 * Every name and number here is invented. Nothing is read or written.
 */

const DEMO_NUMBER = '0049812377'
/** One digit every this many milliseconds. */
const TYPE_MS = 110

type Page = { key: string; title: string; text: string; mock: (p: MockProps) => React.ReactNode }
type MockProps = { name: string; club: string; typed: string }

/** The ring around the part of the miniature a page is about. */
function Ring({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span className="intro-focus absolute -inset-1.5 pointer-events-none" />
    </div>
  )
}

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function MockHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <LinkMark size={26} />
      <p className="text-ink text-[15px] font-semibold">{children}</p>
    </div>
  )
}

const masked = (n: string) => `${'•'.repeat(n.length - 3)}${n.slice(-3)}`

const PAGES: Page[] = [
  {
    key: 'club',
    title: 'Your club says yes',
    text: 'It starts with your club. Once it gives Green Dot access to its members through Golf Ireland, a league can read their rounds.',
    mock: ({ club }) => (
      <>
        <MockHeading>Golf Ireland</MockHeading>
        <p className="text-ink/80 text-[13px] font-medium mb-2">Which clubs?</p>
        <Ring>
          <div className="flex items-center justify-between rounded-tile border border-accent-deep bg-accent-tint px-3 py-2.5">
            <span className="text-ink text-[14px] font-medium">{club}</span>
            <span className="text-accent-deep"><Tick /></span>
          </div>
        </Ring>
        <div className="rounded-tile border border-line px-3 py-2.5 mt-2">
          <span className="text-ink/65 text-[14px]">Another Golf Club</span>
        </div>
      </>
    ),
  },
  {
    key: 'number',
    title: 'Type your number',
    text: 'Tick to agree, then type your Golf Ireland membership number. No password, and nothing else to remember.',
    mock: ({ typed }) => (
      <>
        <MockHeading>Link your Golf Ireland membership</MockHeading>
        <div className="flex items-start gap-2 mb-3">
          <span className="mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded bg-accent-deep text-white flex-shrink-0"><Tick /></span>
          <span className="text-ink/80 text-[13px] leading-snug">I agree that Green Dot reads my rounds that meet this league&apos;s rules.</span>
        </div>
        <Ring>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 rounded-field border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink tabular-nums">
              {typed}<span className="inline-block w-px h-4 bg-ink align-middle ml-px" />
            </div>
            <div className="rounded-field bg-accent-deep text-white text-[14px] font-semibold px-3 flex items-center">Search</div>
          </div>
        </Ring>
      </>
    ),
  },
  {
    key: 'found',
    title: 'That’s you',
    text: 'Green Dot finds you in your club’s membership and shows only enough to recognise yourself: your name and the end of your number.',
    mock: ({ name, club }) => (
      <>
        <MockHeading>Link your Golf Ireland membership</MockHeading>
        <div className="rounded-field border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink tabular-nums mb-3">{DEMO_NUMBER}</div>
        <Ring>
          <div className="flex items-center justify-between gap-2 rounded-tile border border-line px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-ink text-[14px] font-medium truncate">{name}</p>
              <p className="text-ink/65 text-[13px] tabular-nums truncate">{masked(DEMO_NUMBER)} · {club}</p>
            </div>
            <span className="rounded-lg border border-line-strong px-2.5 py-1.5 text-[13px] font-medium text-ink/80 flex-shrink-0">This is me</span>
          </div>
        </Ring>
      </>
    ),
  },
  {
    key: 'confirm',
    title: 'The organiser checks',
    text: 'The league’s organiser confirms it’s really you. Until they do, nothing of yours is read.',
    mock: ({ name, club }) => (
      <>
        <MockHeading>Golf Ireland</MockHeading>
        <p className="text-ink/65 text-[13px] mb-3">Organiser area</p>
        <div className="rounded-tile border border-line px-3 py-2.5">
          <p className="text-ink text-[14px] font-medium">{name}</p>
          <p className="text-ink/65 text-[13px]">Asks to link {name}, {club}</p>
          <div className="flex gap-2 mt-2">
            <Ring>
              <span className="block rounded-lg border border-accent-deep px-2.5 py-1.5 text-[13px] font-medium text-accent-deep">It’s them</span>
            </Ring>
            <span className="rounded-lg border border-rust/40 px-2.5 py-1.5 text-[13px] font-medium text-rust-deep">Refuse</span>
          </div>
        </div>
      </>
    ),
  },
  {
    key: 'rounds',
    title: 'Your rounds arrive',
    text: 'Hand your card in to Golf Ireland as usual. Rounds that meet the league’s rules arrive by themselves, and any that don’t say why.',
    mock: ({ club }) => (
      <>
        <MockHeading>Your Golf Ireland rounds</MockHeading>
        <Ring>
          <div className="space-y-2">
            {[
              { day: 'Sat 7 Nov', pts: 36 },
              { day: 'Sat 14 Nov', pts: 33 },
            ].map(r => (
              <div key={r.day} className="flex items-center justify-between rounded-tile border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-ink text-[14px] font-medium">{r.day}</p>
                  <p className="text-ink/65 text-[13px] truncate">{club} · 18 holes</p>
                </div>
                <span className="font-serif font-bold text-accent-deep text-[17px] tabular-nums">{r.pts}</span>
              </div>
            ))}
          </div>
        </Ring>
        <div className="flex items-center justify-between rounded-tile border border-line px-3 py-2 mt-2">
          <div className="min-w-0">
            <p className="text-ink/65 text-[14px] font-medium">Wed 11 Nov</p>
            <p className="text-ink/65 text-[13px]">Doesn&apos;t count: Saturdays only</p>
          </div>
          <span className="font-serif text-ink/50 text-[17px] tabular-nums">31</span>
        </div>
      </>
    ),
  },
  {
    key: 'linked',
    title: 'You’re linked',
    text: 'From then on the mark sits beside your name across the league. Unlink any time and your rounds leave with you.',
    mock: ({ name }) => (
      <>
        <p className="text-ink text-[15px] font-semibold mb-3">Leaderboard</p>
        <div className="space-y-1.5">
          {[
            { place: 1, who: name, pts: 69, linked: true, ring: true },
            { place: 2, who: 'Sam Kelly', pts: 66, linked: true },
            { place: 3, who: 'Jo Byrne', pts: 61, linked: false },
          ].map(r => {
            const row = (
              <div className="flex items-center gap-3 rounded-tile border border-line px-3 py-2">
                <span className="text-ink/65 text-[14px] tabular-nums w-4">{r.place}</span>
                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-ink text-[15px] font-semibold truncate">{r.who}</span>
                  {r.linked && <LinkedBadge size={16} />}
                </span>
                <span className="font-serif font-bold text-ink text-[17px] tabular-nums">{r.pts}</span>
              </div>
            )
            return <div key={r.who}>{r.ring ? <Ring>{row}</Ring> : row}</div>
          })}
        </div>
      </>
    ),
  },
]

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function GolfIrelandTour({ open, onClose, name = 'Pat Murphy', club = 'Example Golf Club' }: {
  open: boolean
  onClose: () => void
  /** Whose name the miniatures carry — the viewer's, when known. */
  name?: string
  club?: string
}) {
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  /** Milliseconds since the number page opened — how much of it is typed. */
  const [typedAt, setTypedAt] = useState(0)
  const touchX = useRef<number | null>(null)
  const last = PAGES.length - 1

  // Closing puts the walkthrough back at its first page for next time.
  const close = useCallback(() => { setPage(0); setDir(1); setTypedAt(0); onClose() }, [onClose])

  const go = useCallback((next: number) => {
    if (next < 0) return
    if (next > last) { close(); return }
    setDir(next > page ? 1 : -1)
    setTypedAt(0)
    setPage(next)
  }, [page, last, close])

  // The number types itself in, one digit at a time, on its page —
  // counted from when the page opened, so there is no state to reset.
  useEffect(() => {
    if (!open || PAGES[page].key !== 'number') return
    const start = Date.now()
    const t = setInterval(() => {
      setTypedAt(Date.now() - start)
      if (Date.now() - start > DEMO_NUMBER.length * TYPE_MS) clearInterval(t)
    }, TYPE_MS)
    return () => clearInterval(t)
  }, [open, page])
  const typed = prefersReducedMotion()
    ? DEMO_NUMBER
    : DEMO_NUMBER.slice(0, Math.floor(typedAt / TYPE_MS))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') go(page + 1)
      else if (e.key === 'ArrowLeft') go(page - 1)
    }
    window.addEventListener('keydown', onKey)
    // The page underneath stays put while the walkthrough is up.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, page, go, close])

  if (!open || typeof document === 'undefined') return null
  const p = PAGES[page]

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How linking to Golf Ireland works"
      className="fixed inset-0 z-[90] intro-veil flex flex-col"
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        const start = touchX.current
        touchX.current = null
        if (start === null) return
        const dx = e.changedTouches[0].clientX - start
        if (Math.abs(dx) > 50) go(page + (dx < 0 ? 1 : -1))
      }}
    >
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] h-16">
        <div className="flex gap-1.5" aria-hidden="true">
          {PAGES.map((x, i) => (
            <span key={x.key} className={`h-2 rounded-full transition-all duration-300 ${i === page ? 'w-5 bg-accent-deep' : 'w-2 bg-line-strong'}`} />
          ))}
        </div>
        <button type="button" onClick={close} className="t-label text-ink/65 hover:text-ink px-2 py-2">
          Skip
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-6 overflow-hidden">
        <div key={p.key} className={`w-full max-w-[300px] ${dir > 0 ? 'step-in-forward' : 'step-in-back'}`}>
          <div className={`intro-card p-4 ${cardClass()}`} aria-hidden="true">
            {p.mock({ name, club, typed })}
          </div>
        </div>
      </div>

      <div
        className="bg-accent-deep text-white px-7 pt-10 pb-[max(env(safe-area-inset-bottom),24px)] shadow-floating-up"
        style={{ borderTopLeftRadius: '50% 48px', borderTopRightRadius: '50% 48px' }}
      >
        <div key={p.key} className="max-w-md mx-auto step-in-forward" aria-live="polite">
          <p className="t-label text-white mb-1 tabular-nums">{page + 1} of {PAGES.length}</p>
          <h2 className="t-h2 text-white mb-2">{p.title}</h2>
          <p className="text-[17px] leading-snug text-white min-h-[4.5em]">{p.text}</p>
        </div>
        <div className="max-w-md mx-auto flex gap-3 mt-5">
          {page > 0 && (
            <button
              type="button"
              onClick={() => go(page - 1)}
              className="min-h-12 px-5 rounded-button border border-white text-white text-[17px] font-semibold press"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => go(page + 1)}
            className={`${buttonClass('secondary', false)} flex-1`}
          >
            {page === last ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
