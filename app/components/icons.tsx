/**
 * Tabler Icons, outline style (MIT — https://tabler.io/icons).
 *
 * One icon set across the whole site, not just the nav. They are inlined
 * rather than pulled from a package: the site uses a dozen of them, and a
 * dozen paths is a smaller thing to carry than a dependency and its tree
 * shaking. Paths are copied verbatim so they stay recognisably Tabler.
 *
 * Every icon inherits `currentColor` and takes its size from `size`, so
 * colour and scale are decided by the caller.
 */

type IconProps = {
  size?: number
  className?: string
  /** Set when the icon is the only content of a control. */
  label?: string
}

function Svg({ size = 20, className = '', label, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {children}
    </svg>
  )
}

// ─── Bottom tab bar ────────────────────────────────────────────

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
    <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
  </Svg>
)

export const IconTrophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 21l8 0" />
    <path d="M12 17l0 4" />
    <path d="M7 4l10 0" />
    <path d="M17 4v8a5 5 0 0 1 -10 0v-8" />
    <path d="M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
  </Svg>
)

export const IconClipboardList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
    <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
    <path d="M9 12l.01 0" />
    <path d="M13 12l2 0" />
    <path d="M9 16l.01 0" />
    <path d="M13 16l2 0" />
  </Svg>
)

export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
    <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
  </Svg>
)

// ─── Elsewhere ─────────────────────────────────────────────────

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}><path d="M15 6l-6 6l6 6" /></Svg>
)

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}><path d="M9 6l6 6l-6 6" /></Svg>
)

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}><path d="M6 9l6 6l6 -6" /></Svg>
)

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></Svg>
)

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" />
    <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
    <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="M5 12l5 5l10 -10" /></Svg>
)

export const IconX = (p: IconProps) => (
  <Svg {...p}><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></Svg>
)

export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5l0 14" /><path d="M5 12l14 0" /></Svg>
)

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
    <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
  </Svg>
)

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9z" />
    <path d="M5 21v-7" />
  </Svg>
)

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z" />
    <path d="M16 3v4" /><path d="M8 3v4" /><path d="M4 11h16" />
  </Svg>
)

export const IconHeart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
  </Svg>
)
