// The one confirmation email, as a document.
//
// Sent once per trip, ever, to the address volunteered at creation: the trip,
// the link, the QR, the code. This file is the whole message — from address,
// subject, HTML and plain-text — and none of the sending. app/api/
// trip-confirmation/route.ts does the I/O; keeping the words pure keeps them
// testable, and keeps the route about claiming and sending.
//
// An email is not a web page, and everything here follows from that:
//
// - **Tables and inline styles**, because that is the layout engine Gmail
//   and Outlook actually run. No stylesheet, no classes.
// - **A system font stack**, never a webfont. The brand arrives through the
//   colours and the wordmark image, not through the title face.
// - **Literal hexes**, necessarily — there is no globals.css in an inbox.
//   These are the light palette's own values (see docs/style-guide.md);
//   an email does not follow the reader's dark mode and should not try.
// - **The logo is an absolute production URL**, not a data URI (Gmail
//   strips those) and not an SVG (Gmail won't draw those either) —
//   public/email-logo.png exists for exactly this. Whatever deploy sends
//   the mail, the image must resolve for every inbox, which is why this one
//   URL ignores the dynamic-origin rule the trip link follows.
// - **The QR arrives as an inline attachment** referenced by cid:, the one
//   image form that renders reliably. QR_CID is the agreed name; the route
//   attaches a PNG under it.

export const CONFIRMATION_FROM = 'Green Dot <trips@greendot.live>'

/** The cid: the HTML references and the route attaches the QR PNG under. */
export const QR_CID = 'trip-qr'

/** Where the logo lives for inboxes — production, whoever sent the mail. */
const LOGO_URL = 'https://greendot.live/email-logo.png'

export function confirmationSubject(tripName: string, sport?: 'run'): string {
  return sport === 'run'
    ? `${tripName} is set up on Green Dot`
    : `${tripName} is booked on Green Dot`
}

/** "13–16 August", the month said once when it is one month. */
export function describeRange(start: string | null, end: string | null): string | null {
  const parse = (d: string | null) => {
    if (!d) return null
    const [y, m, day] = d.split('-').map(Number)
    if (!y || !m || !day) return null
    return new Date(Date.UTC(y, m - 1, day))
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', timeZone: 'UTC' })
  const a = parse(start)
  const b = parse(end)
  if (!a) return b ? fmt(b) : null
  if (!b || a.getTime() === b.getTime()) return fmt(a)
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${fmt(a).replace(/^\d+ /, '')}`
  }
  return `${fmt(a)} – ${fmt(b)}`
}

/** A trip name goes into markup; whatever it holds, it stays a name. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export type ConfirmationDetails = {
  tripName: string
  /** Already formatted — describeRange, or null when the trip has no dates. */
  dates: string | null
  /** The full trip URL, built from the creating deploy's own origin. */
  tripUrl: string
  tripCode: string
  /**
   * The organiser area's URL — events only, same origin rule as `tripUrl`.
   * Present, the message grows a clearly-labelled organiser section: the
   * admin link, and the reminder that the PIN is the one set at creation.
   * The PIN itself is never in the email — it is hashed on the organiser's
   * device and the server has never known it (lib/passcode.ts), which is a
   * posture this email keeps rather than trades away.
   */
  adminUrl?: string
  /**
   * A Green Dot Run challenge (lib/runChallenge.ts). Changes the words, never
   * the shape: the same link, QR, code and organiser block, said about a
   * challenge rather than a trip. Absent is golf, byte for byte as before.
   */
  sport?: 'run'
}

/**
 * The words that change between a golf message and a run challenge's. One
 * table, so the HTML and the text version cannot drift into saying two
 * different things.
 */
function wordsFor(d: ConfirmationDetails) {
  if (d.sport === 'run') {
    return {
      intro: 'Nice one — the challenge is set. Share the link so everyone can join a team.',
      open: 'Open the challenge',
      thing: 'challenge',
      codeLabel: 'Challenge code',
      admin: 'Your admin link opens the organiser area: teams, permissions and the points rules.',
      adminText: 'Your admin link (the organiser area)',
      created: 'when creating the challenge',
      signOff: 'Lace up — let’s go 🏃',
      signOffText: "Lace up — let's go 🏃",
    }
  }
  return {
    intro: 'Nice one — that’s a serious trip! Share the link with the other players.',
    open: 'Open your trip',
    thing: 'trip',
    codeLabel: d.adminUrl ? 'Event code' : 'Trip code',
    admin: 'Your admin link opens the organiser area: permissions, notices, starts and the event’s setup.',
    adminText: 'Your admin link (the organiser area)',
    created: 'when creating the event',
    signOff: 'Let’s go — launch ’em&nbsp;🏌️',
    signOffText: "Let's go — launch 'em 🏌️",
  }
}

export function confirmationHtml(d: ConfirmationDetails): string {
  const name = escapeHtml(d.tripName)
  const dates = d.dates ? escapeHtml(d.dates) : null
  const url = escapeHtml(d.tripUrl)
  const w = wordsFor(d)

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background-color:#F6F4F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F4F0;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">

          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${LOGO_URL}" width="176" height="36" alt="green dot." style="display:block;border:0;" />
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;color:#2B2118;padding-bottom:6px;">
              ${name}
            </td>
          </tr>
${dates ? `
          <tr>
            <td align="center" style="font-family:${FONT};font-size:16px;color:#4A3728;padding-bottom:8px;">
              ${dates}
            </td>
          </tr>
` : ''}
          <tr>
            <td align="center" style="font-family:${FONT};font-size:16px;line-height:1.5;color:#2B2118;padding:14px 12px 0;">
              ${w.intro.replace(/’/g, '&rsquo;')}
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 0 32px;">
              <a href="${url}" style="display:inline-block;background-color:#0A6B3C;color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:12px;">
                ${w.open}
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:10px;">
              <img src="cid:${QR_CID}" width="200" height="200" alt="QR code that opens the ${w.thing}" style="display:block;border:0;" />
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:14px;color:#4A3728;padding-bottom:24px;">
              or let players scan to join
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:15px;color:#2B2118;padding-bottom:28px;">
              ${w.codeLabel}: <strong>${escapeHtml(d.tripCode)}</strong>
            </td>
          </tr>
${d.adminUrl ? `
          <tr>
            <td style="padding:0 12px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF;border:1px solid #E4DFD7;border-radius:12px;">
                <tr>
                  <td style="padding:20px 22px;font-family:${FONT};font-size:14px;line-height:1.6;color:#2B2118;">
                    <strong style="font-size:15px;">You&rsquo;re the organiser — keep this email.</strong><br />
                    ${w.admin.replace(/’/g, '&rsquo;')}<br />
                    <a href="${escapeHtml(d.adminUrl)}" style="color:#0A6B3C;font-weight:600;text-decoration:underline;">Open the organiser area</a><br /><br />
                    <strong>Your organiser PIN</strong> is the one you set
                    ${w.created}. It was never sent to us and
                    cannot be recovered or changed &mdash; write it down.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
` : ''}
          <tr>
            <td align="center" style="font-family:${FONT};font-size:14px;line-height:1.5;color:#4A3728;padding:0 12px 20px;">
              <strong>Hot tip:</strong> pin the link in your messaging group for easy access.
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:16px;font-weight:600;color:#2B2118;padding-bottom:36px;">
              ${w.signOff.replace(/’/g, '&rsquo;')}
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:12px;line-height:1.5;color:#8A7B6E;">
              Sent by Green Dot because this address was given when the ${w.thing} was created.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** The same message for clients that show text — and for spam filters. */
export function confirmationText(d: ConfirmationDetails): string {
  const w = wordsFor(d)
  return [
    d.tripName,
    d.dates,
    '',
    w.intro.replace(/’/g, "'"),
    '',
    `${w.open}: ${d.tripUrl}`,
    `${w.codeLabel}: ${d.tripCode}`,
    ...(d.adminUrl ? [
      '',
      "YOU'RE THE ORGANISER — KEEP THIS EMAIL.",
      `${w.adminText}: ${d.adminUrl}`,
      `Your organiser PIN is the one you set ${w.created}.`,
      'It was never sent to us and cannot be recovered or changed — write it down.',
    ] : []),
    '',
    'Hot tip: pin the link in your messaging group for easy access.',
    '',
    w.signOffText,
    '',
    `Sent by Green Dot because this address was given when the ${w.thing} was created.`,
  ].filter(line => line !== null).join('\n')
}
