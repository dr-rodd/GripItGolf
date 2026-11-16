import { ButtonLink, cardClass } from '@/app/components/ui'

/**
 * The Clubhouse door for somebody without it (D212): one card, the way back
 * a secondary button — there is nothing to do here, so no emerald.
 */
export default function NoAccess() {
  return (
    <div className={`${cardClass('raised')} w-full max-w-[400px] p-6`}>
      <h1 className="t-h1 text-ink">Clubhouse</h1>
      <p className="text-ink text-[15px] leading-relaxed mt-3">You haven’t been given access to the Clubhouse.</p>
      <p className="t-cap text-ink/65 mt-1">Your club’s office can grant it.</p>
      <ButtonLink href="/" variant="secondary" className="mt-6">Back to Green Dot</ButtonLink>
    </div>
  )
}
