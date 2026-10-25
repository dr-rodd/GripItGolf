'use client'

import ErrorScreen from '@/app/components/ErrorScreen'
import './globals.css'

/**
 * A failure in the root layout itself — the last line before Next's bare
 * "Application error". It replaces the whole document, so it draws its own
 * html and body (lib/staleBuild.ts).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorScreen error={error} />
      </body>
    </html>
  )
}
