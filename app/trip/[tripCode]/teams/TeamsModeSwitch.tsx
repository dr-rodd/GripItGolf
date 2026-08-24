'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import { hasUnlocked } from '@/lib/passcode'
import InlineUnlock from '@/app/components/InlineUnlock'

/**
 * One teams screen, two faces — decided by who is holding the phone.
 *
 * On an event whose team board says players pick their own, the field gets
 * the join screen with no PIN in the way (self-picking is the organiser's
 * standing grant), and the organiser gets the full editor — recognised by
 * the same sessionStorage unlock every gate writes, read the way
 * PasscodeGate reads it (fails closed on the server, corrects on
 * hydration). The inline unlock under the join screen is the door between
 * the two, so an organiser landing here cold is one PIN away from the
 * editor rather than locked into the join view.
 */
export default function TeamsModeSwitch({
  tripCode, passcodeHash, editor, join,
}: {
  tripCode: string
  passcodeHash: string | null
  editor: React.ReactNode
  join: React.ReactNode
}) {
  const remembered = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => hasUnlocked(tripCode), [tripCode]),
    () => false,
  )
  const [justUnlocked, setJustUnlocked] = useState(false)

  if (remembered || justUnlocked) return <>{editor}</>

  return (
    <>
      {join}
      {passcodeHash && (
        <div className="max-w-3xl mx-auto px-4 pb-10 -mt-4">
          <InlineUnlock
            tripCode={tripCode}
            passcodeHash={passcodeHash}
            onUnlocked={() => setJustUnlocked(true)}
            prompt="Organiser? Enter your PIN for the full editor."
          />
        </div>
      )}
    </>
  )
}
