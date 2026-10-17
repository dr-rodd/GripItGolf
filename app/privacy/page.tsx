import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/config/site'
import { STRAVA_CACHE_DAYS, DEAD_CONNECTION_DAYS } from '@/lib/strava'
import { FINAL_GRACE_DAYS } from '@/lib/runChallenge'
import { BOARD_MAX_AGE_MS } from '@/app/run/[tripCode]/runs'
import { STRAVA_APPS_URL } from '@/lib/stravaLinks'
import { LegalPage, LegalSection, LEGAL_LINK } from '@/app/components/LegalPage'

export const metadata: Metadata = { title: `Privacy — ${SITE.name}` }

/**
 * The privacy notice — one for the whole site: every sport, and every one
 * still to come.
 *
 * Laid out the way the platform is: what every event holds whatever its
 * sport, then a section per sport for what only that sport adds (golf,
 * running, and Strava for runners who connect it), then the parts that are
 * the same for everybody — who can see what, why we may hold it, who else
 * handles it, how long it stays, your rights, what is kept on your phone.
 * **A new sport is a new section here, written before the sport opens** —
 * the page says so, and that is the promise to keep.
 *
 * Written to answer GDPR Art. 13, and what Strava's API Policy asks of an
 * app that connects to it: a lawful privacy policy reachable by a prominent
 * link (§7.3) — every front door carries one (`LegalLinks`) — what is
 * collected and how, how to withdraw and to have it deleted (§2.1, §2.5), a
 * support contact (§2.4), the statement that Strava may collect usage data
 * (§6.5), and who else processes it (§7.7).
 *
 * The retention figures are imported, never typed: the seven days, the
 * twenty-five and the three are the constants the nightly job runs on, so
 * the notice cannot promise one thing while the code does another.
 *
 * Plain language on purpose. Have it read by somebody qualified before
 * Strava's review — docs/run.md.
 */

const UPDATED = '17 October 2026'

const B = ({ children }: { children: React.ReactNode }) => <strong className="text-ink">{children}</strong>

export default function PrivacyPage() {
  const mail = <a href={`mailto:${SITE.supportEmail}`} className={LEGAL_LINK}>{SITE.supportEmail}</a>
  return (
    <LegalPage title="Privacy notice" updated={UPDATED}>
      <LegalSection title="Who we are">
        <p>
          {SITE.name} (greendot.live) runs live scoring and leaderboards for events — golf trips
          and tournaments, team running challenges, and more sports to come. This notice covers
          all of them.
          {SITE.controller ? ` Green Dot is run by ${SITE.controller}, who is responsible for your data (its “controller”, in data protection law).` : ''}{' '}
          For anything about your data, write to {mail}.
        </p>
      </LegalSection>

      <LegalSection title="The short version">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>We hold what an event needs to run, and nothing for advertising — no ads, no analytics tracking, nothing sold.</li>
          <li>There are no accounts. <B>An event&apos;s code is its key</B>: anyone with it can see the names, scores and leaderboards in that event.</li>
          <li>Strava is optional, only with your consent, and only for the challenge you connect it to.</li>
          <li>You can have your data deleted. Runners can do it themselves in one tap; anyone can write to {mail}.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What every event holds">
        <p>Whatever the sport:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><B>Names</B>, as you or the organiser typed them, and an optional nickname you choose.</li>
          <li><B>Teams and sides</B> you are placed on or pick.</li>
          <li>
            <B>The event itself</B> — its name, dates and venues, and anything the organiser adds:
            an itinerary (where the group stays, how it travels, what else is planned) and notices
            posted to the field. Only type into these what you are happy for everyone with the code
            to read.
          </li>
          <li>
            <B>The organiser&apos;s email address</B> — the lead player&apos;s, for a golf trip — used to
            send one confirmation email with the event&apos;s links. An organiser PIN is never sent to
            us: only a scrambled form of it, made on their own phone.
          </li>
          <li><B>Preferences</B>, such as dark mode, so they follow you between phones.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Golf">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><B>Handicaps</B> — the index you or the organiser give, and the course handicap worked out from it for each round.</li>
          <li><B>Men&apos;s or ladies&apos; card</B> — only to choose the right tees, pars and stroke indexes for you.</li>
          <li><B>Scores</B>, hole by hole, and the points and results worked out from them; match play results; tee times and the tee sheet.</li>
          <li><B>Putts and fairways</B>, only when a trip switches stats on.</li>
          <li>
            <B>Scorecard photos</B> taken for the card check are sent to Anthropic&apos;s Claude service to
            read the card&apos;s pars, indexes and ratings. The photo is not kept.
          </li>
          <li>
            <B>Courses</B> anybody adds — the course&apos;s name, county, website, holes and tees — are shared
            with everyone on Green Dot. They are about the course, not about you.
          </li>
          <li>
            <B>Weather</B> for a round is fetched from the Norwegian Meteorological Institute using the
            course&apos;s location. Nothing about you is sent.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Running">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><B>Runs you type in</B> — the activity, date, distance and, if you give it, the time.</li>
          <li>
            The others in your challenge see <B>your totals only</B> — points, distance and number of
            runs. Your runs themselves are shown only to you, on the Add tab.
          </li>
          <li>
            When a challenge ends its team standings are kept as its result, without anybody&apos;s
            runs.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Strava">
        <p>
          A runner can choose to connect Strava. Only with your consent, given on the
          challenge&apos;s Add tab before connecting, we keep, for each run, walk or hike you share on
          Strava: its type, date, distance, moving time, the device that recorded it, and
          Strava&apos;s reference for it — read automatically from Strava, from the challenge&apos;s start
          until it closes. We also keep the keys Strava gives us to read them, your Strava account
          number, and when you agreed. Nothing else: no maps, routes, titles, photos, heart rate or
          anything marked Only You.
        </p>
        <p>
          Your Strava runs count towards your totals like any other run, and are shown whole only
          to you. Strava data is never sold, never shared beyond the services listed below, and
          never passed to or used to train any artificial-intelligence tool.
        </p>
        <p>
          <B>How long it stays:</B> a connection lasts for its challenge only — until the challenge
          closes, {FINAL_GRACE_DAYS} days after its finish, or later if the organiser extends it.
          Then every Strava run in it is deleted and the connection ends; the team standings are
          kept as the challenge&apos;s final result, without anybody&apos;s runs. Before then, any Strava run
          we have not been able to re-confirm with Strava for {STRAVA_CACHE_DAYS} days is deleted; a
          run you delete or make private on Strava is removed within 48 hours; and a connection that
          has stopped working for {DEAD_CONNECTION_DAYS} days is treated as withdrawn and deleted.
        </p>
        <p>
          <B>Withdrawing:</B> tap Disconnect on the Add tab or in Settings, or remove Green Dot in
          your{' '}
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

      <LegalSection title="Who can see what">
        <p>
          Anyone with an event&apos;s code can open it and see what the event shows: names, teams,
          scores, leaderboards, the itinerary and notices. That is how the group follows along
          without accounts, and it is why a code should be shared only with the people it is for.
          Settings are behind the organiser&apos;s PIN, which guards against slips rather than a
          determined person. A running challenge never shows anybody&apos;s runs to anybody but them.
        </p>
      </LegalSection>

      <LegalSection title="Why we may hold it">
        <p>
          To run an event you take part in — including when an organiser adds you to one — we rely
          on our legitimate interest, and theirs, in the event working: scores counted, teams kept,
          the leaderboard right. The organiser&apos;s email is used to provide what they asked for.
          Strava data is held on your consent, which you can withdraw at any time.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles it">
        <p>Only the services that run the site and its support email, each bound to protect it:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <B>Vercel</B> — hosts the site and runs its server code. To keep a running leaderboard
            quick, it holds a copy of that challenge&apos;s runs for at most {BOARD_MAX_AGE_MS / 60_000} minutes.
          </li>
          <li><B>Supabase</B> — the database everything is stored in.</li>
          <li><B>Resend</B> — sends the confirmation email, and replies from {SITE.supportEmail}.</li>
          <li><B>ImprovMX</B> — receives email sent to {SITE.supportEmail} and passes it on.</li>
          <li><B>Google</B> — Gmail is where email to {SITE.supportEmail} is read and answered.</li>
          <li><B>Anthropic</B> — reads golf scorecard photos for the card check. No Strava data ever goes here.</li>
          <li><B>Strava</B> — the source of Strava runs, for runners who connect.</li>
        </ul>
        <p>
          Some of these process data outside the European Economic Area, under the safeguards the
          law requires for that, such as the European Commission&apos;s standard contractual clauses.
          A current list with where each processes data is available from {mail}.
        </p>
      </LegalSection>

      <LegalSection title="How long it stays">
        <p>
          An event&apos;s names, scores, runs and results stay for as long as the event does, so its
          leaderboard can still be read afterwards. A golf scorecard nobody came back to is closed,
          and its unfinished entries cleared away, automatically. Strava data follows the shorter
          limits above. Anyone can have their own data deleted sooner — see below — and the person
          who made an event can ask for the whole of it to be deleted.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask to see the data we hold about you and have a copy, have it corrected or
          deleted, limit or object to how it is used, and withdraw consent at any time. We answer
          within a month, and confirm in writing when it is done.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <B>Runners</B> see every run held for them on the Add tab, and can delete everything in
            one tap: Settings → Leave and delete my data, which confirms on screen when it is done.
          </li>
          <li>
            <B>Golfers</B> can give their handicap when they claim their spot and set their own
            nickname from the trip&apos;s home screen; the lead player or organiser can correct or
            remove a player in Trip Setup — removing a player deletes their scores with them.
          </li>
          <li>For anything else, or if you would rather not ask the organiser, write to {mail}.</li>
        </ul>
        <p>
          If you are unhappy with how we have handled your data, you can complain to the Data
          Protection Commission in Ireland (
          <a href="https://www.dataprotection.ie" target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
            dataprotection.ie
          </a>
          ) or the authority where you live.
        </p>
      </LegalSection>

      <LegalSection title="What is kept on your phone">
        <p>
          A few small cookies and stored settings, all needed for the site to work, none for
          tracking: which player you are on each event, so the screens are yours; whether you have
          seen the introduction; dark mode; that this phone unlocked an event&apos;s settings, for the
          session; that this phone made an event; and golf scores entered but not yet sent, so a
          bad signal on the course loses nothing. Clearing your browser&apos;s data removes them all.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          Green Dot is not aimed at children. Anyone under 16 should take part only with a parent or
          guardian&apos;s agreement, and should not connect Strava.
        </p>
      </LegalSection>

      <LegalSection title="New sports, and changes">
        <p>
          Green Dot is growing beyond golf and running. Each new kind of event is added to this
          notice before it opens, saying what it holds and why. If this notice changes, the date at
          the top changes with it; if what we read from Strava ever changes, runners are asked to
          agree again before anything new is read.
        </p>
        <p>
          See also the <Link href="/terms" className={LEGAL_LINK}>terms of use</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
