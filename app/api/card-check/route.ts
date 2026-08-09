import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  CARD_SCHEMA, EXTRACTION_PROMPT, HOLE_COLUMNS,
  normalizeCard, validateCard, diffCard,
  type StoredHole, type StoredTee,
} from '@/lib/cardCheck'

// A photograph of the real scorecard, checked against the course record.
//
// `lib/cardCheck.ts` decides everything — what an extraction must look like,
// whether it can be trusted, which stored numbers it disputes. This file
// receives the photo, asks Claude to read it, and runs those decisions.
// Writing happens in ./apply, and only after the person has seen the
// difference and said yes.
//
// The photo goes to the Claude API and nowhere else. Nothing is stored:
// a check that finds no differences leaves no trace at all.

export const dynamic = 'force-dynamic'
// Reading a dense scorecard takes real thought. Vercel's default window is
// shorter than a careful extraction.
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

/** ~6 MB of base64 — far above what the client's downscale produces. */
const MAX_IMAGE_CHARS = 8_000_000


export async function POST(req: NextRequest) {
  // Whatever breaks, the answer says so in words — an uncaught throw is a
  // 500 with an empty body, indistinguishable on a phone from no route at
  // all. Same rule as the weather route, for the same reason.
  try {
    return await handle(req)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error('card-check route threw:', e)
    return NextResponse.json(
      { ok: false, reason: 'error', message: `Could not check the card — try again. (${why})` },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    { courseId?: string; image?: string; mediaType?: string } | null

  const courseId = body?.courseId ?? ''
  const image = body?.image ?? ''
  const mediaType = body?.mediaType ?? ''

  if (!UUID.test(courseId)) {
    return NextResponse.json({ ok: false, reason: 'bad-request', message: 'A course id is required.' }, { status: 400 })
  }
  if (!image || typeof image !== 'string' || image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ ok: false, reason: 'bad-request', message: 'The photo could not be read — try again.' }, { status: 400 })
  }
  if (!MEDIA_TYPES.includes(mediaType as MediaType)) {
    return NextResponse.json({ ok: false, reason: 'bad-request', message: 'That image type is not supported — use a photo.' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // A missing key is a deployment gap, not a user mistake — say which.
    return NextResponse.json({
      ok: false, reason: 'not-configured',
      message: 'Card check is not set up yet — the site needs its ANTHROPIC_API_KEY.',
    })
  }

  const supabaseAdmin = createAdminClient()

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id, name')
    .eq('id', courseId)
    .maybeSingle()
  if (courseError) {
    console.error('card-check course query failed:', courseError)
    return NextResponse.json({ ok: false, reason: 'error', message: 'Could not read the course — try again.' })
  }
  if (!course) {
    return NextResponse.json({ ok: false, reason: 'no-course', message: 'No such course.' }, { status: 404 })
  }

  const [holesRes, teesRes] = await Promise.all([
    supabaseAdmin.from('holes').select(HOLE_COLUMNS).eq('course_id', courseId).order('hole_number'),
    supabaseAdmin.from('tees').select('id, course_id, name, gender, par, course_rating, slope').eq('course_id', courseId),
  ])
  if (holesRes.error || teesRes.error) {
    console.error('card-check card query failed:', holesRes.error ?? teesRes.error)
    return NextResponse.json({ ok: false, reason: 'error', message: 'Could not read the course card — try again.' })
  }

  const storedHoles = (holesRes.data ?? []) as unknown as StoredHole[]
  const storedTees = (teesRes.data ?? []) as unknown as StoredTee[]

  if (storedHoles.length === 0) {
    return NextResponse.json({
      ok: false, reason: 'no-card',
      message: 'This course has no card recorded yet, so there is nothing to check it against.',
    })
  }

  // ── Ask Claude to read the photo ──
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    output_config: {
      format: { type: 'json_schema', schema: CARD_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType as MediaType, data: image } },
        { type: 'text', text: EXTRACTION_PROMPT },
      ],
    }],
  })

  if (response.stop_reason === 'refusal') {
    return NextResponse.json({
      ok: false, reason: 'unreadable',
      message: 'That photo could not be read as a scorecard — try another.',
    })
  }
  if (response.stop_reason === 'max_tokens') {
    return NextResponse.json({
      ok: false, reason: 'unreadable',
      message: 'The card could not be read in full — try a clearer photo.',
    })
  }

  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    console.error('card-check extraction was not JSON')
    return NextResponse.json({
      ok: false, reason: 'unreadable',
      message: 'The card could not be read from that photo — try again.',
    })
  }

  const card = normalizeCard(raw as Parameters<typeof normalizeCard>[0])
  const problems = validateCard(card)
  if (problems.length > 0) {
    // A misread never reaches the diff: a wrong index offered for writing is
    // exactly the mid-trip headache this feature exists to end.
    return NextResponse.json({
      ok: false, reason: 'unclear',
      message: 'The photo could not be read confidently enough to trust.',
      problems,
    })
  }

  const diff = diffCard(card, storedHoles, storedTees)

  return NextResponse.json({
    ok: true,
    courseName: course.name,
    readCourseName: card.courseName,
    diff,
  })
}
