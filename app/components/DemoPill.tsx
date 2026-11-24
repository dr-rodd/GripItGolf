/**
 * "Demo" beside a test club's fictional member (D315, Ross, 24 Nov 2026):
 * t-label on the tint, bark text — quiet, the same by day and night. The one
 * copy; a screen draws it wherever it is told a name is a character's.
 */
export default function DemoPill({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center align-middle rounded-full bg-tint text-bark t-label px-2 py-0.5 leading-none whitespace-nowrap ${className}`}>
      Demo
    </span>
  )
}
