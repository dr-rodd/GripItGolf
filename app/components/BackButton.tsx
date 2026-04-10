import Link from "next/link"

type Props =
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }

const cls =
  "inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 text-[#C9A84C] hover:bg-white/15 hover:text-white transition-colors flex-shrink-0"

const icon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export default function BackButton({ href, onClick }: Props) {
  if (href) return <Link href={href} className={cls}>{icon}</Link>
  return <button onClick={onClick} className={cls}>{icon}</button>
}
