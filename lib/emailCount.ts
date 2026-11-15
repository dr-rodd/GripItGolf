// How many emails Green Dot has sent today — the only copy of the rule
// (D160; Ross, 15 Nov 2026). Resend's free plan is 100 a day, shared by every
// email: sign-in codes (Supabase's, through Resend's SMTP), confirmations,
// Forgot PIN and club codes. **Green Dot stays on the free plan until a day
// passes 50** (D111); /admin shows the day's count against that line.
//
// Pure: the admin page pages through Resend's list and hands the times in.

export const EMAIL_DAY_LIMIT = 100
/** D111: the day that passes this is the day to move to Resend's paid plan. */
export const EMAIL_PAID_LINE = 50

/** The instant today began in Ireland, as an ISO string. */
export function irishMidnight(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0)
  const sinceMidnight = ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 + now.getMilliseconds()
  return new Date(now.getTime() - sinceMidnight).toISOString()
}

/** Of a page of sends (newest first), how many fall today, and whether the page reached past midnight. */
export function countSince(createdAt: readonly string[], since: string): { today: number; reachedPast: boolean } {
  const t = Date.parse(since)
  let today = 0
  for (const c of createdAt) {
    if (Date.parse(c) >= t) today++
    else return { today, reachedPast: true }
  }
  return { today, reachedPast: false }
}

/** The line /admin shows. */
export function emailCountLine(today: number): string {
  const head = `${today} email${today === 1 ? '' : 's'} sent today, of ${EMAIL_DAY_LIMIT} free`
  return today > EMAIL_PAID_LINE ? `${head} — past ${EMAIL_PAID_LINE}: time for Resend’s paid plan (D111)` : head
}
