'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { accountLink } from '@/lib/account'
import { askClub, readAccount, signOutAccount, type ClubSummary } from '@/lib/accountClient'
import { SECTIONS, clubhouseHref, sectionAt, type SectionKey } from '@/lib/clubhouse'
import { IconCalendar, IconClipboardList, IconClock, IconHome, IconSettings, IconTrophy, IconUsers } from '@/app/components/icons'
import { Pill, buttonClass } from '@/app/components/ui'
import NoAccess from '../NoAccess'
import { rememberClubhouse } from '../clubhouseClient'
import { ShellContext, shellOf, type ClubhouseFace } from './ShellContext'

type State =
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'lost' }
  | { kind: 'in'; club: ClubSummary; clubs: { slug: string; name: string }[] }

const ICON: Record<SectionKey, (p: { size?: number }) => React.ReactNode> = {
  overview: IconHome, members: IconUsers, memberships: IconClipboardList, events: IconTrophy, calendar: IconCalendar, teesheet: IconClock, settings: IconSettings,
}

/**
 * The Clubhouse's frame (D202, D212): a sidebar of 240 with the club's crest
 * and name (identity only — no art, D217), the way to the account's other
 * clubs, the sections, and the account with Sign out at the foot; the
 * section fills the rest, up to 1200 wide. Below 1024 the sidebar becomes a
 * bar across the top. The door is asked once, here: signed out goes to sign
 * in and back, no access is the one card, a lost signal says so with Try
 * again — never a blank page or a raw error.
 */
export default function ClubhouseShell({ face, children }: { face: ClubhouseFace; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [email, setEmail] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    void (async () => {
      const account = await readAccount()
      if (!live) return
      if (!account) { window.location.replace(accountLink(window.location.pathname + window.location.search)); return }
      setEmail(account.email)
      const r = await askClub('clubhouse', { slug: face.slug })
      if (!live) return
      if (r.ok && r.club) {
        rememberClubhouse(face.slug)
        setState({ kind: 'in', club: r.club, clubs: (r.myClubs ?? []).map(c => ({ slug: c.slug, name: c.name })) })
      } else if (!r.ok && /access to the Clubhouse|sign in/i.test(r.error)) {
        if (/sign in/i.test(r.error)) { window.location.replace(accountLink(window.location.pathname)); return }
        setState({ kind: 'none' })
      } else setState({ kind: 'lost' })
    })()
    return () => { live = false }
  }, [face.slug, attempt])

  const shell = useMemo(
    () => (state.kind === 'in' ? shellOf(face, state.club, c => setState(s => (s.kind === 'in' ? { ...s, club: c } : s))) : null),
    [face, state],
  )
  const here = sectionAt(pathname ?? '', face.slug)

  async function signOut() {
    await signOutAccount()
    window.location.replace('/')
  }

  if (state.kind === 'none') {
    return <main className="min-h-dvh paper flex items-center justify-center px-4 py-12"><NoAccess /></main>
  }

  const clubs = state.kind === 'in' ? state.clubs : []
  const nav = (
    <nav aria-label="Clubhouse" className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-1 px-1 lg:mx-0 lg:px-0">
      {SECTIONS.map(s => {
        const Icon = ICON[s.key]
        return (
          <Link key={s.key} href={clubhouseHref(face.slug, s.key)} aria-current={here === s.key ? 'page' : undefined}
            className="ch-nav ch-hover ch-focus flex-shrink-0 flex items-center gap-3 min-h-11 px-3 rounded-tile t-label text-ink">
            <Icon size={20} />{s.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div data-club style={face.style as React.CSSProperties} className="min-h-dvh paper lg:flex">
      <aside className="lg:w-60 lg:flex-shrink-0 lg:sticky lg:top-0 lg:h-dvh bg-surface border-b lg:border-b-0 lg:border-r border-line p-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {face.crestUrl ? (
            // The club's crest, resized on the server. Its name says who it is.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={face.crestUrl} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-contain bg-surface ring-2 ring-club flex-shrink-0" />
          ) : (
            <span aria-hidden="true" className="w-10 h-10 rounded-full ring-2 ring-club bg-club-tint flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="t-card text-ink leading-tight break-words">{face.name}</p>
            <p className="t-cap text-ink/65">Clubhouse</p>
          </div>
        </div>
        {clubs.length > 1 && (
          <label className="block">
            <span className="sr-only">Another club</span>
            <select value={face.slug} onChange={e => router.push(clubhouseHref(e.target.value))} className="field ch-focus">
              {clubs.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
        )}
        {nav}
        <div className="hidden lg:flex flex-col gap-2 mt-auto pt-4 border-t border-line">
          {shell?.staff && <Pill className="self-start">Green Dot staff</Pill>}
          {shell?.staff && <Link href="/clubhouse?find=1" className="ch-hover ch-focus t-label text-ink rounded-tile px-3 min-h-11 flex items-center">Find another club</Link>}
          <Link href={`/club/${face.slug}`} className="ch-hover ch-focus t-label text-ink rounded-tile px-3 min-h-11 flex items-center">The members app</Link>
          {email && <p className="t-cap text-ink/65 px-3 break-all">{email}</p>}
          <button type="button" onClick={() => void signOut()} className={`${buttonClass('quiet', false)} ch-focus self-start`}>Sign out</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 py-6 lg:px-8 lg:py-8">
        <div className="max-w-[1200px] mx-auto" aria-busy={state.kind === 'checking'}>
          {state.kind === 'checking' && (
            <div className="space-y-3">
              <div className="skeleton h-9 w-48 rounded-tile" />
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-12 rounded-tile" />)}
            </div>
          )}
          {state.kind === 'lost' && (
            <div role="alert">
              <p className="t-cap text-ink/80">Could not reach Green Dot — try again.</p>
              <button type="button" onClick={() => { setState({ kind: 'checking' }); setAttempt(a => a + 1) }}
                className={`${buttonClass('secondary', false)} mt-3`}>Try again</button>
            </div>
          )}
          {shell && <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>}
        </div>
        <div className="lg:hidden mt-12 pt-4 border-t border-line flex flex-wrap items-center gap-3">
          {shell?.staff && <Pill>Green Dot staff</Pill>}
          <Link href={`/club/${face.slug}`} className="t-label text-ink underline underline-offset-2">The members app</Link>
          <button type="button" onClick={() => void signOut()} className={buttonClass('quiet', false)}>Sign out</button>
        </div>
      </main>
    </div>
  )
}
