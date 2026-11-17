import { INVITE_DAYS } from '@/lib/clubs'
import { ACTIVITY_KEEP_MONTHS } from '@/lib/clubhouse'
import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE } from '@/config/site'
import { STRAVA_CACHE_DAYS, DEAD_CONNECTION_DAYS } from '@/lib/strava'
import { FINAL_GRACE_DAYS } from '@/lib/runChallenge'
import { BOARD_MAX_AGE_MS } from '@/app/run/[tripCode]/runs'
import { STRAVA_APPS_URL } from '@/lib/stravaLinks'
import {
  ATTEMPT_LIMITS, ATTEMPT_KEEP_HOURS, FORGET_ANONYMOUS_PHONES, FORGET_RULE, ORGANISER_HOURS,
} from '@/lib/membership'
import { ACCOUNT_ATTEMPT_KEEP_HOURS, CODE_LENGTH } from '@/lib/account'
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
 * the notice cannot promise one thing while the code does another. So are
 * the PIN retry limit and the phone identity's clear-out (lib/membership.ts),
 * and the clear-out is described as coming until FORGET_ANONYMOUS_PHONES is
 * switched on — flipping it changes the sentence.
 *
 * Plain language on purpose. Have it read by somebody qualified before
 * Strava's review — docs/run.md.
 */

const UPDATED = '15 November 2026'

const minutes = (ms: number) => ms / 60_000
const hours = (ms: number) => ms / 3_600_000

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
          <li>You never need an account to join, play, score or watch — only to make an event. <B>An event&apos;s code is its key</B>: anyone with it can see the names, scores and leaderboards in that event.</li>
          <li>An account is an email address, a username and a password, so your events follow you to another phone. Only whoever makes an event needs one, and you can delete it yourself in one tap.</li>
          <li>Strava is optional, only with your consent, and only for the challenge you connect it to.</li>
          <li>You can have your data deleted. Runners can do it themselves in one tap; anyone can write to {mail}.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What every event holds">
        <p>Whatever the sport:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><B>Names</B>, as you or the organiser typed them, and an optional nickname you choose.</li>
          <li><B>Teams and tags</B> you are placed on or pick.</li>
          <li>
            <B>The event itself</B> — its name, dates and venues, and anything the organiser adds:
            an itinerary (where the group stays, how it travels, what else is planned) and notices
            posted to the field. Only type into these what you are happy for everyone with the code
            to read.
          </li>
          <li>
            <B>The organiser&apos;s email address</B> — the lead player&apos;s, for a golf trip — used to
            send one confirmation email with the event&apos;s links, and a link to choose a new organiser PIN
            when somebody asks for one from the event. An event&apos;s PINs are kept only in a
            scrambled form. When somebody types one in, it is sent to us to be checked against that
            and is not kept.
          </li>
          <li><B>Preferences</B>, such as dark mode, so they follow you between phones.</li>
          <li>
            <B>A club&apos;s list</B>, where the event is run by a golf club on Green Dot — see Clubs below.
          </li>
        </ul>
        <p className="mt-3">
          To stop people guessing event PINs, we count wrong PINs for a short time: no more than{' '}
          {ATTEMPT_LIMITS.address.max} wrong tries at an event&apos;s PIN from one network in{' '}
          {minutes(ATTEMPT_LIMITS.address.windowMs)} minutes, and {ATTEMPT_LIMITS.event.max} from
          everywhere in {hours(ATTEMPT_LIMITS.event.windowMs) === 1 ? 'an hour' : `${hours(ATTEMPT_LIMITS.event.windowMs)} hours`}.
          The network address is scrambled before it is stored, never kept as the address itself,
          and each count is deleted within {(ATTEMPT_KEEP_HOURS * 2) / 24} days.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          You never need an account to join, play, score or watch. Making an event needs one, so the
          event has an owner who can always reach its settings. If you become a Green Dot member, we hold <B>your email address</B>, <B>the username you choose</B>, and{' '}
          <B>your password</B> — kept only in a scrambled form by Supabase, which runs the sign-in,
          and readable by nobody, us included — with when you signed in. We email you a{' '}
          {CODE_LENGTH}-digit code when you join or reset your password; the code is not kept once
          used. Your account is linked to the identity this phone already has, so the events it has
          entered stay with you on another phone. Wrong sign-ins are counted for a short while to
          stop guessing, with the network address and the name typed only ever kept scrambled, and
          the counts deleted within {(ACCOUNT_ATTEMPT_KEEP_HOURS * 2) / 24} days.
        </p>
        <p className="mt-3">
          Your account also remembers <B>the events you own</B> — ones you made while signed in, ones
          made with your email, and ones you add with their organiser PIN — whose settings are then
          open to you on any phone you are signed in on; and, when you claim your name in an event
          while signed in, <B>which player you are there</B>, so your events are listed together
          under My events. You can unlink a player at any time. Nobody else in an event sees your
          email address or username.
        </p>
        <p className="mt-3">
          <B>Deleting it:</B> Your account → Delete my account. Your email address, username,
          password, and the account&apos;s record of the events it entered, owns and is linked to are
          deleted straight away, and the screen says so. An event you owned carries on, run by its
          organiser PIN as before. Your names and scores stay with the events they were played in, as
          anybody&apos;s do; ask the organiser, or write to {mail}, to have those removed too. While you
          are the only owner of a club, make somebody else an owner first: a club always has one.
        </p>
      </LegalSection>

      <LegalSection title="Clubs">
        <p>
          A golf club on Green Dot can keep its list of members here: each person&apos;s <B>name</B>, the
          club&apos;s own <B>member number</B>, their national <B>(GUI) membership number</B> if they have
          one, their <B>email address</B>, and what they may do for the club: whether they play there, run
          its competitions (an Officer) or work in its office, the Clubhouse. The club&apos;s
          Clubhouse staff and owners add, change and remove those details, and are responsible for them being
          accurate; Green Dot holds them for the club, so members can link their own account and see
          the club&apos;s events and results. A member links their account themselves, with a code the
          club emails to the address on its list (the code is kept only in a scrambled form, and works
          once, for {INVITE_DAYS} days). Only the club&apos;s Clubhouse staff and owners see the list:
          on a phone membership numbers are shown partly hidden, and in the Clubhouse, the club&apos;s
          office on a computer, in full, and the list can be downloaded there as a file. Every change to the
          list is recorded — who made it, when, and what it was — so the club can see its own history; the
          record is kept for {ACTIVITY_KEEP_MONTHS} months. One GUI number links to one account, and an
          account may be on several clubs&apos; lists. Green Dot checks each club before it is verified.
        </p>
        <p className="mt-3">
          <B>Green Dot staff.</B> A few Green Dot people, named by Green Dot, can open any club&apos;s
          Clubhouse to set the club up and to help it — its list included. When they do, the club sees it:
          the visit and anything they change are recorded and shown to the club as &ldquo;Green Dot staff&rdquo;.
        </p>
        <p className="mt-3">
          <B>Your handicap index</B> is kept on your Green Dot account, one value: you set it on Me,
          and a club you are on the list of shows it there and may correct it. Somebody on a club&apos;s
          list without an account has the index the club gives them, until they link one. Every change
          is recorded — the old and new index, when, and by whom — so a club running a competition can
          see a change made on the day; the record is kept with the account, and goes when it does.
        </p>
        <p className="mt-3">
          <B>Gender, date of birth and membership.</B> A club may also record each person&apos;s{' '}
          <B>gender</B> (male, female or not given), <B>date of birth</B> (or not given) and{' '}
          <B>membership</B> — Full, 6 Day, Junior and the like, with the days each may play — so that a
          competition can be kept to men or ladies, to an age band or to some memberships, and so that
          players are given their own tees. They are one value for you everywhere: recorded by a club,
          kept on your Green Dot account and shown on every club list you are on. You see them on your
          account and cannot change them yourself; ask your club. Only the club&apos;s Clubhouse staff and
          owners, and Green Dot staff helping the club, see them; nobody else on the list does. A
          competition&apos;s booking says only whether somebody may enter and why, never their date of birth.
          The record of changes to a list notes that a gender or date of birth changed, never what it was.
          A junior&apos;s details are the club&apos;s to record, as anybody&apos;s are; Green Dot holds nothing
          more about a junior, and a junior needs their own account to play in a competition.
        </p>
        <p className="mt-3">
          <B>Club competitions.</B> To book a club&apos;s competition together, people on its list can find
          each other by name — the name only, never a number or an email — and see who is on each tee
          time. Every player in a club competition needs their own Green Dot account. Every member on
          the club&apos;s list may watch the club&apos;s events, and only the players on a competition&apos;s tee
          sheet score it; guests watch only where the club lets them, read-only, with its code. A
          competition card is signed twice — approved by its player on their own account and signed by a
          marker from the club&apos;s list — and each signature is recorded with who gave it and when, as is a
          card sent back, so the club can see how every card was signed. When a club&apos;s owner or admin
          certifies a competition&apos;s results, or reopens them, or marks a player No return, that is recorded
          with who did it and when; before certifying they see every handicap index changed that day for the
          competition&apos;s players. A competition&apos;s round counts towards your season only once certified.
        </p>
        <p className="mt-3">
          When a membership lapses, the golf played stays. When a club takes somebody off its list,
          their link to the club ends at once and the access it gave with it; their own account is
          never touched by a club, their names and scores stay with the events they played in, and
          the club decides whether they still appear on its leaderboards. If you delete your account,
          your golf stays on the leaderboards it was played on, and the club may choose to delete it
          from its own events. A club&apos;s list is deleted when the club is closed, and anybody on it can
          ask the club, or write to {mail}, to be taken off it.
        </p>
      </LegalSection>

      <LegalSection title="Golf">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><B>Handicaps</B> — the index you or the organiser give, and the course handicap worked out from it for each round.</li>
          <li><B>Men&apos;s or ladies&apos; card</B> — only to choose the right tees, pars and stroke indexes for you.</li>
          <li><B>Scores</B>, hole by hole, and the points and results worked out from them; match play results; tee times and the tee sheet.</li>
          <li>
            <B>Contact details</B> — a phone number and email, only if you give them, for arranging
            knockout matches. Shown to your opponent, or to the whole event if you choose.
          </li>
          <li><B>Putts and fairways</B>, only when a trip switches stats on.</li>
          <li>
            <B>Card summaries</B> — a short summary of each signed card (the course, the day, your
            strokes and points, putts, fairways and greens, birdies and the like), worked out from the
            scores, so a Green Dot member&apos;s own season can be shown without reading every hole again.
            Each says whether it was a club round or an open event&apos;s, where your name is your own say-so
            and never counts towards a club honour. Deleted with the event or the player, or by voiding
            the card; a club sees only its own events&apos; rounds.
          </li>
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
          without needing an account, and it is why a code should be shared only with the people it is for.
          Settings are behind the organiser&apos;s PIN, which guards against slips rather than a
          determined person. A running challenge never shows anybody&apos;s runs to anybody but them.
        </p>
        <p className="mt-3">
          An organiser can start a new event from one they have run before — the same knockout
          next year, say. With the old event&apos;s code its players&apos; names, handicaps and
          tees come across; with its organiser PIN, so does everything else players shared with
          it — contact details, nicknames, colours and home clubs — and its notices. So what you
          share with an event can be used by whoever holds its organiser PIN, in other events they
          run. In the new event it is seen exactly as before: your contact details only by the
          people you chose.
        </p>
      </LegalSection>

      <LegalSection title="Why we may hold it">
        <p>
          To run an event you take part in — including when an organiser adds you to one — we rely
          on our legitimate interest, and theirs, in the event working: scores counted, teams kept,
          the leaderboard right. The organiser&apos;s email, and an account&apos;s, are used to provide what
          they asked for. A club&apos;s list is held on the club&apos;s legitimate interest in running its
          membership, for the club.
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
          <li><B>Resend</B> — sends the confirmation email and sign-in codes, and replies from {SITE.supportEmail}.</li>
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
          <li>
            <B>An account</B> can be deleted by its owner in one tap: Your account → Delete my account.
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
          seen the introduction; dark mode; that this phone unlocked an event&apos;s settings, for{' '}
          {ORGANISER_HOURS} hours; that this phone made an event; the sign-in to your account, if you made one, with a note of which home it opens on (your own page, or your club&apos;s — never your name); and golf scores entered but not yet sent, so a
          bad signal on the course loses nothing. Clearing your browser&apos;s data removes them all.
        </p>
        <p className="mt-3">
          When you open or make an event, your phone is given a random identity so Green Dot knows
          which events it has entered and whether it may score or change settings. It carries no
          name, email or phone number; once you claim your name in an event, it records which player
          you are there. Supabase, which runs the sign-in, notes the network address and type of
          browser each identity signs in from. An identity that enters no event within{' '}
          {FORGET_RULE.noEventDays} days of being made, or whose events all ended more than{' '}
          {FORGET_RULE.afterEventDays} days ago (for an event with no end date, once it goes{' '}
          {FORGET_RULE.unseenDays} days unused),{' '}
          {FORGET_ANONYMOUS_PHONES
            ? 'is deleted, with its record of which events it entered.'
            : 'is to be deleted, with its record of which events it entered, by a nightly clear-out that is not switched on yet. Until it is, identities are kept.'}
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
