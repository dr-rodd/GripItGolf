/**
 * A gross score, marked the way a scorecard marks it.
 *
 * Filled shapes, no outlines. The old card drew rings and boxes in thin
 * strokes, which at a glance turned a scorecard into a grid of outlines and
 * made a bogey look like an event. Most amateur holes are a bogey or a
 * double, so those two have to sit quietly: they are a wash of bark at a low
 * opacity, enough to group them by eye and no more.
 *
 * Under par is where the emphasis belongs, so that is where the colour is.
 *
 *   eagle or better   solid deep emerald disc, white numeral
 *   birdie            light emerald disc
 *   par               the bare number, nothing around it
 *   bogey             soft bark square
 *   double or worse   the same square, a shade stronger
 *
 * One component, used by every card in the app — the scoring flow, the live
 * panel, the leaderboard's scorecard sheet and the standalone scorecard — so
 * a birdie cannot come to look like one thing in one place and another
 * somewhere else.
 */

export type ScoreShapeSize = 'sm' | 'md' | 'lg'

/**
 * Every step lifted once — 13/15/17 became 15/17/19, with the box growing
 * with the numeral so the shapes keep their proportions.
 *
 * These are the figures somebody reads standing on a tee in the sun with the
 * phone at arm's length, and at the old sizes they were the smallest type on
 * a card rather than the largest. The ordering and the ratios are unchanged;
 * the whole scale simply sits a step higher.
 */
const BOX: Record<ScoreShapeSize, string> = {
  sm: 'w-7 h-7 text-[15px]',
  md: 'w-8 h-8 text-[17px]',
  lg: 'w-9 h-9 text-[19px]',
}

const base = (size: ScoreShapeSize) =>
  `${BOX[size]} font-[family-name:var(--font-serif)] leading-none ` +
  'inline-flex items-center justify-center tabular-nums'

export default function ScoreShape({
  gross, par, size = 'md',
}: {
  gross: number
  par: number
  size?: ScoreShapeSize
}) {
  const diff = gross - par
  const cls = base(size)

  // Eagle or better — the only score that gets a solid fill
  if (diff <= -2) {
    return <span className={`${cls} rounded-full bg-accent-deep text-white font-semibold`}>{gross}</span>
  }

  if (diff === -1) {
    return <span className={`${cls} rounded-full bg-accent/25 text-accent-deep font-semibold`}>{gross}</span>
  }

  // Par — nothing around it. The card should be quietest where it is level.
  if (diff === 0) {
    return <span className={`${cls} text-ink`}>{gross}</span>
  }

  // Bogey, then double or worse: the same shape one step stronger, both soft
  // enough that a card full of them still reads as a card.
  return (
    <span className={`${cls} rounded-lg text-ink ${diff === 1 ? 'bg-bark/[0.10]' : 'bg-bark/[0.20]'}`}>
      {gross}
    </span>
  )
}

/** A hole that was picked up. Never a score shape — it is the absence of one. */
export function NoReturnShape({ size = 'md' }: { size?: ScoreShapeSize }) {
  return (
    <span
      className={`${base(size)} rounded-lg bg-rust/15 text-rust-deep font-semibold`}
      title="No return"
    >
      NR
    </span>
  )
}
