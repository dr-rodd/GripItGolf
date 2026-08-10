import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  HOLE_COLUMNS, validHoleUpdate, validTeeUpdate, validateNewHoleRows,
  type NewHoleRow, type NewTeeRow,
} from '@/lib/cardCheck'
import { validNewTee } from '@/lib/courseDirectory'

// Changing the course record to match the photographed card, after the
// person has seen the difference and said yes.
//
// Three things this route holds to:
//
// - **Only whitelisted columns, only sane values.** The updates come back off
//   the wire, so every one goes through `validHoleUpdate` / `validTeeUpdate`
//   — a column outside the card's fields, or a par of 45, is refused before
//   anything is touched.
// - **The most recent photo wins.** Each apply overwrites the disputed
//   fields; running the check again and applying again simply writes the
//   newer reading over the older one. Nothing merges.
// - **Scores already on the book are recomputed.** The stableford trigger
//   reads `holes` at write time, so cards committed before the correction
//   would keep their old points. A no-op update on this trip's scores for
//   this course re-fires the trigger row by row, and the leaderboard tells
//   one story again. Scoped to the asking trip — `trip_code` is the access
//   control everywhere else, and it is here too.
//
// A second job since courses became addable: `mode: 'create'` writes a
// whole card onto a course that has none — 18 hole rows and any fully-rated
// tees, straight from the confirmed extraction. Refused outright if the
// course already has holes; a race between two first photos must not
// produce 36. Either job ends with `card_verified` set — a card that was
// applied from a photo is a card a photo has confirmed.

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error('card-check apply threw:', e)
    return NextResponse.json(
      { ok: false, message: `Could not update the card — try again. (${why})` },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    courseId?: string
    tripCode?: string
    mode?: string
    holes?: unknown[]
    tees?: unknown[]
    newHoles?: unknown[]
    newTees?: unknown[]
  } | null

  const courseId = body?.courseId ?? ''
  const tripCode = (body?.tripCode ?? '').trim().toUpperCase()
  const holes = Array.isArray(body?.holes) ? body!.holes! : []
  const tees = Array.isArray(body?.tees) ? body!.tees! : []

  if (!UUID.test(courseId)) {
    return NextResponse.json({ ok: false, message: 'A course id is required.' }, { status: 400 })
  }

  if (body?.mode === 'create') {
    return await handleCreate(
      courseId,
      Array.isArray(body?.newHoles) ? body!.newHoles! : [],
      Array.isArray(body?.newTees) ? body!.newTees! : [],
    )
  }

  if (holes.length === 0 && tees.length === 0) {
    return NextResponse.json({ ok: false, message: 'There is nothing to change.' }, { status: 400 })
  }
  const holeUps = holes.filter(validHoleUpdate)
  const teeUps = tees.filter(validTeeUpdate)
  if (holeUps.length !== holes.length || teeUps.length !== tees.length) {
    return NextResponse.json({ ok: false, message: 'Those changes could not be applied — run the check again.' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient()

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .maybeSingle()
  if (courseError || !course) {
    return NextResponse.json({ ok: false, message: 'No such course.' }, { status: 404 })
  }

  // ── Write the corrections ──
  for (const u of holeUps) {
    const { error } = await supabaseAdmin
      .from('holes')
      .update(u.fields)
      .eq('course_id', courseId)
      .eq('hole_number', u.holeNumber)
    if (error) {
      console.error('card-check hole update failed:', error)
      return NextResponse.json({ ok: false, message: 'Could not update the card — try again.' })
    }
  }
  for (const u of teeUps) {
    const { error } = await supabaseAdmin
      .from('tees')
      .update(u.fields)
      .eq('id', u.teeId)
      .eq('course_id', courseId)
    if (error) {
      console.error('card-check tee update failed:', error)
      return NextResponse.json({ ok: false, message: 'Could not update the card — try again.' })
    }
  }

  // A card corrected from a photo is a card a photo has confirmed.
  // Best-effort: a failed write here costs the badge, not the apply.
  const { error: verifyError } = await supabaseAdmin
    .from('courses')
    .update({ card_verified: true })
    .eq('id', courseId)
  if (verifyError) console.error('card-check apply verify flag failed:', verifyError)

  // ── Re-tell the scores already written against the old card ──
  //
  // Only when a hole's numbers moved: a tee's slope changes future playing
  // handicaps, not points already computed off a snapshot.
  let rescored = 0
  if (holeUps.length > 0 && /^[A-Z0-9]{4,10}$/.test(tripCode)) {
    const { data: trip } = await supabaseAdmin
      .from('trips').select('id').eq('trip_code', tripCode).maybeSingle()
    if (trip) {
      const { data: rounds } = await supabaseAdmin
        .from('rounds').select('id')
        .eq('trip_id', trip.id)
        .eq('course_id', courseId)
      const roundIds = (rounds ?? []).map(r => r.id as string)
      if (roundIds.length > 0) {
        // The values do not change; the UPDATE itself is what fires
        // `trg_scores_stableford`, which reads the corrected holes.
        const { data: touched, error: rescoreError } = await supabaseAdmin
          .from('scores')
          .update({ updated_at: new Date().toISOString() })
          .in('round_id', roundIds)
          .select('id')
        if (rescoreError) console.error('card-check rescore failed:', rescoreError)
        rescored = touched?.length ?? 0
      }
    }
  }

  // ── Hand back the card as it now stands ──
  const [holesRes, teesRes] = await Promise.all([
    supabaseAdmin.from('holes').select(HOLE_COLUMNS).eq('course_id', courseId).order('hole_number'),
    supabaseAdmin.from('tees').select('id, course_id, name, gender, par, course_rating, slope').eq('course_id', courseId),
  ])
  if (holesRes.error || teesRes.error) {
    console.error('card-check re-read failed:', holesRes.error ?? teesRes.error)
    // The writes landed; only the echo failed. Say so rather than pretending
    // the update did not happen.
    return NextResponse.json({ ok: true, holes: null, tees: null, rescored })
  }

  return NextResponse.json({
    ok: true,
    holes: holesRes.data ?? [],
    tees: teesRes.data ?? [],
    rescored,
  })
}

// ─── Writing a whole card onto a course that has none ─────────

async function handleCreate(courseId: string, newHoles: unknown[], newTees: unknown[]) {
  // Re-validated off the wire — the client saw a validated card, but what
  // arrives is what was sent, not what was shown.
  const holeProblems = validateNewHoleRows(newHoles)
  if (holeProblems.length > 0) {
    return NextResponse.json(
      { ok: false, message: 'That card could not be saved — run the check again.', problems: holeProblems },
      { status: 400 },
    )
  }
  const teeRows = newTees.filter(validNewTee) as NewTeeRow[]
  if (teeRows.length !== newTees.length) {
    return NextResponse.json(
      { ok: false, message: 'That card could not be saved — run the check again.' },
      { status: 400 },
    )
  }

  const supabaseAdmin = createAdminClient()

  const { data: course, error: courseError } = await supabaseAdmin
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .maybeSingle()
  if (courseError || !course) {
    return NextResponse.json({ ok: false, message: 'No such course.' }, { status: 404 })
  }

  // The one guard that matters: this path only ever writes a first card.
  // Two phones photographing the first card at once must produce eighteen
  // holes, not thirty-six — the loser of the race lands here and is told
  // to run the check again, which will now diff instead.
  const { count, error: countError } = await supabaseAdmin
    .from('holes')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
  if (countError) {
    console.error('card-check create count failed:', countError)
    return NextResponse.json({ ok: false, message: 'Could not save the card — try again.' })
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      ok: false,
      message: 'This course already has a card — run the check again to compare against it.',
    })
  }

  const { error: holesError } = await supabaseAdmin
    .from('holes')
    .insert((newHoles as NewHoleRow[]).map(h => ({ course_id: courseId, ...h })))
  if (holesError) {
    console.error('card-check create holes insert failed:', holesError)
    return NextResponse.json({ ok: false, message: 'Could not save the card — try again.' })
  }

  // Tees the add-course form already created keep their row; the photo's
  // reading overwrites their numbers — the most recent photo wins, same as
  // every other apply. Tees the form never knew about are inserted.
  const { data: existingTees, error: existingTeesError } = await supabaseAdmin
    .from('tees')
    .select('id, name, gender')
    .eq('course_id', courseId)
  if (existingTeesError) {
    console.error('card-check create tees query failed:', existingTeesError)
    return NextResponse.json({ ok: false, message: 'Could not save the card — try again.' })
  }
  for (const t of teeRows) {
    const existing = (existingTees ?? []).find(
      e => e.name.trim().toLowerCase() === t.name.trim().toLowerCase() && e.gender === t.gender,
    )
    const { error } = existing
      ? await supabaseAdmin
          .from('tees')
          .update({ par: t.par, course_rating: t.course_rating, slope: t.slope })
          .eq('id', existing.id)
          .eq('course_id', courseId)
      : await supabaseAdmin
          .from('tees')
          .insert({ course_id: courseId, ...t })
    if (error) {
      console.error('card-check create tee write failed:', error)
      return NextResponse.json({ ok: false, message: 'Could not save the card — try again.' })
    }
  }

  const { error: verifyError } = await supabaseAdmin
    .from('courses')
    .update({ card_verified: true })
    .eq('id', courseId)
  if (verifyError) console.error('card-check create verify flag failed:', verifyError)

  // ── Hand back the card as it now stands ──
  const [holesRes, teesRes] = await Promise.all([
    supabaseAdmin.from('holes').select(HOLE_COLUMNS).eq('course_id', courseId).order('hole_number'),
    supabaseAdmin.from('tees').select('id, course_id, name, gender, par, course_rating, slope').eq('course_id', courseId),
  ])
  if (holesRes.error || teesRes.error) {
    console.error('card-check create re-read failed:', holesRes.error ?? teesRes.error)
    return NextResponse.json({ ok: true, holes: null, tees: null, rescored: 0 })
  }

  return NextResponse.json({
    ok: true,
    holes: holesRes.data ?? [],
    tees: teesRes.data ?? [],
    rescored: 0,
  })
}
