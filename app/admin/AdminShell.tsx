import Link from 'next/link'
import { logout } from './actions'
import { buttonClass, cardClass } from '@/app/components/ui'

/**
 * The frame around every admin screen: title, the section tabs, sign out.
 *
 * Not a layout on purpose — a layout cannot re-check the session cookie on
 * every navigation, so each page gates itself with requireAdmin() and then
 * wraps its content in this. The tab list lives here so a new admin section
 * is added in exactly one place.
 */

export type AdminSection = 'trips' | 'live' | 'courses'

const TABS: { key: AdminSection; href: string; label: string }[] = [
  { key: 'trips',   href: '/admin/trips',   label: 'Trips' },
  { key: 'live',    href: '/admin/live',    label: 'Live cards' },
  { key: 'courses', href: '/admin/courses', label: 'Courses' },
]

export default function AdminShell({
  active, subtitle, children,
}: {
  active: AdminSection
  /** The small line under the title — counts, mostly. */
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-dvh paper text-ink">
      <div className="border-b border-bark/12">
        <div className="max-w-4xl mx-auto px-4 pt-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-display)] text-xl">
              Admin
            </h1>
            {subtitle && <p className="text-ink/65 text-[13px] mt-0.5">{subtitle}</p>}
          </div>
          <form action={logout}>
            <button
              type="submit"
              className={`${buttonClass('secondary', false)} flex-shrink-0`}
            >
              Sign out
            </button>
          </form>
        </div>

        <nav className="max-w-4xl mx-auto px-4 mt-4 flex gap-1">
          {TABS.map(t => (
            <Link
              key={t.key}
              href={t.href}
              className={`px-3.5 py-2.5 rounded-t-lg t-label border-b-2 transition-colors ${
                t.key === active
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink/65 hover:text-ink'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">{children}</div>
    </main>
  )
}
