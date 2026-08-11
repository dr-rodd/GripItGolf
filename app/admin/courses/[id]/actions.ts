'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  courseNameError, countyError, websiteError, normalizeWebsite,
  teeDraftError, parseTeeDraft, type TeeDraft,
} from '@/lib/courseDirectory'
import { requireAdmin } from '../../adminGate'

/**
 * Manual repairs to a platform course — the fix for "the slope is wrong and
 * nobody has a scorecard photo to hand".
 *
 * The rules are lib/courseDirectory's own, the same ones the add-course form
 * answers to, with the ranges from lib/cardCheck's TEE_COLUMN_RANGE — so
 * nothing can be typed here that the card check would refuse. Holes are not
 * editable here at all: the scorecard photo check stays the only writer of
 * pars and stroke indexes, because that is where the whitelists and the
 * SI-permutation validation live.
 *
 * The slug is never regenerated on a rename. It is how scoring URLs and the
 * directory refer to the course, and renaming must not break either.
 *
 * Every action re-verifies the session and scopes its write to platform rows
 * (trip_id is null) — a trip's own course is that trip's business.
 */

export type ActionResult = { error: string | null; saved: boolean }

const SIGNED_OUT: ActionResult = { error: 'Signed out — log in again.', saved: false }

export async function updateCourseIdentity(
  courseId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return SIGNED_OUT

  const name = String(formData.get('name') ?? '').trim()
  const county = String(formData.get('county') ?? '').trim()
  const website = String(formData.get('website') ?? '').trim()

  const db = createAdminClient()

  // The duplicate check is against the other platform courses, not this one —
  // saving a course under its own current name is not a collision.
  const { data: others, error: readError } = await db
    .from('courses')
    .select('name')
    .is('trip_id', null)
    .neq('id', courseId)
  if (readError) {
    console.error('updateCourseIdentity read failed:', readError)
    return { error: 'Could not check the course list — try again.', saved: false }
  }

  const nameProblem = courseNameError(name, (others ?? []).map(c => c.name as string))
  if (nameProblem) return { error: nameProblem, saved: false }
  const countyProblem = countyError(county)
  if (countyProblem) return { error: countyProblem, saved: false }
  const websiteProblem = websiteError(website)
  if (websiteProblem) return { error: websiteProblem, saved: false }

  const { error } = await db
    .from('courses')
    .update({
      name,
      county,
      website: website ? normalizeWebsite(website) : null,
    })
    .eq('id', courseId)
    .is('trip_id', null)
  if (error) {
    console.error('updateCourseIdentity failed:', error)
    return { error: 'Could not save the course — try again.', saved: false }
  }

  revalidatePath('/admin/courses')
  revalidatePath(`/admin/courses/${courseId}`)
  return { error: null, saved: true }
}

/** The tee fields as one draft, however the form spells them. */
function teeDraftFrom(formData: FormData): TeeDraft {
  const gender = String(formData.get('gender') ?? 'M')
  return {
    name: String(formData.get('name') ?? ''),
    gender: gender === 'F' ? 'F' : 'M',
    par: String(formData.get('par') ?? ''),
    courseRating: String(formData.get('courseRating') ?? ''),
    slope: String(formData.get('slope') ?? ''),
  }
}

export async function saveTee(
  courseId: string,
  teeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return SIGNED_OUT

  const draft = teeDraftFrom(formData)
  const problem = teeDraftError(draft)
  if (problem) return { error: problem, saved: false }

  const db = createAdminClient()
  const { error } = await db
    .from('tees')
    .update(parseTeeDraft(draft))
    .eq('id', teeId)
    .eq('course_id', courseId)
  if (error) {
    console.error('saveTee failed:', error)
    // 23505 is the unique (course_id, name, gender) constraint.
    const taken = (error as { code?: string }).code === '23505'
    return {
      error: taken
        ? 'The course already has that tee for that card — give it a different name.'
        : 'Could not save the tee — try again.',
      saved: false,
    }
  }

  revalidatePath(`/admin/courses/${courseId}`)
  return { error: null, saved: true }
}

export async function addTee(
  courseId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return SIGNED_OUT

  const draft = teeDraftFrom(formData)
  const problem = teeDraftError(draft)
  if (problem) return { error: problem, saved: false }

  const db = createAdminClient()
  const { error } = await db
    .from('tees')
    .insert({ course_id: courseId, ...parseTeeDraft(draft) })
  if (error) {
    console.error('addTee failed:', error)
    const taken = (error as { code?: string }).code === '23505'
    return {
      error: taken
        ? 'The course already has that tee for that card — give it a different name.'
        : 'Could not add the tee — try again.',
      saved: false,
    }
  }

  revalidatePath(`/admin/courses/${courseId}`)
  return { error: null, saved: true }
}

export async function setCardVerified(
  courseId: string,
  verified: boolean,
): Promise<ActionResult> {
  if (!(await requireAdmin())) return SIGNED_OUT

  const db = createAdminClient()

  // A card that does not exist cannot have been photographed. Marking a
  // hole-less course verified would hang an emerald "Verified" badge on a
  // course nobody can score — `hasCard` gates scoring on holes, never on this
  // flag. The editor does not render the button in that state; this is the
  // rule, because a button that is not rendered is not one.
  if (verified) {
    const { count } = await db
      .from('holes')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)
    if ((count ?? 0) === 0) {
      return {
        error: 'This course has no holes, so there is no card to verify. ' +
          'A scorecard photo creates one.',
        saved: false,
      }
    }
  }

  const { error } = await db
    .from('courses')
    .update({ card_verified: verified })
    .eq('id', courseId)
    .is('trip_id', null)
  if (error) {
    console.error('setCardVerified failed:', error)
    return { error: 'Could not save the change — try again.', saved: false }
  }

  revalidatePath('/admin/courses')
  revalidatePath(`/admin/courses/${courseId}`)
  return { error: null, saved: true }
}
