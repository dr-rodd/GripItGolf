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
//   colours and the wordmark image, not through Clash Display.
// - **Literal hexes**, necessarily — there is no globals.css in an inbox.
//   These are the light palette's own values (see docs/design-system.md);
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

export function confirmationSubject(tripName: string): string {
  return `${tripName} is booked on Green Dot`
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
}

export function confirmationHtml(d: ConfirmationDetails): string {
  const name = escapeHtml(d.tripName)
  const dates = d.dates ? escapeHtml(d.dates) : null
  const url = escapeHtml(d.tripUrl)

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
              Nice one — that&rsquo;s a serious trip! Share the link with the other players.
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 0 32px;">
              <a href="${url}" style="display:inline-block;background-color:#0A6B3C;color:#FFFFFF;font-family:${FONT};font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:12px;">
                Open your trip
              </a>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom:10px;">
              <img src="cid:${QR_CID}" width="200" height="200" alt="QR code that opens the trip" style="display:block;border:0;" />
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:14px;color:#4A3728;padding-bottom:24px;">
              or let players scan to join
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:15px;color:#2B2118;padding-bottom:28px;">
              Trip code: <strong>${escapeHtml(d.tripCode)}</strong>
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:14px;line-height:1.5;color:#4A3728;padding:0 12px 20px;">
              <strong>Hot tip:</strong> pin the link in your messaging group for easy access.
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:16px;font-weight:600;color:#2B2118;padding-bottom:36px;">
              Let&rsquo;s go — launch &rsquo;em&nbsp;🏌️
            </td>
          </tr>

          <tr>
            <td align="center" style="font-family:${FONT};font-size:12px;line-height:1.5;color:#8A7B6E;">
              Sent by Green Dot because this address was given when the trip was created.
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
  return [
    d.tripName,
    d.dates,
    '',
    "Nice one — that's a serious trip! Share the link with the other players.",
    '',
    `Open your trip: ${d.tripUrl}`,
    `Trip code: ${d.tripCode}`,
    '',
    'Hot tip: pin the link in your messaging group for easy access.',
    '',
    "Let's go — launch 'em 🏌️",
    '',
    'Sent by Green Dot because this address was given when the trip was created.',
  ].filter(line => line !== null).join('\n')
}
