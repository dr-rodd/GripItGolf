'use client'

import { useEffect } from 'react'
import { isStaleBuildError, reloadForNewVersion } from '@/lib/staleBuild'
import { buttonClass } from './ui'

/**
 * What a page shows when it fails, in place of Next's bare "Application
 * error". A failure that is only an older version of the site reloads onto
 * the new one by itself (lib/staleBuild.ts) and says so meanwhile; anything
 * else gets a calm sentence and a way to try again — a fresh load.
 */
export default function ErrorScreen({ error }: { error: Error }) {
  const reloading = isStaleBuildError(error)
  useEffect(() => {
    console.error('Page failed:', error)
    if (reloading) reloadForNewVersion()
  }, [error, reloading])

  return (
    <main className="min-h-dvh paper flex flex-col items-center justify-center px-6 text-center">
      <p className="t-h2 text-ink mb-2">{reloading ? 'Updating…' : 'Could not load this page'}</p>
      <p className="text-ink/65 text-sm mb-8 max-w-[22rem] leading-relaxed">
        {reloading
          ? 'Green Dot has been updated since this page opened. Loading the new version.'
          : 'Something went wrong on our side — try again.'}
      </p>
      {/* Offered while updating too: a reload already tried this minute
          is not repeated by itself, and the tap still works. */}
      <button type="button" onClick={() => window.location.reload()} className={`${buttonClass('primary')} max-w-xs`}>
        Try again
      </button>
    </main>
  )
}
