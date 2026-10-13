import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/config/site'
import { FINAL_GRACE_DAYS } from '@/lib/runChallenge'
import { LegalPage, LegalSection, LEGAL_LINK } from '@/app/components/LegalPage'

export const metadata: Metadata = { title: `Terms — ${SITE.name}` }

/**
 * The terms of use — every sport, one page.
 *
 * Mostly plain statements of how the site already works (the event code is
 * the only lock; an organiser answers for who they add). One clause is
 * there because Strava's API Policy requires it (§9.2): the terms must
 * disclaim every warranty on behalf of third-party service providers and
 * exclude them from liability for consequential, special, punitive and
 * indirect damages. It is written out in full, in capitals as such clauses
 * usually are, and must not be softened.
 *
 * Have it read by somebody qualified before Strava's review — docs/run.md.
 */

const UPDATED = '13 October 2026'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated={UPDATED}>
      <LegalSection title="Using Green Dot">
        <p>
          {SITE.name} (greendot.live) is free live scoring and leaderboards for golf trips, golf
          tournaments and team running challenges. By using it you agree to these terms and to our{' '}
          <Link href="/privacy" className={LEGAL_LINK}>privacy notice</Link>.
        </p>
        <p>
          <strong className="text-ink">The event code is the key.</strong> There are no accounts:
          anyone with an event&apos;s six-character code can open it, see its names, scores and
          leaderboards, and join it as its settings allow. Share a code only with the people it is
          meant for. An organiser PIN guards an event&apos;s settings against slips, not against a
          determined person.
        </p>
      </LegalSection>

      <LegalSection title="What you put in">
        <p>
          You are responsible for what you enter. Whoever makes an event, or adds people to one,
          should have their agreement to appear in it. Don&apos;t enter anything unlawful, offensive
          or someone else&apos;s private information, and don&apos;t try to break, overload or get
          round how the site works. We may remove content or events that do.
        </p>
      </LegalSection>

      <LegalSection title="Running challenges and Strava">
        <p>
          Connecting Strava is optional — runs can always be typed in instead. A connection lasts
          for its challenge only: it ends, and the Strava runs in the challenge are deleted, when
          the challenge closes, {FINAL_GRACE_DAYS} days after its finish or later if the organiser extends it.
          The team standings at that moment are the challenge&apos;s final result and do not
          change afterwards.
        </p>
        <p>
          Green Dot is not made, endorsed or supported by Strava. Your use of Strava stays subject
          to Strava&apos;s own terms.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          Green Dot relies on services run by other companies, including Strava, the services that
          host and store it, and the services that send its email.
        </p>
        <p className="uppercase text-[13px] leading-relaxed">
          On behalf of every third-party service provider, all warranties are disclaimed, whether
          express, implied or statutory, including any implied warranties of merchantability,
          fitness for a particular purpose and non-infringement. No third-party service provider
          is liable to you for any consequential, special, punitive or indirect damages arising
          from or in connection with your use of Green Dot.
        </p>
      </LegalSection>

      <LegalSection title="Green Dot itself">
        <p>
          Green Dot is provided as it is and as available, without any promise that it will always
          be running, error-free or right about every score. Results are for enjoyment; check
          anything that matters. As far as the law allows, we are not liable for any loss arising
          from using it. Nothing in these terms takes away rights you have as a consumer that the
          law does not let us exclude.
        </p>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We may change these terms; the date at the top changes with them. These terms are
          governed by the law of Ireland. Questions to{' '}
          <a href={`mailto:${SITE.supportEmail}`} className={LEGAL_LINK}>{SITE.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
