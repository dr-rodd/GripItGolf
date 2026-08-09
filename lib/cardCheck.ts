// Checking the course record against a photograph of the real scorecard.
//
// Last trip's biggest headache was correcting stroke indices, slopes and pars
// mid-trip — the ladies tees especially. This module is the pure half of the
// fix: what an extracted card looks like, whether an extraction can be
// trusted at all, and exactly which stored numbers disagree with it.
//
// **Pure. No I/O.** `app/api/card-check/route.ts` photographs, asks Claude,
// reads and writes — same division as `lib/weather.ts` against its route.
//
// Three rules this file exists to hold:
//
// - **A misread photo must never corrupt the record.** "Not a single tee or
//   index can be off by one" cuts both ways: a stroke index column that is
//   not a permutation of 1–18, a par outside 3–6, a half-read ladies card —
//   any of these fails validation outright and nothing is offered for
//   writing. A calm error beats a plausible wrong card.
// - **The ladies card is all or nothing, per column.** A card with ladies
//   par on twelve holes is a misread, not a partial truth — `courseCard.ts`
//   would render half of one set of numbers and half of the other.
// - **The most recent photo wins.** Nothing here accumulates: a diff is
//   computed from one extraction against the stored card, and applying it
//   overwrites the disputed fields. Photograph twice, the second extraction
//   replaces the first.

// ─── What Claude is asked to return ───────────────────────────

/**
 * The tee colours the `holes` table has a yardage column for.
 *
 * `yardage_black` … `yardage_claret` exist and have never held a value — a
 * confirmed card is how they start to. A tee colour outside this list has no
 * column, so its yardages are reported but never written.
 */
export const YARDAGE_TEES = [
  'black', 'blue', 'white', 'red', 'sandstone', 'slate', 'granite', 'claret',
] as const

/**
 * The `holes` columns the scoring and the card read — one list, shared by the
 * check and apply routes so what they fetch and what they hand back never
 * drift. (A Next route file may only export its handlers, so this lives here.)
 */
export const HOLE_COLUMNS =
  'id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies, ' +
  'yardage_black, yardage_blue, yardage_white, yardage_red, ' +
  'yardage_sandstone, yardage_slate, yardage_granite, yardage_claret'

export type ExtractedHole = {
  number: number
  par: number
  strokeIndex: number
  parLadies: number | null
  strokeIndexLadies: number | null
  /** Keyed by tee colour, lowercased. Only colours in YARDAGE_TEES are kept. */
  yardages: Record<string, number>
}

export type ExtractedTee = {
  /** The colour as printed — "Blue", "Red". */
  name: string
  gender: 'M' | 'F'
  par: number | null
  courseRating: number | null
  slope: number | null
}

export type ExtractedCard = {
  courseName: string | null
  holes: ExtractedHole[]
  tees: ExtractedTee[]
}

/**
 * The JSON schema the extraction is constrained to. Structured outputs do not
 * allow numeric ranges, so the real checks live in `validateCard` below.
 */
export const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courseName', 'holes', 'tees'],
  properties: {
    courseName: { type: ['string', 'null'] },
    holes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'par', 'strokeIndex', 'parLadies', 'strokeIndexLadies', 'yardages'],
        properties: {
          number: { type: 'integer' },
          par: { type: ['integer', 'null'] },
          strokeIndex: { type: ['integer', 'null'] },
          parLadies: { type: ['integer', 'null'] },
          strokeIndexLadies: { type: ['integer', 'null'] },
          yardages: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['tee', 'yards'],
              properties: {
                tee: { type: 'string' },
                yards: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    tees: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'gender', 'par', 'courseRating', 'slope'],
        properties: {
          name: { type: 'string' },
          gender: { type: 'string', enum: ['M', 'F'] },
          par: { type: ['integer', 'null'] },
          courseRating: { type: ['number', 'null'] },
          slope: { type: ['integer', 'null'] },
        },
      },
    },
  },
} as const

/**
 * What the extraction is told. The traps named here are the ones that made
 * mid-trip corrections necessary in the first place: ladies rows read as
 * men's, stroke index read off the wrong line, a total mistaken for a hole.
 */
export const EXTRACTION_PROMPT = `Read this golf scorecard photograph and extract its data exactly as printed.

For each of the 18 holes: the men's par, the men's stroke index, the ladies par and ladies stroke index if the card prints separate ladies rows (null if it does not), and the yardage for each tee colour shown.

Rules — accuracy matters more than completeness:
- A stroke index column is always a permutation of 1 to 18. If you cannot read a value with confidence, return null for that whole column rather than guessing — a wrong index is worse than none.
- Ladies rows are usually printed in red or marked "Ladies". Do not copy the men's figures into the ladies fields — return null for both ladies fields on every hole if the card has no separate ladies row.
- Ignore OUT, IN and TOTAL columns — holes only.
- Yardage tee names are the colour printed on the card (e.g. "Blue", "Red"), one entry per tee per hole. Skip a tee's yardage on a hole you cannot read.
- For each tee box shown on the card: its colour name, whether it is a men's or ladies tee (ladies tees are usually Red or Claret and carry the ladies ratings), its total par, and its course rating and slope if printed (often in a ratings box, e.g. "CR 71.4 / Slope 125"). Null for anything not printed.
- courseName is the club or course name printed on the card, null if unreadable.`

// ─── Raw shapes off the wire ──────────────────────────────────

type RawYardage = { tee: string; yards: number }
type RawHole = {
  number: number
  par: number | null
  strokeIndex: number | null
  parLadies: number | null
  strokeIndexLadies: number | null
  yardages: RawYardage[]
}
type RawCard = {
  courseName: string | null
  holes: RawHole[]
  tees: ExtractedTee[]
}

/**
 * The wire shape folded into the working one: holes sorted, yardages keyed by
 * lowercased colour, colours without a column dropped. Throws on nothing —
 * an unusable card comes back from `validateCard`, in words.
 */
export function normalizeCard(raw: RawCard): ExtractedCard {
  const holes = [...(raw.holes ?? [])]
    .sort((a, b) => a.number - b.number)
    .map(h => {
      const yardages: Record<string, number> = {}
      for (const y of h.yardages ?? []) {
        const key = String(y.tee ?? '').trim().toLowerCase()
        if ((YARDAGE_TEES as readonly string[]).includes(key) && Number.isFinite(y.yards)) {
          yardages[key] = y.yards
        }
      }
      return {
        number: h.number,
        // Nulls survive here so `validateCard` can name them; the types say
        // number because everything past validation is one.
        par: h.par as number,
        strokeIndex: h.strokeIndex as number,
        parLadies: h.parLadies ?? null,
        strokeIndexLadies: h.strokeIndexLadies ?? null,
        yardages,
      }
    })
  return {
    courseName: raw.courseName ?? null,
    holes,
    tees: (raw.tees ?? []).map(t => ({
      name: String(t.name ?? '').trim(),
      gender: t.gender === 'F' ? 'F' : 'M',
      par: t.par ?? null,
      courseRating: t.courseRating ?? null,
      slope: t.slope ?? null,
    })),
  }
}

// ─── Whether an extraction can be trusted ─────────────────────

const isPermutation = (values: number[]) => {
  if (values.length !== 18) return false
  const seen = new Set(values)
  if (seen.size !== 18) return false
  for (let i = 1; i <= 18; i++) if (!seen.has(i)) return false
  return true
}

/**
 * Every reason this extraction cannot be offered for writing. Empty means
 * trustworthy. Written for the person holding the phone — each line is a
 * sentence, not a code.
 */
export function validateCard(card: ExtractedCard): string[] {
  const problems: string[] = []
  const { holes } = card

  if (holes.length !== 18) {
    problems.push(`Read ${holes.length} holes instead of 18.`)
    return problems // Nothing below means anything without all 18.
  }
  for (let i = 0; i < 18; i++) {
    if (holes[i].number !== i + 1) {
      problems.push('The hole numbers do not run 1 to 18.')
      return problems
    }
  }

  const badPar = holes.filter(h => !Number.isInteger(h.par) || h.par < 3 || h.par > 6)
  if (badPar.length > 0) {
    problems.push(`Par looks wrong on hole ${badPar.map(h => h.number).join(', ')} — a par is 3 to 6.`)
  }

  if (holes.some(h => h.strokeIndex == null)) {
    problems.push('The stroke index column could not be read.')
  } else if (!isPermutation(holes.map(h => h.strokeIndex))) {
    problems.push('The stroke indices do not make a full set of 1 to 18.')
  }

  // The ladies card, all or nothing per column.
  const ladiesPars = holes.filter(h => h.parLadies != null)
  if (ladiesPars.length > 0 && ladiesPars.length < 18) {
    problems.push(`The ladies par was only read on ${ladiesPars.length} of 18 holes.`)
  }
  if (ladiesPars.length === 18) {
    const bad = holes.filter(h => !Number.isInteger(h.parLadies) || h.parLadies! < 3 || h.parLadies! > 6)
    if (bad.length > 0) {
      problems.push(`The ladies par looks wrong on hole ${bad.map(h => h.number).join(', ')}.`)
    }
  }
  const ladiesSIs = holes.filter(h => h.strokeIndexLadies != null)
  if (ladiesSIs.length > 0 && ladiesSIs.length < 18) {
    problems.push(`The ladies stroke index was only read on ${ladiesSIs.length} of 18 holes.`)
  }
  if (ladiesSIs.length === 18 && !isPermutation(holes.map(h => h.strokeIndexLadies!))) {
    problems.push('The ladies stroke indices do not make a full set of 1 to 18.')
  }

  for (const h of holes) {
    for (const [tee, yards] of Object.entries(h.yardages)) {
      if (!Number.isInteger(yards) || yards < 60 || yards > 700) {
        problems.push(`The ${tee} yardage on hole ${h.number} reads ${yards}, which cannot be right.`)
      }
    }
  }

  for (const t of card.tees) {
    if (t.par != null && (t.par < 60 || t.par > 80)) {
      problems.push(`The ${t.name} tee's par reads ${t.par}, which cannot be right.`)
    }
    if (t.slope != null && (t.slope < 55 || t.slope > 155)) {
      problems.push(`The ${t.name} tee's slope reads ${t.slope} — slope runs 55 to 155.`)
    }
    if (t.courseRating != null && (t.courseRating < 55 || t.courseRating > 85)) {
      problems.push(`The ${t.name} tee's course rating reads ${t.courseRating}, which cannot be right.`)
    }
  }

  return problems
}

// ─── The stored card, and how the two disagree ────────────────

/** A `holes` row as this module needs it — the scoring columns plus yardages. */
export type StoredHole = {
  id: string
  hole_number: number
  par: number
  stroke_index: number
  par_ladies?: number | null
  stroke_index_ladies?: number | null
} & Partial<Record<`yardage_${(typeof YARDAGE_TEES)[number]}`, number | null>>

export type StoredTee = {
  id: string
  name: string
  gender: string
  par: number
  course_rating: number
  slope: number
}

export type HoleChange = {
  holeNumber: number
  /** The column on `holes` this writes to. */
  column: string
  /** What the change is called on screen — "Par", "Ladies SI", "Blue yards". */
  label: string
  from: number | null
  to: number
}

export type TeeChange = {
  teeId: string
  teeName: string
  gender: string
  /** The column on `tees` this writes to. */
  column: 'par' | 'course_rating' | 'slope'
  label: string
  from: number
  to: number
}

export type CardDiff = {
  holeChanges: HoleChange[]
  teeChanges: TeeChange[]
  /** Tees the photo shows that the course record does not hold. Reported, never written. */
  unmatchedTees: string[]
}

export const diffIsEmpty = (d: CardDiff) =>
  d.holeChanges.length === 0 && d.teeChanges.length === 0

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Every stored number the photo disagrees with.
 *
 * The photo is only ever the challenger: a field it did not read (a null
 * ladies card, a missing slope) challenges nothing, so a card with no ladies
 * row never erases a stored one. The one asymmetry runs the other way — a
 * stored null against a read value is an addition, and shows as `from: null`.
 *
 * A tee's par is checked against the printed tee par where the photo has
 * one, and against the gender's hole-par total where it does not — the two
 * are the same number on any real card, and `PH = HI × Slope ÷ 113 + CR −
 * Par` reads `tees.par`, so a corrected card that left the tee par behind
 * would fix the holes and mis-hand every playing handicap.
 */
export function diffCard(
  card: ExtractedCard,
  storedHoles: readonly StoredHole[],
  storedTees: readonly StoredTee[],
): CardDiff {
  const holeChanges: HoleChange[] = []
  const byNumber = new Map(storedHoles.map(h => [h.hole_number, h]))

  const hasLadiesPar = card.holes.every(h => h.parLadies != null)
  const hasLadiesSI = card.holes.every(h => h.strokeIndexLadies != null)

  for (const h of card.holes) {
    const stored = byNumber.get(h.number)
    if (!stored) continue

    if (h.par !== stored.par) {
      holeChanges.push({ holeNumber: h.number, column: 'par', label: 'Par', from: stored.par, to: h.par })
    }
    if (h.strokeIndex !== stored.stroke_index) {
      holeChanges.push({ holeNumber: h.number, column: 'stroke_index', label: 'SI', from: stored.stroke_index, to: h.strokeIndex })
    }
    if (hasLadiesPar && h.parLadies !== (stored.par_ladies ?? null)) {
      holeChanges.push({ holeNumber: h.number, column: 'par_ladies', label: 'Ladies par', from: stored.par_ladies ?? null, to: h.parLadies! })
    }
    if (hasLadiesSI && h.strokeIndexLadies !== (stored.stroke_index_ladies ?? null)) {
      holeChanges.push({ holeNumber: h.number, column: 'stroke_index_ladies', label: 'Ladies SI', from: stored.stroke_index_ladies ?? null, to: h.strokeIndexLadies! })
    }
    for (const tee of YARDAGE_TEES) {
      const read = h.yardages[tee]
      if (read == null) continue
      const col = `yardage_${tee}` as const
      const held = (stored[col] ?? null) as number | null
      if (read !== held) {
        holeChanges.push({ holeNumber: h.number, column: col, label: `${cap(tee)} yards`, from: held, to: read })
      }
    }
  }

  // What each gender's holes add up to, for tees the card printed no par for.
  const menTotal = card.holes.reduce((s, h) => s + h.par, 0)
  const ladiesTotal = hasLadiesPar
    ? card.holes.reduce((s, h) => s + h.parLadies!, 0)
    : null

  const teeChanges: TeeChange[] = []
  const matched = new Set<string>()
  for (const t of card.tees) {
    const stored = storedTees.find(
      s => s.name.trim().toLowerCase() === t.name.toLowerCase() && s.gender === t.gender,
    )
    if (!stored) continue
    matched.add(`${t.name.toLowerCase()}:${t.gender}`)

    const wantPar = t.par ?? (t.gender === 'F' ? ladiesTotal ?? menTotal : menTotal)
    if (wantPar !== stored.par) {
      teeChanges.push({
        teeId: stored.id, teeName: stored.name, gender: stored.gender,
        column: 'par', label: 'Par', from: stored.par, to: wantPar,
      })
    }
    if (t.courseRating != null && t.courseRating !== Number(stored.course_rating)) {
      teeChanges.push({
        teeId: stored.id, teeName: stored.name, gender: stored.gender,
        column: 'course_rating', label: 'Course rating', from: Number(stored.course_rating), to: t.courseRating,
      })
    }
    if (t.slope != null && t.slope !== stored.slope) {
      teeChanges.push({
        teeId: stored.id, teeName: stored.name, gender: stored.gender,
        column: 'slope', label: 'Slope', from: stored.slope, to: t.slope,
      })
    }
  }

  // Stored tees the photo printed no box for still have to agree with the
  // corrected hole totals — otherwise a par fix lands on the holes and the
  // playing-handicap formula keeps reading the old total off `tees.par`.
  // A ladies tee is only challenged when the photo actually read a ladies
  // card; the men's total is not its number.
  const claimed = new Set(teeChanges.map(c => c.teeId))
  for (const stored of storedTees) {
    if (matched.has(`${stored.name.trim().toLowerCase()}:${stored.gender}`)) continue
    if (claimed.has(stored.id)) continue
    const total = stored.gender === 'F' ? ladiesTotal : menTotal
    if (total != null && total !== stored.par) {
      teeChanges.push({
        teeId: stored.id, teeName: stored.name, gender: stored.gender,
        column: 'par', label: 'Par', from: stored.par, to: total,
      })
    }
  }

  const unmatchedTees = card.tees
    .filter(t => !matched.has(`${t.name.toLowerCase()}:${t.gender}`))
    .map(t => `${t.name} (${t.gender === 'F' ? 'ladies' : 'men'})`)

  return { holeChanges, teeChanges, unmatchedTees }
}

// ─── Turning a diff into writes ───────────────────────────────

export type HoleUpdate = { holeNumber: number; fields: Record<string, number> }
export type TeeUpdate = { teeId: string; fields: Record<string, number> }

/** The diff's hole changes, one update per hole. */
export function holeUpdates(diff: CardDiff): HoleUpdate[] {
  const byHole = new Map<number, Record<string, number>>()
  for (const c of diff.holeChanges) {
    const fields = byHole.get(c.holeNumber) ?? {}
    fields[c.column] = c.to
    byHole.set(c.holeNumber, fields)
  }
  return [...byHole.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([holeNumber, fields]) => ({ holeNumber, fields }))
}

/** The diff's tee changes, one update per tee. */
export function teeUpdates(diff: CardDiff): TeeUpdate[] {
  const byTee = new Map<string, Record<string, number>>()
  for (const c of diff.teeChanges) {
    const fields = byTee.get(c.teeId) ?? {}
    fields[c.column] = c.to
    byTee.set(c.teeId, fields)
  }
  return [...byTee.entries()].map(([teeId, fields]) => ({ teeId, fields }))
}

// ─── Guarding the apply ───────────────────────────────────────
//
// The apply route takes updates back off the wire, so what it writes is
// checked again here — the same ranges validation used, per column. A column
// outside this map is refused outright.

const HOLE_COLUMN_RANGE: Record<string, [number, number]> = {
  par: [3, 6],
  stroke_index: [1, 18],
  par_ladies: [3, 6],
  stroke_index_ladies: [1, 18],
  ...Object.fromEntries(YARDAGE_TEES.map(t => [`yardage_${t}`, [60, 700]])),
}

const TEE_COLUMN_RANGE: Record<string, [number, number]> = {
  par: [60, 80],
  course_rating: [55, 85],
  slope: [55, 155],
}

const withinRanges = (
  fields: Record<string, unknown>,
  ranges: Record<string, [number, number]>,
  integersOnly: boolean,
) =>
  Object.entries(fields).every(([column, value]) => {
    const range = ranges[column]
    if (!range) return false
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    if (integersOnly && column !== 'course_rating' && !Number.isInteger(value)) return false
    return value >= range[0] && value <= range[1]
  })

/** Whether an update payload off the wire is shaped and ranged like one this module built. */
export function validHoleUpdate(u: unknown): u is HoleUpdate {
  if (typeof u !== 'object' || u === null) return false
  const { holeNumber, fields } = u as HoleUpdate
  return Number.isInteger(holeNumber) && holeNumber >= 1 && holeNumber <= 18
    && typeof fields === 'object' && fields !== null
    && Object.keys(fields).length > 0
    && withinRanges(fields, HOLE_COLUMN_RANGE, true)
}

export function validTeeUpdate(u: unknown): u is TeeUpdate {
  if (typeof u !== 'object' || u === null) return false
  const { teeId, fields } = u as TeeUpdate
  return typeof teeId === 'string' && teeId.length > 0
    && typeof fields === 'object' && fields !== null
    && Object.keys(fields).length > 0
    && withinRanges(fields, TEE_COLUMN_RANGE, true)
}
