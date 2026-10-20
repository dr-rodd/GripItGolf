'use client'

import { useState } from 'react'
import Link from 'next/link'
import TripHeader from '@/app/components/TripHeader'
import GolfIrelandTour from '@/app/components/GolfIrelandTour'
import { LinkHeading, LinkedBadge } from '@/app/components/LinkMark'
import { buttonClass, cardClass } from '@/app/components/ui'

export default function DemoClient() {
  const [open, setOpen] = useState(true)
  return (
    <main className="min-h-dvh paper text-ink">
      <TripHeader backTo="/" />
      <div className="max-w-md mx-auto px-6 py-10">
        <div className={`p-4 ${cardClass()}`}>
          <LinkHeading>Linking to Golf Ireland</LinkHeading>
          <p className="text-ink/65 text-[13px] mt-3 leading-snug">
            A preview of how a league player links their Golf Ireland
            membership by number, once Golf Ireland allows it. Try it
            yourself: any number works, and nothing is sent anywhere.
          </p>
          <p className="text-ink text-sm mt-4">
            A linked player wears the mark{' '}
            <LinkedBadge size={16} className="align-text-bottom" />{' '}
            beside their name.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className={`${buttonClass('primary')} mt-6`}>
          Show me again
        </button>
        <Link href="/" className={`${buttonClass('quiet')} mt-2 w-full`}>
          Home
        </Link>
      </div>
      <GolfIrelandTour open={open} onClose={() => setOpen(false)} />
    </main>
  )
}
