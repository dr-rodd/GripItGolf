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

// ─── Getting there ─────────────────────────────────────────────
//
// One per mode the itinerary can store, and no more. `travel_mode` allows
// exactly car, flight and train — a ferry or a bus cannot be entered, so an
// icon for either would be an icon nothing can ever select. A stay takes
// IconHome above.
//
// Every journey used to share one arrow, which told you a journey was a
// journey and nothing else. On a trip whose itinerary is a flight, two drives
// and a train, the mode is the useful half of the line.

export const IconCar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M5 17h-2v-6l2 -5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0h-6" />
    <path d="M6 11h13" />
  </Svg>
)

export const IconPlane = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z" />
  </Svg>
)

export const IconTrain = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 13a3 3 0 0 0 -3 -3h-12a3 3 0 0 0 -3 3v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3 -3v-3z" />
    <path d="M3 14h18" />
    <path d="M12 10v-6" />
    <path d="M7 4h10" />
    <path d="M7 19l-2 2" />
    <path d="M17 19l2 2" />
  </Svg>
)

/** On the maps link beside a place. */
export const IconMapPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 11m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
  </Svg>
)
