import { initialsOf } from '@/lib/initials'

/**
 * The profile circle (D319): a member's initial in a circle — no photos on
 * Green Dot yet (Ross, 24 Nov 2026: overheads). 40px inside its 48px target.
 * Nothing known yet: the person mark.
 */
export default function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const t = initialsOf(name)
  return (
    <span aria-hidden="true" style={{ width: size, height: size }}
      className="rounded-full bg-accent-tint text-accent-deep border border-line flex items-center justify-center font-semibold leading-none select-none">
      <span style={{ fontSize: Math.round(size * 0.42) }}>{t || '·'}</span>
    </span>
  )
}
