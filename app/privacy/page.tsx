import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/config/site'
import { STRAVA_CACHE_DAYS, DEAD_CONNECTION_DAYS } from '@/lib/strava'
import { FINAL_GRACE_DAYS } from '@/lib/runChallenge'
import { STRAVA_APPS_URL } from '@/lib/stravaLinks'
import { LegalPage, LegalSection, LEGAL_LINK } from '@/app/components/LegalPage'

export const metadata: Metadata = { title: `Privacy — ${SITE.name}` }

/**
 * The privacy notice — every sport, one page.
 *
 * Written to answer what GDPR Art. 13 asks of a notice, and what Strava's
 * API Policy asks of an app that connects to it: a lawful privacy policy
 * reachable by a prominent link (§7.3), what is collected and how, how to
 * withdraw and how to have it deleted (§2.1, §2.5), a support contact
 * (§2.4), the statement that Strava may collect usage data (§6.5), and who
 * else processes it (§7.7).
 *
 * The retention figures are imported, never typed: the seven days, the
 * twenty-five and the three are the constants the nightly job runs on, so
 * the notice cannot promise one thing while the code does another.
 *
 * Plain language on purpose. Have it read by somebody qualified before
 * Strava's review — docs/run.md.
 */

const UPDATED = '13 October 2026'

export default function PrivacyPage() {
  const mail = <a href={`mailto:${SITE.supportEmail}`} className={LEGAL_LINK}>{SITE.supportEmail}</a>
  return (
    <LegalPage title="Privacy notice" updated={UPDATED}>
      <LegalSection title="Who we are">
        <p>
          {SITE.name} (greendot.live) runs live scoring and leaderboards for golf trips, golf
          tournaments and team running challenges.
          {SITE.controller ? ` It is run by ${SITE.controller}, the controller of your data.` : ''}{' '}
          For anything about your data, write to {mail}.
        </p>
      </LegalSection>

      <LegalSection title="What we hold, and why">
        <p>
          <strong className="text-ink">To run an event you are part of:</strong> your name as it was
          entered, the trip, tournament or challenge you are in, your team, and what you play or
          run — golf scores, handicaps, putts and fairways where a trip tracks them; runs typed in
          (activity, date, distance and, if given, time). An optional nickname and dark-mode
          choice, if you set them.
        </p>
        <p>
          <strong className="text-ink">To confirm an event to the person who made it:</strong> the
          lead player&apos;s or organiser&apos;s email address, used to send one confirmation email
          with the event&apos;s links. An organiser PIN is never sent to us — only a scrambled
          form of it, made on their own phone.
        </p>
        <p>
          <strong className="text-ink">On your phone:</strong> small cookies that remember which
          player you are on each event, whether you have seen the introduction, and dark mode. They
          are needed for the site to work; there is no advertising and no analytics tracking.
        </p>
        <p>
          We rely on our legitimate interest in running the event you joined, and on your consent
          for Strava (below), which you can withdraw at any time.
        </p>
      </LegalSection>

      <LegalSection title="Strava">
        <p>
          A runner in a running challenge can choose to connect Strava. Only with your consent,
          given on the challenge&apos;s Add tab before connecting, we keep, for each run, walk or
          hike you share on Strava: its type, date, distance, moving time, the device that recorded
          it, and Strava&apos;s reference for it — read automatically from Strava, from the
          challenge&apos;s start until it closes. We also keep the keys Strava gives us to read
          them, your Strava account number, and when you agreed. Nothing else: no maps, routes,
          titles, photos, heart rate or anything marked Only You.
        </p>
        <p>
          The others in your challenge see your totals only — points, distance and number of runs.
          Your runs themselves are shown only to you, on the Add tab. Strava data is never sold,
          never shared beyond the services listed below, and never passed to or used to train any
          artificial-intelligence tool.
        </p>
        <p>
          <strong className="text-ink">How long it stays:</strong> a connection lasts for its
          challenge only — until the challenge closes, {FINAL_GRACE_DAYS} days after its finish,
          or later if the organiser extends it. Then every Strava run in it is deleted and the
          connection ends; the team standings are kept as the challenge&apos;s final result,
          without anybody&apos;s runs. Before then, any Strava run we have not been able to
          re-confirm with Strava for {STRAVA_CACHE_DAYS} days is deleted; a run you delete or make
          private on Strava is removed within 48 hours; and a connection that has stopped working
          for {DEAD_CONNECTION_DAYS} days is treated as withdrawn and deleted.
        </p>
        <p>
          <strong className="text-ink">Withdrawing:</strong> tap Disconnect on the Add tab or in
          Settings, or remove Green Dot in your{' '}
          <a href={STRAVA_APPS_URL} target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
            Strava settings
          </a>
          . Either way your Strava runs and connection details are deleted from Green Dot straight
          away, and the screen confirms it.
        </p>
        <p>
          Strava&apos;s own{' '}
          <a href="https://www.strava.com/legal/privacy" target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
            privacy policy
          </a>{' '}
          covers what Strava does with your data; where it and this notice differ about Strava data,
          Strava&apos;s governs. Strava may monitor and collect usage data about how Green Dot uses
          its API, and may use it for any business purpose, including improving its API and
          platform, giving developer and user support, and checking that apps keep to its
          agreement.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles it">
        <p>Only the services that run the site, each bound to protect it:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong className="text-ink">Vercel</strong> — hosts the site and runs its server code.</li>
          <li><strong className="text-ink">Supabase</strong> — the database everything is stored in.</li>
          <li><strong className="text-ink">Resend</strong> — sends the one confirmation email.</li>
          <li>
            <strong className="text-ink">Anthropic</strong> — reads the photo of a golf scorecard when
            somebody uses the card check, to correct a course&apos;s pars and indexes. The photo is
            not kept, and no Strava data ever goes here.
          </li>
          <li><strong className="text-ink">Strava</strong> — the source of Strava runs, for runners who connect.</li>
        </ul>
        <p>
          Some of these process data outside the European Economic Area, under the safeguards the
          law requires for that, such as the European Commission&apos;s standard contractual clauses.
          A current list with where each processes data is available from {mail}.
        </p>
      </LegalSection>

      <LegalSection title="How long everything else stays">
        <p>
          An event&apos;s names, scores, runs and results stay for as long as the event does, so its
          leaderboard can still be read afterwards. Anyone can have their own data deleted — see
          below — and the person who made an event can ask for the whole event to be deleted.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask to see the data we hold about you and have a copy, have it corrected or
          deleted, limit or object to how it is used, and withdraw consent at any time. A runner can
          see every run we hold for them on the Add tab, and can delete everything in one tap:{' '}
          <strong className="text-ink">Settings → Leave and delete my data</strong>, which confirms
          on screen when it is done. For anything else, write to {mail} — we will confirm in writing
          when it is done.
        </p>
        <p>
          If you are unhappy with how we have handled your data, you can complain to the Data
          Protection Commission in Ireland (
          <a href="https://www.dataprotection.ie" target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
            dataprotection.ie
          </a>
          ) or the authority where you live.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Green Dot is not aimed at children. Anyone under 16 should take part only with a parent or
          guardian&apos;s agreement, and should not connect Strava.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this notice changes, the date at the top changes with it. If what we collect from
          Strava ever changes, runners are asked to agree again before anything new is read.
        </p>
        <p>
          See also the <Link href="/terms" className={LEGAL_LINK}>terms of use</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
