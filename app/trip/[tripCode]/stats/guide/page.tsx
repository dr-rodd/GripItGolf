import TripHeader from '@/app/components/TripHeader'

/**
 * How the stats are worked out, for anyone who wants the equations.
 *
 * Linked from the foot of the stats hub and nowhere else. The panels
 * themselves carry no explainers, by request — the hub is an instrument,
 * and this page is its manual. Static prose: nothing here fetches, so it
 * needs no loading state and no dynamic rendering.
 *
 * Pitched at a school-leaver who remembers what an average is. Every rule
 * described here lives in lib/holeStats.ts — this page explains and never
 * computes, so it cannot drift into being a second copy of anything.
 */

/** A formula, set apart the way a textbook would. */
function Maths({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-bark/[0.05] border border-bark/[0.08] rounded-xl px-4 py-3 my-3 overflow-x-auto whitespace-pre text-[13px] leading-relaxed text-ink font-mono">
      {children}
    </pre>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="t-h2 text-ink mb-2">{title}</h2>
      <div className="flex flex-col gap-3 t-body text-ink/80 leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export default async function StatsGuidePage({
  params,
}: {
  params: Promise<{ tripCode: string }>
}) {
  const { tripCode } = await params

  return (
    <div className="min-h-dvh bg-cream has-tabbar page-enter text-ink">
      <TripHeader backTo={`/trip/${tripCode}/stats`} title="statsHub" />

      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="t-h1 text-ink mb-2">How the numbers work</h1>
        <p className="t-body text-ink/65 mb-8 leading-relaxed">
          Everything on the stats hub is worked out from two extra answers a
          hole — how many putts, and which way the tee shot went — plus the
          score that was already there. This page is the arithmetic, for
          anyone who wants it. Nothing here is needed to read the stats.
        </p>

        <Section title="The three yardsticks">
          <p>
            Every figure measures you against one of three things, and knowing
            which is half of reading the page.
          </p>
          <p>
            <strong className="text-ink">The course</strong> — your score
            against par. This is the yardstick that can be bad for everybody
            at once: on a windy day the whole trip can lose to the course.
            Shown as <em>Against the course</em>.
          </p>
          <p>
            <strong className="text-ink">Your handicap</strong> — Stableford
            points against two a hole. 36 points a round is playing exactly to
            your handicap; +3 is three points better than it promised.
          </p>
          <p>
            <strong className="text-ink">The field</strong> — everyone against
            everyone on the same holes. These are the strokes gained figures,
            and they always add up to exactly zero across the trip: a stroke
            gained by one player is a stroke lost by the rest. So the field
            can be all square while everyone is losing to the course — both
            are true, which is why both are shown.
          </p>
        </Section>

        <Section title="Strokes gained, vs the field">
          <p>
            Take one hole. Split everyone&apos;s score into two parts that add
            up to it: shots to reach the green, and putts.
          </p>
          <Maths>{`to green = score − putts
your gain = (everyone else's average) − (yours)`}</Maths>
          <p>
            Fewer shots is better, so the gain is <em>their average minus
            you</em> — positive means you beat the field. It is worked out
            separately for the to-green shots and the putts, and because both
            halves come off the same cards, they add up exactly to your gain
            in total shots. Add every hole together and that is the figure on
            the page. A hole only counts once at least three other players
            have a putt count on it.
          </p>
          <p>
            Why do the gains sum to zero? Adding up &quot;everyone else&apos;s
            total&quot; across all the players counts the whole field once
            for each player and removes each player once — the two cancel
            perfectly. It is the check the code is held to.
          </p>
        </Section>

        <Section title="Driving accuracy and approach">
          <p>
            The to-green half splits again using the fairway answer. Every
            hole has a <em>penalty</em>: how many more shots the field takes
            to reach the green after missing the fairway than after hitting
            it. Your driving figure is a bet against that penalty:
          </p>
          <Maths>{`penalty = (avg to-green after a miss) − (after a hit)
driving = (hit or not − field's hit rate) × penalty`}</Maths>
          <p>
            Hit a fairway everybody hits and you earn almost nothing; hit one
            nobody hits and you earn nearly the whole penalty. Miss, and you
            pay the same way. <strong className="text-ink">Approach is the
            rest</strong>: to-green gained minus driving — everything that
            happened after the tee shot. On a par 3 the tee shot <em>is</em>
            the approach, so the whole hole counts there.
          </p>
          <p>
            The penalty needs at least four cards on each side of the split
            to stand; below that, the hole pays no driving figure rather than
            a made-up one. More rounds make it sharper.
          </p>
        </Section>

        <Section title="Net: sharing the handicap over the holes">
          <p>
            For net figures, your course handicap is shared out over the 18
            holes and taken off before the comparison. Not equally: the gap
            between players is wider on hard holes, so the share tilts in a
            straight line across the stroke index — a 9-handicap carries 0.65
            of a shot on index 1 down to 0.35 on index 18, and the eighteen
            shares still add to exactly 9.
          </p>
          <Maths>{`share of hole = handicap ÷ 18 + tilt
expected score = par + share
net gain vs handicap = expected − actual`}</Maths>
          <p>
            <em>Vs handicap</em> is that expectation against your actual
            scores. <em>Net vs the field</em> subtracts each player&apos;s
            share first and then runs the same field arithmetic as gross.
            The advanced setting decides how much of each hole&apos;s share
            belongs to putting — a fifth by default — and can only ever move
            the split between putting and long game, never a total.
          </p>
        </Section>

        <Section title="Extra shots to the green">
          <p>
            &quot;Regulation&quot; is reaching the green with two putts left —
            par minus two shots. This figure is how far behind that schedule
            your long game runs, on average:
          </p>
          <Maths>{`extra = (shots to green) − (par − 2), averaged per hole`}</Maths>
          <p>
            0.0 is finding greens on schedule every time; +0.5 means half a
            shot a hole given away before the putter comes out. It measures
            against the course, not the field — so unlike strokes gained, the
            whole trip can be positive at once, and here positive is bad.
          </p>
        </Section>

        <Section title="Like-for-like putting">
          <p>
            A raw putting average flatters a player who misses greens: a chip
            that finishes close leaves an easier first putt than a green found
            from 160 yards. So the like-for-like lines compare your putts with
            the field&apos;s putts <em>in the same situation</em> — greens hit
            against greens hit, missed against missed.
          </p>
        </Section>

        <Section title="No returns">
          <p>
            A picked-up ball keeps its tee shot: the fairway answer still
            counts, because losing two balls right is exactly the miss worth
            recording. Everything else about the hole is left out — it is not
            a double, not part of any average, and never a putting stat. Its
            zero points do count against your handicap, the same way the
            leaderboard counts them.
          </p>
        </Section>

        <Section title="When a figure is worth printing">
          <p>
            A gain off a hole needs three other cards. A hole&apos;s
            difficulty rank is provisional under eight cards. A left-or-right
            miss tendency needs four misses with two thirds going the same
            way. The driving penalty needs four cards each side of the
            fairway split. Below any of these, the page shows a dash or says
            nothing — never a guess.
          </p>
        </Section>
      </div>
    </div>
  )
}
