'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { golfItems, type ItineraryItem } from '@/lib/itinerary'
import { saveItinerary } from '@/lib/itineraryStore'
import ItineraryBuilder from '@/app/components/ItineraryBuilder'
import { IconX } from '@/app/components/icons'
import { buttonClass } from '@/app/components/ui'
import { usePlatformCourses } from '@/app/components/usePlatformCourses'

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
  tripId, tripName, startDate, endDate, initialItems, lockedGolfItemIds, trackStats, players, onClose,
}: {
  tripId: string
  /** Named in the header and in the removal confirm, so what is being edited
   * — and what a removal would come off — is never a guess. A round was once
   * deleted out of the wrong trip from a screen that never said whose
   * itinerary it was showing. */
  tripName: string
  startDate: string | null
  endDate: string | null
  initialItems: ItineraryItem[]
  /**
   * Golf items whose round already has a score or a card open on it. Those
   * cannot be removed or moved — the data under them is real. Adding new
   * golf, and editing rounds nobody has played, stays open for the whole
   * trip: an impromptu round is the point of being able to.
   */
  lockedGolfItemIds: string[]
  /** Whether the trip records stats — decides if a casual round asks about them. */
  trackStats: boolean
  players: { id: string; handicap: number | null }[]
  onClose: () => void
}) {
  const router = useRouter()
  // The picker's list, loaded here rather than handed down from Trip Setup.
  // This editor is mounted only once it is opened, so the catalogue is
  // fetched the first time somebody actually goes looking for a course —
  // not on every load of the tab. See `usePlatformCourses`.
  const { courses } = usePlatformCourses()
  const [before] = useState(initialItems)
  const [items, setItemsRaw] = useState(initialItems)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Whether the removal confirm is on screen. Opened by Save when the draft
  // drops golf, closed by any further edit — so what was confirmed is always
  // exactly what is written. While it is open, Save itself goes quiet: the
  // only way through is the panel's own button, which a double-tap on Save
  // can never reach.
  const [confirmOpen, setConfirmOpen] = useState(false)

  const setItems = (next: ItineraryItem[]) => {
    setConfirmOpen(false)
    setItemsRaw(next)
  }

  const dirty = items !== initialItems

  // Golf that was loaded and is gone from the draft — each one is a round
  // this save deletes, and deleting a round is the one edit on this screen
  // that cannot be walked back. So it is never one tap: the save names each
  // round, against the trip's own name, and asks.
  const removedGolf = useMemo(() => {
    const surviving = new Set(golfItems(items).map(i => i.id))
    return golfItems(before).filter(b => !surviving.has(b.id))
  }, [before, items])

  const courseName = (id: string | null | undefined) =>
    (id && courses.find(c => c.id === id)?.name) || 'course to be confirmed'

  function requestSave() {
    if (confirmOpen) return
    if (removedGolf.length > 0) {
      setConfirmOpen(true)
      return
    }
    void doSave()
  }

  async function doSave() {
    setConfirmOpen(false)
    setSaving(true)
    setError('')
    const result = await saveItinerary({
      tripId, startDate, before, after: items, lockedGolfItemIds, players,
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
        <div className="text-center min-w-0 px-2">
          <h2 className="t-h2 text-ink">Itinerary</h2>
          {/* Whose itinerary this is, said on the screen itself. Two trips'
              editors are otherwise identical, and an edit made on the wrong
              one is a real deletion on a real trip. */}
          <p className="t-cap text-ink/65 truncate">{tripName}</p>
        </div>
        <button
          type="button"
          onClick={requestSave}
          disabled={saving || !dirty || confirmOpen}
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

      {confirmOpen && (
        <div className="flex-shrink-0 px-4 py-3 bg-rust/10 border-b border-rust/25 space-y-2">
          <p className="t-label text-rust-deep">
            Saving removes {removedGolf.length === 1 ? 'a round' : `${removedGolf.length} rounds`} from {tripName}:
          </p>
          <ul className="space-y-0.5">
            {removedGolf.map(item => (
              <li key={item.id} className="t-cap text-ink/80">
                Day {item.dayIndex + 1} — {courseName(item.courseId)}
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className={`${buttonClass('secondary', false)} px-4 py-2 text-[13px]`}
            >
              Keep {removedGolf.length === 1 ? 'it' : 'them'}
            </button>
            <button
              type="button"
              onClick={doSave}
              className={`${buttonClass('danger', false)} px-4 py-2 text-[13px]`}
            >
              Remove and save
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <ItineraryBuilder
          startDate={startDate}
          endDate={endDate}
          courses={courses}
          items={items}
          onChange={setItems}
          onContinue={requestSave}
          lockedGolfIds={lockedGolfItemIds}
          trackStats={trackStats}
          continueLabel={saving ? 'Saving…' : 'Done'}
        />
      </div>
    </div>
  )
}
