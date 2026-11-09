/**
 * Enter on a player's name goes on to their handicap (Ross, 4 and 9 Nov
 * 2026) — the one copy of that keystroke, for every form that asks a name
 * and then a handicap. Inside a form it stops Enter submitting it; where
 * the next box is not on the page (handicaps the organiser's), Enter does
 * what it always did.
 *
 * Pure apart from the one DOM lookup; safe to import into a browser file.
 */
export function enterGoesTo(nextId: string) {
  return (e: { key: string; preventDefault: () => void }) => {
    if (e.key !== 'Enter') return
    const next = typeof document !== 'undefined' ? document.getElementById(nextId) : null
    if (!next) return
    e.preventDefault()
    next.focus()
  }
}
