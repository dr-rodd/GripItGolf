'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ItineraryItem } from '@/lib/itinerary'
import { saveItinerary } from '@/lib/itineraryStore'
import ItineraryBuilder from '@/app/components/ItineraryBuilder'
import { IconX } from '@/app/components/icons'
import { buttonClass } from '@/app/components/ui'
import type { DirectoryCourse } from '@/lib/courseDirectory'

type Course = DirectoryCourse

/**
 * Editing the running order after the trip already exists.
 *
 * `ItineraryBuilder` is unchanged from what creation uses — this is a shell
 * around it that loads what is already saved, and writes back only what
 * changed rather than replacing the lot. See lib/itineraryStore.ts for why
 * that matters once rounds exist under the golf items.
 *
 * Its own full-screen overlay rather than living inside the gear sheet: the
 * builder already pins a footer of its own to the bottom of the screen, and
 * two competing fixed footers is exactly the glitch that footer was built to
 * avoid in the creation flow.
 *
 * **It sits above the tab bar, and the z-index is load-bearing.** This
 * overlay was `z-40`, the same rung the tab bar is on, and a tie is broken by
 * document order: the tab bar is rendered after it on the settings screen, so
 * it won, and covered the bottom 64px of this editor.
 *
 * That is precisely where the builder's Continue button sits, so it could be
 * seen and not pressed. The add sheets went with it — their own `z-50` is
 * measured inside this overlay's stacking context, not against the tab bar,
 * so "Add golf", "Add stay" and "Add journey" were all under the bar too.
 * A positioned element with a z-index of its own starts a stacking context,
 * and every z-index inside it is relative to *this* element from then on.
 *
 * So it is `z-50` — the rung modals are on, above the bar rather than level
 * with it. Covering the tab bar is right for a full-screen editor: the way
 * out is the X, not the nav underneath.
 */
export default function ItineraryEditor({
  tripId, startDate, endDate, courses, initialItems, canEditGolf, players, onClose,
}: {
  tripId: string
  startDate: string | null
  endDate: string | null
  courses: Course[]
  initialItems: ItineraryItem[]
  /**
   * Whether golf can be touched at all. False once the trip has scores
   * anywhere — a course change would orphan them, so editing golf itself is
   * what has to be refused rather than any single edit.
   */
  canEditGolf: boolean
  players: { id: string; handicap: number | null }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [before] = useState(initialItems)
  const [items, setItems] = useState(initialItems)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = items !== initialItems

  async function save() {
    setSaving(true)
    setError('')
    const result = await saveItinerary({
      tripId, startDate, before, after: items, canEditGolf, players,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // Rounds, dates and course names may all have changed — simplest to
    // re-read the trip rather than reconcile every downstream prop by hand.
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-bark/12 bg-cream">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close without saving"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-ink/65 hover:text-ink"
        >
          <IconX size={18} />
        </button>
        <h2 className="t-h2 text-ink">Itinerary</h2>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={`${buttonClass('primary', false)} px-5 py-2.5 text-[13px]`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {error && (
        <p className="flex-shrink-0 px-4 py-2 t-cap text-rust-deep bg-rust/10 border-b border-rust/25">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <ItineraryBuilder
          startDate={startDate}
          endDate={endDate}
          courses={courses}
          items={items}
          onChange={setItems}
          onContinue={save}
          lockGolf={!canEditGolf}
          continueLabel={saving ? 'Saving…' : 'Done'}
        />
      </div>
    </div>
  )
}
