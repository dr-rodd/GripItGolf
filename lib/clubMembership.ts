// A club's memberships and who may enter its competitions — the only copy
// (stage (m); Ross, 17 Nov 2026). Pure: the Clubhouse, the club route, the
// booking route and the members app all read it.
//
// * A person's **gender** and **date of birth** are one value each, held on
//   their Green Dot account and set only by a club — copied onto every list
//   row of theirs so a club's filters read its own rows. A row nobody has
//   linked holds its own. The person sees them on their account and cannot
//   change them: their club does.
// * A club's **membership categories** (Full, 6 Day, Junior…): a name, a
//   short code for its spreadsheets, and the days of the week it plays. A
//   row has at most one; none means it plays any day.
// * A competition's **entry rules**: which genders, which categories, an
//   age band — each optional, every one set must say yes. A category ticked
//   on purpose may enter even on a day it does not normally play. Ages are
//   counted on the club's age date (1 January unless the club moves it).

export type Gender = 'M' | 'F'

/** How a gender reads: Ladies' and Men's for competitions (Ross, 17 Nov 2026), Male and Female on a list. */
export const GENDER_WORDS: Record<Gender, string> = { M: 'Male', F: 'Female' }
export const GENDER_COMP_WORDS: Record<Gender, string> = { M: 'Men’s', F: 'Ladies’' }
export const NOT_GIVEN = 'Not given'

/**
 * A cell as a spreadsheet gives it: a gender, `null` for an explicit "not
 * given" (n/a), `undefined` for an empty cell (change nothing), or 'bad'.
 */
export function readGender(raw: unknown): Gender | null | undefined | 'bad' {
  const s = (typeof raw === 'string' ? raw : '').trim().toLowerCase().replace(/[’'.]/g, '')
  if (!s) return undefined
  if (/^(n\/?a|none|not given|unknown|-|x)$/.test(s)) return null
  if (/^(m|male|man|men|mens|gent|gents|gentleman|boy)$/.test(s)) return 'M'
  if (/^(f|female|woman|women|womens|l|lady|ladies|girl)$/.test(s)) return 'F'
  return 'bad'
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** A real calendar date as YYYY-MM-DD, or null. */
function isoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** The oldest anybody on a list is taken to be: a date of birth before this is a typing slip. */
export const MAX_AGE = 110

/**
 * A date of birth as a spreadsheet or a box gives it — day first, the Irish
 * way (03/04/2010 is 3 April), or 2010-04-03, or 3 April 2010. Two-figure
 * years are refused: 03/04/10 could be 1910 or 2010. `null` for an explicit
 * "not given", `undefined` for an empty cell.
 */
export function readBirthDate(raw: unknown, today: string): { ok: true; value: string | null | undefined } | { ok: false; why: string } {
  const s = (typeof raw === 'string' ? raw : '').trim()
  if (!s) return { ok: true, value: undefined }
  if (/^(n\/?a|none|not given|unknown|-)$/i.test(s)) return { ok: true, value: null }
  let iso: string | null = null
  let m: RegExpExecArray | null
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) iso = isoDate(+m[1], +m[2], +m[3])
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s))) {
    if (m[3].length !== 4) return { ok: false, why: 'Write the year in full, like 03/04/2010.' }
    iso = isoDate(+m[3], +m[2], +m[1])
  } else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i.exec(s))) {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    iso = mon >= 0 ? isoDate(+m[3], mon + 1, +m[1]) : null
  }
  if (!iso) return { ok: false, why: 'That isn’t a date — write it like 03/04/2010.' }
  if (iso > today) return { ok: false, why: 'A date of birth can’t be in the future.' }
  if (Number(today.slice(0, 4)) - Number(iso.slice(0, 4)) > MAX_AGE) return { ok: false, why: 'Check the year — that’s over 110 years ago.' }
  return { ok: true, value: iso }
}

/** A stored date as a list shows it: 03/04/2010. */
export function birthDateLabel(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''
}

// ─── Ages, counted on the club's date ───────────────────────────

/** The club's age date, 'MM-DD'; absent or unreadable is 1 January. */
export function readAgeDate(raw: unknown): string {
  const m = /^(\d{2})-(\d{2})$/.exec(typeof raw === 'string' ? raw : '')
  return m && isoDate(2000, +m[1], +m[2]) ? `${m[1]}-${m[2]}` : '01-01'
}

/** The age date as a sentence says it: "1 February". */
export function ageDateLabel(mmdd: string): string {
  const d = readAgeDate(mmdd)
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`2000-${d}T12:00:00Z`))
}

/**
 * The day a season's ages are counted on, for a given day: the most recent
 * age date on or before it. With 1 February, a competition on 15 January
 * 2027 counts ages on 1 February 2026 — the season it belongs to.
 */
export function ageCountedOn(day: string, ageDate: string): string {
  const mmdd = readAgeDate(ageDate)
  const year = Number(day.slice(0, 4))
  // 29 February in a year without one counts on 1 March.
  const on = (y: number) => isoDate(y, +mmdd.slice(0, 2), +mmdd.slice(3, 5)) ?? `${y}-03-01`
  return on(year) <= day ? on(year) : on(year - 1)
}

/** Whole years from a date of birth to a day. */
export function ageOn(birth: string, day: string): number {
  const years = Number(day.slice(0, 4)) - Number(birth.slice(0, 4))
  return day.slice(5) >= birth.slice(5) ? years : years - 1
}

/** The dates of birth an age band covers on a day: born on or before `latest`, after `earliest`. */
export function birthRange(day: string, minAge: number | null, maxAge: number | null): { latest: string | null; earliest: string | null } {
  const shift = (years: number) => `${String(Number(day.slice(0, 4)) - years).padStart(4, '0')}${day.slice(4)}`
  return { latest: minAge !== null ? shift(minAge) : null, earliest: maxAge !== null ? shift(maxAge + 1) : null }
}

// ─── Categories ────────────────────────────────────────────────

/** Monday first, as the club's week is drawn: 0 Monday … 6 Sunday. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const

export interface Category {
  id: string
  name: string
  code: string
  /** The days it plays, 0 Monday … 6 Sunday. */
  days: number[]
}

export const CATEGORY_NAME_MAX = 40
export const CATEGORY_CODE_MAX = 12

/** A day's place in the club's week, 0 Monday … 6 Sunday. */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7
}

export function playsOn(c: Pick<Category, 'days'>, day: string): boolean {
  return c.days.includes(weekdayOf(day))
}

/** What a category plays, said short: "Every day", "6 days: not Saturday", "Mon, Wed, Fri". */
export function daysLine(days: number[]): string {
  const set = [...new Set(days)].filter(d => d >= 0 && d <= 6).sort()
  if (set.length === 7) return 'Every day'
  if (set.length === 0) return 'No days'
  if (set.length >= 5) return `${set.length} days: not ${EVERY_DAY.filter(d => !set.includes(d)).map(d => WEEKDAY_NAMES[d]).join(' or ')}`
  return set.map(d => WEEKDAYS[d]).join(', ')
}

/** A spreadsheet code from a name: "6 Day" → "6DAY", "Country Member" → "COUNTRYMEMBE". */
export function categoryCodeFrom(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CATEGORY_CODE_MAX) || 'CAT'
}

/** A code made unique among the club's others: "FULL", then "FULL2"… */
export function uniqueCode(base: string, taken: string[]): string {
  const t = new Set(taken.map(c => c.toUpperCase()))
  if (!t.has(base)) return base
  for (let i = 2; ; i++) {
    const c = `${base.slice(0, CATEGORY_CODE_MAX - String(i).length)}${i}`
    if (!t.has(c)) return c
  }
}

export function normaliseCode(raw: unknown): string {
  return (typeof raw === 'string' ? raw : '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Why a category cannot be saved — or null. `others` are the club's other categories. */
export function categoryIssue(c: { name: string; code: string; days: number[] }, others: Pick<Category, 'name' | 'code'>[]): string | null {
  const name = c.name.trim()
  if (!name) return 'Name the membership.'
  if (name.length > CATEGORY_NAME_MAX) return `Keep the name under ${CATEGORY_NAME_MAX} characters.`
  if (!c.code) return 'Give it a code for the spreadsheet — letters and numbers.'
  if (c.code.length > CATEGORY_CODE_MAX) return `Keep the code to ${CATEGORY_CODE_MAX} letters and numbers.`
  if (!c.days.length) return 'Tick at least one day it plays.'
  if (others.some(o => o.name.trim().toLowerCase() === name.toLowerCase())) return 'The club already has a membership by that name.'
  if (others.some(o => o.code.toUpperCase() === c.code)) return 'Another membership already uses that code.'
  return null
}

/** A category's days as stored, whatever was handed in. */
export function cleanDays(raw: unknown): number[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
}

// ─── A competition's entry rules ────────────────────────────────

/** Who may enter a competition. Every field absent or empty is no filter on it. */
export interface EntryRules {
  genders?: Gender[]
  /** Category ids. A category here may enter whatever its days say. */
  categories?: string[]
  minAge?: number
  maxAge?: number
}

export const AGE_MIN = 0
export const AGE_MAX = 120

/** Entry rules as stored or posted, cleaned; null when there are none. */
export function readEntryRules(raw: unknown): EntryRules | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const genders = Array.isArray(r.genders) ? [...new Set(r.genders.filter((g): g is Gender => g === 'M' || g === 'F'))].sort() : []
  const categories = Array.isArray(r.categories) ? [...new Set(r.categories.filter((c): c is string => typeof c === 'string' && c.length > 0))] : []
  const age = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= AGE_MIN && v <= AGE_MAX ? v : undefined)
  const out: EntryRules = {
    // Both genders ticked is no gender filter at all.
    ...(genders.length === 1 ? { genders } : {}),
    ...(categories.length ? { categories } : {}),
    ...(age(r.minAge) !== undefined ? { minAge: age(r.minAge) } : {}),
    ...(age(r.maxAge) !== undefined ? { maxAge: age(r.maxAge) } : {}),
  }
  return Object.keys(out).length ? out : null
}

/** Why entry rules cannot be saved — or null. `known` are the club's category ids. */
export function entryRulesIssue(r: EntryRules | null, known: string[]): string | null {
  if (!r) return null
  if (r.categories?.some(c => !known.includes(c))) return 'One of those memberships isn’t the club’s any more — look again.'
  if (r.minAge !== undefined && r.maxAge !== undefined && r.minAge > r.maxAge) return 'The youngest age must be under the oldest.'
  return null
}

/** An age band as words: "Aged 50 and over", "Under 18", "Aged 18 to 25". */
export function ageBandLine(minAge?: number, maxAge?: number): string | null {
  if (minAge !== undefined && maxAge !== undefined) return `Aged ${minAge} to ${maxAge}`
  if (minAge !== undefined) return `Aged ${minAge} and over`
  if (maxAge !== undefined) return `Under ${maxAge + 1}`
  return null
}

/** Who may enter, said short: "Ladies’ · Full and 6 Day members · Aged 50 and over" — or null for everybody. */
export function entryLine(r: EntryRules | null, categories: Pick<Category, 'id' | 'name'>[]): string | null {
  if (!r) return null
  const parts: string[] = []
  if (r.genders?.length === 1) parts.push(GENDER_COMP_WORDS[r.genders[0]])
  if (r.categories?.length) {
    const names = r.categories.map(id => categories.find(c => c.id === id)?.name).filter((n): n is string => !!n)
    if (names.length) parts.push(`${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} members`)
  }
  const age = ageBandLine(r.minAge, r.maxAge)
  if (age) parts.push(age)
  return parts.length ? parts.join(' · ') : null
}

/** What is known of a person for entering a competition. */
export interface Entrant {
  gender: Gender | null
  birthDate: string | null
  categoryId: string | null
}

/** Why someone may not enter, as a code and what the words need. */
export type EntryRefusal =
  | { code: 'no_gender' }
  | { code: 'gender'; allowed: Gender }
  | { code: 'category'; names: string[] }
  | { code: 'day'; day: string }
  | { code: 'no_birth' }
  | { code: 'age'; band: string }

/**
 * Whether this person may enter this competition, on its day — null when
 * they may. Every rule set must say yes. A category ticked on the
 * competition enters whatever its days say (Ross, 17 Nov 2026); with no
 * categories ticked, a person's own category must play that day, and one
 * with none plays any day.
 */
export function entryRefusal(o: {
  rules: EntryRules | null
  person: Entrant
  /** The person's category, if they have one. */
  category: Category | null
  /** The competition's day, YYYY-MM-DD. */
  day: string
  /** The club's age date, 'MM-DD'. */
  ageDate: string
  /** The club's categories, for naming them. */
  categories: Pick<Category, 'id' | 'name'>[]
}): EntryRefusal | null {
  const r = o.rules
  if (r?.genders?.length === 1) {
    if (!o.person.gender) return { code: 'no_gender' }
    if (o.person.gender !== r.genders[0]) return { code: 'gender', allowed: r.genders[0] }
  }
  if (r?.categories?.length) {
    if (!o.person.categoryId || !r.categories.includes(o.person.categoryId)) {
      return { code: 'category', names: r.categories.map(id => o.categories.find(c => c.id === id)?.name).filter((n): n is string => !!n) }
    }
  } else if (o.category && !playsOn(o.category, o.day)) {
    return { code: 'day', day: WEEKDAY_NAMES[weekdayOf(o.day)] }
  }
  if (r && (r.minAge !== undefined || r.maxAge !== undefined)) {
    if (!o.person.birthDate) return { code: 'no_birth' }
    const age = ageOn(o.person.birthDate, ageCountedOn(o.day, o.ageDate))
    if ((r.minAge !== undefined && age < r.minAge) || (r.maxAge !== undefined && age > r.maxAge)) {
      return { code: 'age', band: (ageBandLine(r.minAge, r.maxAge) ?? '').toLowerCase() }
    }
  }
  return null
}

/** A refusal in a sentence — to the person themselves (`who` null) or about somebody by name. */
export function refusalWords(f: EntryRefusal, who: string | null = null): string {
  const you = who === null
  switch (f.code) {
    case 'no_gender': return you ? 'Your club hasn’t recorded your gender — ask the club to add it.' : `The club hasn’t recorded ${who}’s gender.`
    case 'gender': return `This is a ${GENDER_COMP_WORDS[f.allowed].toLowerCase()} competition.`
    case 'category': {
      const names = f.names.length > 1 ? `${f.names.slice(0, -1).join(', ')} and ${f.names.at(-1)}` : f.names[0] ?? 'some'
      return `This competition is for ${names} members${you ? '' : ` — ${who} isn’t one`}.`
    }
    case 'day': return you ? `${f.day} isn’t one of your playing days.` : `${f.day} isn’t one of ${who}’s playing days.`
    case 'no_birth': return you ? 'Your club hasn’t recorded your date of birth — ask the club to add it.' : `The club hasn’t recorded ${who}’s date of birth.`
    case 'age': return `This competition is for players ${f.band}.`
  }
}

/**
 * The notice a refused member reads before a tee sheet offers Book (MS2,
 * D279): the reason first, then what follows from it. `where` is "book on
 * this tee sheet" or "book it". The reason is `refusalWords`' own.
 */
export function notEligibleLine(reason: string, where = 'book on this tee sheet'): string {
  const stem = reason.replace(/\.$/, '')
  return stem.includes(' — ') ? `${stem}. So you can’t ${where}.` : `${stem} — you’re not eligible to ${where}.`
}

/** What a member's clubs have recorded of them (stage (m)) — shown on their account, changed only by a club. */
export interface MyDetails {
  gender: Gender | null
  birthDate: string | null
  memberships: { club: string; name: string; days: number[] }[]
}

// ─── A pasted row's three cells ────────────────────────────────

/** What a pasted row's gender, date of birth and membership code become — each absent when its cell was empty. */
export interface RowExtras {
  gender?: Gender | null
  birthDate?: string | null
  categoryId?: string | null
}

/**
 * A pasted row's three cells read against the club's memberships and today —
 * or why the row cannot go in (said before anything is saved). "N/A" clears
 * a value; an empty cell changes nothing.
 */
export function resolveExtras(
  row: { gender?: string; birthDate?: string; category?: string },
  categories: Pick<Category, 'id' | 'code'>[],
  today: string,
): { ok: true; extras: RowExtras } | { ok: false; why: string } {
  const extras: RowExtras = {}
  if (row.gender !== undefined) {
    const g = readGender(row.gender)
    if (g === 'bad') return { ok: false, why: `“${row.gender}” isn’t a gender — Male, Female or N/A.` }
    if (g !== undefined) extras.gender = g
  }
  if (row.birthDate !== undefined) {
    const b = readBirthDate(row.birthDate, today)
    if (!b.ok) return { ok: false, why: b.why }
    if (b.value !== undefined) extras.birthDate = b.value
  }
  if (row.category !== undefined) {
    if (/^(n\/?a|none|-)$/i.test(row.category.trim())) extras.categoryId = null
    else {
      const code = normaliseCode(row.category)
      const found = categories.find(c => c.code === code)
      if (!found) return { ok: false, why: `No membership has the code “${row.category}” — add it in Memberships first.` }
      extras.categoryId = found.id
    }
  }
  return { ok: true, extras }
}
