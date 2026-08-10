import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  courseNameError, websiteError, normalizeWebsite, slugify, validNewTee,
  MAX_LOCATION,
  type NewTee,
} from '@/lib/courseDirectory'

// Adding a course to the platform directory, from the course picker.
//
// Courses are shared platform rows — trip_id null, visible to every trip —
// so an addition here is an addition for everyone, which is the point: the
// second group to play Lahinch should find it waiting. That is also why
// this is a route with the admin client rather than a client-side insert:
// the name check, the slug, and the tee validation happen where nobody can
// skip them.
//
// The course arrives unverified. `card_verified` stays false until a
// scorecard photo has confirmed the record — the card check flips it, not
// this route. Holes are never written here at all: pars and stroke indices
// only ever come from a card.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error('add-course route threw:', e)
    return NextResponse.json(
      { ok: false, message: `Could not add the course — try again. (${why})` },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    name?: string
    location?: string
    website?: string
    tees?: unknown[]
  } | null

  const name = String(body?.name ?? '').trim()
  const location = String(body?.location ?? '').trim().slice(0, MAX_LOCATION)
  const websiteInput = String(body?.website ?? '')
  const teesRaw = Array.isArray(body?.tees) ? body!.tees! : []

  const websiteProblem = websiteError(websiteInput)
  if (websiteProblem) {
    return NextResponse.json({ ok: false, message: websiteProblem }, { status: 400 })
  }
  const website = normalizeWebsite(websiteInput)

  const tees = teesRaw.filter(validNewTee)
  if (tees.length !== teesRaw.length) {
    return NextResponse.json(
      { ok: false, message: 'One of the tees could not be read — check its numbers and try again.' },
      { status: 400 },
    )
  }
  // Two Whites for the men is one White too many.
  const teeKeys = new Set(tees.map((t: NewTee) => `${t.name.toLowerCase()}:${t.gender}`))
  if (teeKeys.size !== tees.length) {
    return NextResponse.json(
      { ok: false, message: 'Two tees share a name — each colour appears once per men’s and ladies card.' },
      { status: 400 },
    )
  }

  const supabaseAdmin = createAdminClient()

  // The duplicate check runs against the live list, not whatever the form
  // happened to have loaded — two people adding Lahinch in the same minute
  // should produce one Lahinch and one calm message.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('courses')
    .select('name, slug')
    .is('trip_id', null)
  if (existingError) {
    console.error('add-course existing query failed:', existingError)
    return NextResponse.json({ ok: false, message: 'Could not add the course — try again.' })
  }

  const nameProblem = courseNameError(name, (existing ?? []).map(c => c.name))
  if (nameProblem) {
    return NextResponse.json({ ok: false, message: nameProblem }, { status: 400 })
  }

  // The slug only has to be unique among platform courses; a collision gets
  // a numbered suffix rather than an error the person can do nothing about.
  const taken = new Set((existing ?? []).map(c => c.slug))
  const base = slugify(name) || 'course'
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .insert({
      trip_id: null,
      name,
      slug,
      location: location || null,
      website,
      card_verified: false,
      // No ladies hole data exists yet, and saying otherwise would let a
      // ladies card render from the men's numbers.
      ladies_data_verified: false,
    })
    .select('id, name, location, website, card_verified')
    .single()
  if (courseError || !course) {
    console.error('add-course insert failed:', courseError)
    return NextResponse.json({ ok: false, message: 'Could not add the course — try again.' })
  }

  if (tees.length > 0) {
    const { error: teesError } = await supabaseAdmin
      .from('tees')
      .insert(tees.map((t: NewTee) => ({ course_id: course.id, ...t })))
    if (teesError) {
      console.error('add-course tees insert failed:', teesError)
      // The course row is real and selectable; only the tees are missing,
      // and the card check can still supply them later. Say exactly that.
      return NextResponse.json({
        ok: true,
        course,
        message: 'The course was added, but its tees could not be saved — they can be corrected from a scorecard photo.',
      })
    }
  }

  return NextResponse.json({ ok: true, course })
}
