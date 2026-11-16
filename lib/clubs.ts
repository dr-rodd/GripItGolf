// A golf club on Green Dot — the only copy of its rules (stage (c),
// D116–D117, D133, D138–D140; Ross, 14–15 Nov 2026).
//
// **A club is a workspace, not a login.** People sign in as themselves (a
// Green Dot member); a club is a list its owners and admins keep — names,
// the club's own member numbers, national (GUI) numbers, emails — and a
// person links their own account to their row by typing the code the club
// emails to the address on its list. A row exists before anybody has an
// account: the list is the club's, the link is the person's.
//
// **Standing is never stored on the account.** "Is there a row on a
// verified club's list linked to me" is asked afresh every time, so taking a
// row off the list (`removed_at`, the link cut) ends what it gave at once.
// A club never deletes anybody's account, and golf is never lost by a
// membership changing.
//
// **Nobody ever needs a club, or an account, to join, play, score or
// watch** (D94). Pure: no database, no browser — the screens and
// app/api/club/ both import it.

// ─── The club ──────────────────────────────────────────────────

export const CLUB_NAME_MIN = 3
export const CLUB_NAME_MAX = 60
/** How many clubs one account may set up, awaiting approval or not. */
export const MAX_CLUBS_MADE = 5

export type ClubRole = 'owner' | 'admin' | 'member'
export const CLUB_ROLES: readonly ClubRole[] = ['owner', 'admin', 'member']

/** A club's name as kept: trimmed, single-spaced. */
export function normaliseClubName(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

export function clubNameIssue(raw: string): string | null {
  const n = normaliseClubName(raw)
  if (n.length < CLUB_NAME_MIN) return 'Type the club’s name.'
  if (n.length > CLUB_NAME_MAX) return `Keep the name to ${CLUB_NAME_MAX} characters.`
  if (/[<>{}\\]/.test(n)) return 'Use letters, numbers and ordinary punctuation.'
  return null
}

/** The club's address-friendly name: "Royal Portrush GC" → "royal-portrush-gc". */
export function clubSlug(name: string): string {
  const s = normaliseClubName(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40).replace(/-+$/g, '')
  return s || 'club'
}

/**
 * Addresses no club may have: `/club/comp/<code>` is a competition's door
 * (stage (d1)), and a page's own folder always wins over a club's address.
 */
export const RESERVED_CLUB_SLUGS: readonly string[] = ['comp']

/** The slug with a number after it, for a name already taken (or reserved): "-2", "-3"… */
export function nextSlug(base: string, taken: readonly string[]): string {
  const blocked = [...taken, ...RESERVED_CLUB_SLUGS]
  if (!blocked.includes(base)) return base
  for (let i = 2; i < 1000; i++) if (!blocked.includes(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now().toString(36)}`
}

export type ClubStatus = 'pending' | 'verified' | 'refused'

export function clubStatus(c: { verifiedAt: string | null; refusedAt: string | null }): ClubStatus {
  if (c.verifiedAt) return 'verified'
  if (c.refusedAt) return 'refused'
  return 'pending'
}

export const CLUB_STATUS_WORDS: Record<ClubStatus, string> = {
  pending: 'Waiting for Green Dot to check it',
  verified: 'Verified',
  refused: 'Not approved — write to support',
}

// ─── Who may do what ───────────────────────────────────────────

/** Owners and admins keep the list and run the club's events (D139). */
export function mayAdminister(role: ClubRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Only an owner makes owners and admins, or takes the role away. */
export function mayChangeRoles(role: ClubRole | null | undefined): boolean {
  return role === 'owner'
}

/**
 * Why a change would leave the club with no owner on its list — or null.
 * `owners` counts the rows that are owners and not removed, before the change.
 */
export function lastOwnerIssue(target: { role: ClubRole; removed: boolean }, change: { role?: ClubRole; remove?: boolean }, owners: number): string | null {
  const isOwnerNow = target.role === 'owner' && !target.removed
  const staysOwner = !change.remove && (change.role ?? target.role) === 'owner'
  if (isOwnerNow && !staysOwner && owners <= 1) return 'A club always has an owner. Make somebody else an owner first.'
  return null
}

/** The role as a screen says it — never a bare "member" (D133). */
export function roleWord(role: ClubRole, clubName: string): string {
  return role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : `${clubName} member`
}

/** The club's people, as a screen says them (D133). */
export function clubMembersWord(clubName: string): string {
  return `${clubName} members`
}

// ─── The list ──────────────────────────────────────────────────

export const MEMBER_NAME_MAX = 80
export const NUMBER_MAX = 20
/** Rows one paste may bring. A bigger list goes in parts. */
export const MAX_LIST_ROWS = 2000

/** A row of the club's list as typed or pasted, before it is stored. */
export interface ListRow {
  name: string
  memberNumber: string | null
  guiNumber: string | null
  email: string | null
}

/** A number as kept: spaces gone, upper case. Null when empty. */
export function normaliseNumber(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').replace(/\s+/g, '').toUpperCase()
  return s ? s : null
}

export function numberIssue(n: string | null, label: string): string | null {
  if (!n) return null
  if (n.length > NUMBER_MAX) return `${label} is too long.`
  if (!/^[A-Z0-9][A-Z0-9\-/.]*$/.test(n)) return `${label} has characters a number doesn’t.`
  return null
}

export function normaliseListEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toLowerCase()
  return s ? s : null
}

/** Why one row will not do — null when it will. */
export function listRowIssue(r: ListRow): string | null {
  const name = normaliseClubName(r.name)
  if (!name) return 'No name.'
  if (name.length > MEMBER_NAME_MAX) return 'The name is too long.'
  const e = r.email
  if (e && (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return 'That email doesn’t look right.'
  return numberIssue(r.memberNumber, 'The member number') ?? numberIssue(r.guiNumber, 'The GUI number')
}

/** A row tidied as it would be stored. */
export function cleanRow(r: Partial<ListRow> & { name?: string }): ListRow {
  return {
    name: normaliseClubName(r.name ?? ''),
    memberNumber: normaliseNumber(r.memberNumber),
    guiNumber: normaliseNumber(r.guiNumber),
    email: normaliseListEmail(r.email),
  }
}

type Column = keyof ListRow
const HEADER_WORDS: [RegExp, Column][] = [
  [/gui|golf ?ireland|national|union|cgi|ilgu/i, 'guiNumber'],
  [/e-?mail/i, 'email'],
  [/member(ship)? ?(no|num|number|#|id)|club ?(no|number)|^no\.?$|^number$/i, 'memberNumber'],
  [/name/i, 'name'],
]
const DEFAULT_ORDER: Column[] = ['name', 'memberNumber', 'guiNumber', 'email']

function splitLine(line: string): string[] {
  const sep = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ','
  // A quoted cell may hold the separator ("O'Neill, Seán").
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === sep && !quoted) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(c => c.trim())
}

export interface ParsedList {
  rows: ListRow[]
  problems: { line: number; why: string }[]
}

/**
 * A pasted list — from a spreadsheet (tabs), a CSV file or typed with commas
 * — read as name, member number, GUI number, email. A first line naming its
 * columns is followed instead ("Surname, First name" become one name). An
 * email anywhere on a line is taken as the email whatever its column.
 */
export function parseMemberList(text: string): ParsedList {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim())
  const problems: ParsedList['problems'] = []
  const rows: ListRow[] = []
  let order: (Column | 'first' | 'last' | null)[] = DEFAULT_ORDER
  let start = 0
  const firstNonEmpty = lines.findIndex(l => l.length > 0)
  if (firstNonEmpty >= 0) {
    const cells = splitLine(lines[firstNonEmpty])
    const looksLikeHeader = !cells.some(c => /@/.test(c)) && cells.some(c => /name|number|email|gui/i.test(c))
    if (looksLikeHeader) {
      order = cells.map(c => {
        if (/first|forename|given/i.test(c)) return 'first'
        if (/surname|last|family/i.test(c)) return 'last'
        return HEADER_WORDS.find(([re]) => re.test(c))?.[1] ?? null
      })
      start = firstNonEmpty + 1
    }
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (rows.length >= MAX_LIST_ROWS) { problems.push({ line: i + 1, why: `Only ${MAX_LIST_ROWS} rows at a time — add the rest next.` }); break }
    const cells = splitLine(line)
    const r: Partial<ListRow> & { first?: string; last?: string } = {}
    cells.forEach((c, j) => {
      if (!c) return
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) { r.email = c; return }
      const col = order[j]
      if (col === 'first') r.first = c
      else if (col === 'last') r.last = c
      else if (col && !r[col]) r[col] = c
    })
    if (!r.name && (r.first || r.last)) r.name = [r.first, r.last].filter(Boolean).join(' ')
    const row = cleanRow(r)
    const why = listRowIssue(row)
    if (why) problems.push({ line: i + 1, why })
    else rows.push(row)
  }
  return { rows, problems }
}

/** A row as the list already holds it, for matching a new list against. */
export interface StoredRow {
  id: string
  name: string
  memberNumber: string | null
  guiNumber: string | null
  email: string | null
  removed: boolean
}

export interface ListPlan {
  inserts: ListRow[]
  /** Rows found by number or email: the new details, and back on the list if they had been removed. */
  updates: { id: string; patch: Partial<ListRow>; restore: boolean }[]
  /** The same person twice in what was pasted, or a number pointing at two rows. */
  skipped: { row: ListRow; why: string }[]
}

/**
 * What adding a list does to the list already there. A row is found by its
 * GUI number first — what makes a yearly renewal dependable — then the
 * club's member number, then the email; found, its details are brought up
 * to date (an empty cell never blanks a stored one) and a removed row comes
 * back. **Nobody is taken off by being missing from a list**: removing is a
 * deliberate act, one row at a time.
 */
export function planList(existing: readonly StoredRow[], incoming: readonly ListRow[]): ListPlan {
  const plan: ListPlan = { inserts: [], updates: [], skipped: [] }
  const seen = new Set<string>()
  const byGui = new Map(existing.filter(r => r.guiNumber).map(r => [r.guiNumber!, r]))
  const byNumber = new Map(existing.filter(r => r.memberNumber).map(r => [r.memberNumber!, r]))
  const byEmail = new Map(existing.filter(r => r.email).map(r => [r.email!, r]))
  const touched = new Set<string>()
  for (const raw of incoming) {
    const row = cleanRow(raw)
    const keys = [row.guiNumber && `g:${row.guiNumber}`, row.memberNumber && `m:${row.memberNumber}`, row.email && `e:${row.email}`].filter(Boolean) as string[]
    if (keys.some(k => seen.has(k))) { plan.skipped.push({ row, why: 'On the list twice.' }); continue }
    keys.forEach(k => seen.add(k))
    const byG = row.guiNumber ? byGui.get(row.guiNumber) : undefined
    const byM = row.memberNumber ? byNumber.get(row.memberNumber) : undefined
    const byE = row.email ? byEmail.get(row.email) : undefined
    const found = byG ?? byM ?? byE
    // A GUI number on one row and a member number on another: two people's
    // details crossed — left for the club to sort out by hand.
    const clash = [byG, byM].filter(Boolean).some(r => r!.id !== found?.id)
    if (clash) { plan.skipped.push({ row, why: 'Its numbers match two different people on the list.' }); continue }
    if (!found) { plan.inserts.push(row); continue }
    if (touched.has(found.id)) { plan.skipped.push({ row, why: 'On the list twice.' }); continue }
    touched.add(found.id)
    const patch: Partial<ListRow> = {}
    if (row.name && row.name !== found.name) patch.name = row.name
    if (row.memberNumber && row.memberNumber !== found.memberNumber) patch.memberNumber = row.memberNumber
    if (row.guiNumber && row.guiNumber !== found.guiNumber) patch.guiNumber = row.guiNumber
    if (row.email && row.email !== found.email) patch.email = row.email
    if (Object.keys(patch).length > 0 || found.removed) plan.updates.push({ id: found.id, patch, restore: found.removed })
  }
  return plan
}

/** A membership number shown partly hidden: "••••••789". */
export function maskNumber(n: string | null): string | null {
  if (!n) return null
  const shown = 3
  return n.length <= shown ? '•'.repeat(n.length) : `${'•'.repeat(n.length - shown)}${n.slice(-shown)}`
}

// ─── Joining a club by its code ────────────────────────────────

/** No 0/O, 1/I/L: read off a phone and typed into another. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const INVITE_LENGTH = 8
export const INVITE_DAYS = 14
/** One invite email a row in this long, so a tap twice sends once. */
export const INVITE_RESEND_MINUTES = 5
/** Wrong codes typed: per address, as the PIN's retry limit counts them. */
export const INVITE_TRY_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }

/** A code from random bytes the caller supplies (crypto on the server). */
export function inviteCodeFrom(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < INVITE_LENGTH; i++) s += INVITE_ALPHABET[bytes[i % bytes.length] % INVITE_ALPHABET.length]
  return s
}

/** As printed in the email: "K7Q2-M9XD". */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** What was typed, tidied: case, spaces and the dash forgiven. */
export function normaliseInviteCode(raw: string): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function inviteCodeIssue(raw: string): string | null {
  const c = normaliseInviteCode(raw)
  if (c.length !== INVITE_LENGTH || [...c].some(ch => !INVITE_ALPHABET.includes(ch))) return `The code is ${INVITE_LENGTH} letters and numbers, from the club’s email.`
  return null
}

/** The invite email, plain and HTML — no link: the code is typed on Green Dot. */
export function inviteEmail(d: { clubName: string; name: string; code: string; site: string }): { subject: string; text: string; html: string } {
  const code = formatInviteCode(d.code)
  const subject = `Your code to join ${d.clubName} on Green Dot`
  const lines = [
    `Hi ${d.name},`,
    `${d.clubName} has added you to its list on Green Dot. To link your own Green Dot account to it, sign in at ${d.site}/account, open Clubs, and type this code:`,
    code,
    `The code works for ${INVITE_DAYS} days, once. If you weren’t expecting this, you can ignore it — nothing happens unless the code is typed.`,
  ]
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const p = 'margin:0 0 16px;font:16px/1.5 Arial,Helvetica,sans-serif;color:#2b2622;'
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f3ea;"><div style="max-width:520px;margin:0 auto;">
<p style="${p}">${esc(lines[0])}</p>
<p style="${p}">${esc(lines[1])}</p>
<p style="margin:24px 0;font:700 28px/1 'Courier New',monospace;letter-spacing:4px;color:#2b2622;">${esc(code)}</p>
<p style="${p}color:#5b6660;font-size:14px;">${esc(lines[3])}</p>
</div></body></html>`
  return { subject, text: lines.join('\n\n'), html }
}

// ─── A club's events: who may change them (D138–D140) ──────────

/**
 * Who changes a club event. **Admins** — the club's owners and admins
 * only: the event carries an organiser PIN nobody is given, so every page
 * already locks, and the club's admins are its organisers on any phone they
 * are signed in on. **Pin** — the admins, and anyone they lend a PIN to
 * (a charity day with guests helping). **Anyone** — no PIN: everybody in
 * the event, as an open event is today.
 */
export type ClubAccess = 'admins' | 'pin' | 'anyone'
export const CLUB_ACCESS: readonly ClubAccess[] = ['admins', 'pin', 'anyone']

export const CLUB_ACCESS_WORDS: Record<ClubAccess, { label: string; line: string }> = {
  admins: { label: 'Club admins only', line: 'The club’s owners and admins, signed in. No PIN to keep.' },
  pin: { label: 'Club admins and anyone with the PIN', line: 'Lend a PIN to helpers for the day.' },
  anyone: { label: 'Anyone in the event', line: 'Everybody with the code can change it.' },
}

export function parseClubAccess(v: unknown): ClubAccess | null {
  return v === 'admins' || v === 'pin' || v === 'anyone' ? v : null
}

// ─── One club per account (D145, D150) ─────────────────────────

/** Why an account already on a club's list may not join or set up another. */
export function oneClubIssue(clubName: string): string {
  return `Your account is on ${clubName}’s list. One club per account for now.`
}

// ─── A club's crest and art (D118, D123–D126, D155, D156) ─────

export type ClubImageKind = 'crest' | 'art' | 'art_dark'
export const CLUB_IMAGE_KINDS: readonly ClubImageKind[] = ['crest', 'art', 'art_dark']
/** What each image is kept at: resized on the server, WebP (D156). */
export const ART_WIDTH = 1600
export const CREST_SIZE = 512
/** D126: art at least this wide, landscape. */
export const ART_MIN_WIDTH = 1170
export const CREST_MIN = 128
/** Vercel takes a request up to 4.5 MB; a little under, said plainly. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const UPLOAD_FORMATS = ['jpeg', 'png', 'webp'] as const

/** The column each image is kept in (migration 086 for the crest, 087 for the art). */
export const IMAGE_COLUMN: Record<ClubImageKind, 'crest_path' | 'art_path' | 'art_dark_path'> = {
  crest: 'crest_path', art: 'art_path', art_dark: 'art_dark_path',
}

/** Why an uploaded image will not do — null when it will. Width and height as the photo stands, turned upright. */
export function clubImageIssue(kind: ClubImageKind, img: { format: string | null; width: number; height: number; bytes: number }): string | null {
  if (img.bytes > MAX_UPLOAD_BYTES) return 'Keep the image under 4 MB.'
  if (!img.format || !(UPLOAD_FORMATS as readonly string[]).includes(img.format)) return 'Use a JPEG, PNG or WebP image.'
  if (kind === 'crest') {
    if (Math.min(img.width, img.height) < CREST_MIN) return `The crest needs to be at least ${CREST_MIN} pixels across.`
    return null
  }
  if (img.width <= img.height) return 'The art needs to be landscape — wider than it is tall.'
  if (img.width < ART_MIN_WIDTH) return `The art needs to be at least ${ART_MIN_WIDTH} pixels wide.`
  return null
}

/** Where a stored image is read from: the public bucket on Supabase (migration 087). */
export function clubAssetUrl(supabaseUrl: string | undefined, path: string | null): string | null {
  if (!path || !supabaseUrl || !/^[a-z0-9-]+\/[a-z_]+-[a-z0-9]+\.webp$/.test(path)) return null
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/club-assets/${path}`
}

// ─── A club's events, as its pages list them (D158, D159) ──────

export interface ClubEvent {
  code: string
  name: string
  kind: 'trip' | 'tournament' | 'run'
  startDate: string | null
  endDate: string | null
  /** D140: who changes it. 'anyone' is a guests-welcome event, the only kind the public face shows. */
  access: ClubAccess | null
}

export type ClubEventWhen = 'now' | 'upcoming' | 'past'

/** Whether an event is on now, still to come, or done — by its dates against today (an Irish date). */
export function clubEventWhen(e: Pick<ClubEvent, 'startDate' | 'endDate'>, today: string): ClubEventWhen {
  const start = e.startDate ?? e.endDate
  const end = e.endDate ?? e.startDate
  if (end && end < today) return 'past'
  if (start && start > today) return 'upcoming'
  if (!start && !end) return 'upcoming'
  return 'now'
}

/** Today's date in Ireland, `YYYY-MM-DD` — the club pages' one clock. */
export function irishToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/**
 * Events in the members area's order (D159) — a club's, or a Dot member's own on the personal page: on now, then upcoming
 * soonest first, then results newest first.
 */
export function groupClubEvents<E extends Pick<ClubEvent, 'startDate' | 'endDate' | 'name'>>(events: readonly E[], today: string): Record<ClubEventWhen, E[]> {
  const out: Record<ClubEventWhen, E[]> = { now: [], upcoming: [], past: [] }
  for (const e of events) out[clubEventWhen(e, today)].push(e)
  const by = (k: 'startDate' | 'endDate', dir: 1 | -1) => (a: E, b: E) =>
    dir * ((a[k] ?? '9999') < (b[k] ?? '9999') ? -1 : (a[k] ?? '9999') > (b[k] ?? '9999') ? 1 : a.name.localeCompare(b.name))
  out.now.sort(by('startDate', 1))
  out.upcoming.sort(by('startDate', 1))
  out.past.sort(by('endDate', -1))
  return out
}

/** The public face's events (D158): guests welcome only — never the club's own calendar. */
export function publicClubEvents(events: readonly ClubEvent[], today: string): ClubEvent[] {
  return events.filter(e => e.access === 'anyone' && clubEventWhen(e, today) !== 'past')
}

/** An event's dates as a line: "Sat 15 Nov", "15–17 Nov", or nothing. */
export function clubEventDates(start: string | null, end: string | null): string {
  const d = (s: string) => new Date(`${s}T12:00:00Z`)
  const day = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', ...o }).format(d(s))
  const a = start ?? end
  const b = end ?? start
  if (!a || !b) return ''
  if (a === b) return day(a, { weekday: 'short', day: 'numeric', month: 'short' })
  if (a.slice(0, 7) === b.slice(0, 7)) return `${day(a, { day: 'numeric' })}–${day(b, { day: 'numeric', month: 'short' })}`
  return `${day(a, { day: 'numeric', month: 'short' })} – ${day(b, { day: 'numeric', month: 'short' })}`
}
