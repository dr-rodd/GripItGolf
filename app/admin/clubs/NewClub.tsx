'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FIELD, FIELD_LABEL, buttonClass, cardClass } from '@/app/components/ui'
import { makeClub } from './actions'

/**
 * Set up a club (Ross, 17 Nov 2026: only Green Dot does, from here). The
 * account that owns it is named by username or email — it goes on the
 * club's list as its first owner — and the club is verified straight away.
 * A test club is made the same way.
 */
export default function NewClub() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ name: string; slug: string; owner: string } | null>(null)
  const [pending, start] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setMade(null)
    start(async () => {
      const r = await makeClub({ name, owner, ownerName })
      if (r.error || !r.made) { setError(r.error ?? 'Could not set the club up — try again.'); return }
      setMade(r.made); setName(''); setOwner(''); setOwnerName('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className={`${cardClass()} p-4 mb-6`}>
      <h2 className="t-card text-ink">Set up a club</h2>
      <p className="t-cap text-ink/65 mt-1">
        Only Green Dot sets clubs up. Name the Green Dot account that owns it; it is verified straight away and the owner finds it in their Clubs.
      </p>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div>
          <label htmlFor="nc-name" className={FIELD_LABEL}>Club name</label>
          <input id="nc-name" className={FIELD} value={name} onChange={e => { setName(e.target.value); setError(null) }} placeholder="e.g. Test Club" maxLength={60} />
        </div>
        <div>
          <label htmlFor="nc-owner" className={FIELD_LABEL}>Owner’s username or email</label>
          <input id="nc-owner" className={FIELD} value={owner} onChange={e => { setOwner(e.target.value); setError(null) }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div>
          <label htmlFor="nc-name-on-list" className={FIELD_LABEL}>Their name on the list <span className="text-ink/65 font-normal">(optional)</span></label>
          <input id="nc-name-on-list" className={FIELD} value={ownerName} onChange={e => { setOwnerName(e.target.value); setError(null) }} />
        </div>
      </div>
      {error && <p role="alert" className="t-cap text-rust-deep mt-3">{error}</p>}
      {made && <p role="status" className="t-cap text-accent-deep mt-3">Made {made.name} (greendot.live/club/{made.slug}), owned by {made.owner}.</p>}
      <button type="submit" disabled={pending || !name.trim() || !owner.trim()} className={`${buttonClass('primary', false)} mt-4`}>
        {pending ? 'Setting up…' : 'Set up the club'}
      </button>
    </form>
  )
}
