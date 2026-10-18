'use client'

import { useState } from 'react'
import { buttonClass, cardClass } from '@/app/components/ui'

/**
 * The challenge code, and the link to send round — copied, or handed to the
 * phone's own share sheet where there is one. The link is built from the
 * page's own origin, so a preview deploy shares preview links.
 */
export default function RunShare({ code, name }: { code: string; name: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/run/${code}`
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: `Join ${name} on Green Dot — code ${code}`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* share sheet dismissed, or clipboard unavailable */ }
  }

  return (
    <div className={`p-5 text-center ${cardClass()}`}>
      <p className="t-label text-ink/80 mb-3">Challenge code</p>
      <p className="font-[family-name:var(--font-display)] text-[clamp(2rem,10vw,2.75rem)] leading-none text-accent-deep font-bold tracking-[0.12em] tabular-nums mb-4">
        {code}
      </p>
      <button type="button" onClick={share} className={buttonClass('secondary')}>
        {copied ? '✓ Link copied' : 'Share the link'}
      </button>
    </div>
  )
}
