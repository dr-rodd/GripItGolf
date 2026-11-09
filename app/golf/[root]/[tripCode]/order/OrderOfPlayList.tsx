'use client'

import { useState, type ComponentProps } from 'react'
import MatchesSheet from '../session/MatchesSheet'

type SheetProps = Omit<ComponentProps<typeof MatchesSheet>, 'open' | 'onToggle'>

/**
 * The order of play's sessions, one open at a time (Ross, 9 Nov 2026): each
 * session's heading opens it and closes whichever was open. It opens on the
 * session asked for (`?round=`), else the one in play, else the next to
 * finish — worked out by the page.
 */
export default function OrderOfPlayList({ sheets, initialOpen }: {
  sheets: SheetProps[]
  initialOpen: string | null
}) {
  const [openId, setOpenId] = useState<string | null>(initialOpen)
  return (
    <div className="flex flex-col">
      {sheets.map(sheet => (
        <MatchesSheet
          key={sheet.roundId}
          {...sheet}
          open={openId === sheet.roundId}
          onToggle={() => setOpenId(id => (id === sheet.roundId ? null : sheet.roundId))}
        />
      ))}
    </div>
  )
}
