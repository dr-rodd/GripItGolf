import type { SupabaseClient } from '@supabase/supabase-js'
import { hashPasscode } from '@/lib/passcode'
import { MAX_SEEDED_NOTICES } from '@/lib/fieldSeed'

/**
 * The copy behind app/api/event/import, handed its database so the rules
 * can be run against a stand-in (scripts/test-field-seed.ts): both events'
 * organiser PINs checked, each against its own event; only players really
 * each event's paired; then contact details, each player's own settings and
 * the notices, every part fail-soft on its own.
 */

export type Pair = { from: string; to: string }
export type CopyInput = { from: string; to: string; fromPin: string; toPin: string; pairs: Pair[] }
export type CopyResult = {
  status: number
  body: { ok: boolean; message?: string; contacts?: number; notices?: number; missed?: string[] }
}

export async function copyAcross(admin: SupabaseClient, { from, to, fromPin, toPin, pairs }: CopyInput): Promise<CopyResult> {
  const [{ data: source }, { data: target }] = await Promise.all([
    admin.from('trips').select('id, settings_passcode_hash').eq('trip_code', from).maybeSingle(),
    admin.from('trips').select('id, settings_passcode_hash').eq('trip_code', to).maybeSingle(),
  ])
  if (!source || !target) return { status: 404, body: { ok: false, message: 'Those events could not be found.' } }
  // Both locks, each with its own key. An event with no organiser PIN has
  // nobody to vouch for copying what its players shared — nothing comes.
  const [fromHash, toHash] = await Promise.all([hashPasscode(fromPin), hashPasscode(toPin)])
  if (!source.settings_passcode_hash || fromHash !== source.settings_passcode_hash) return { status: 403, body: { ok: false, message: 'That PIN is not right.' } }
  if (!target.settings_passcode_hash || toHash !== target.settings_passcode_hash) return { status: 403, body: { ok: false, message: 'That PIN is not right.' } }

  // Only players who really are each event's: the pairs came from a browser.
  const [{ data: fromPlayers }, { data: toPlayers }] = await Promise.all([
    admin.from('players').select('id').eq('trip_id', source.id).in('id', pairs.map(p => p.from)),
    admin.from('players').select('id').eq('trip_id', target.id).in('id', pairs.map(p => p.to)),
  ])
  const okFrom = new Set((fromPlayers ?? []).map(p => p.id))
  const okTo = new Set((toPlayers ?? []).map(p => p.id))
  const valid = pairs.filter(p => okFrom.has(p.from) && okTo.has(p.to))
  const toFor = new Map(valid.map(p => [p.from, p.to]))
  const fromIds = valid.map(p => p.from)

  let contacts = 0
  let notices = 0
  const missed: string[] = []

  if (fromIds.length > 0) {
    // Contact details, each with the visibility its player chose.
    const { data: rows, error } = await admin
      .from('player_contacts')
      .select('player_id, phone, email, visibility')
      .eq('trip_id', source.id)
      .in('player_id', fromIds)
    if (error) missed.push('contact details')
    else if (rows && rows.length > 0) {
      const { error: writeErr } = await admin.from('player_contacts').upsert(
        rows.map(r => ({
          player_id: toFor.get(r.player_id)!, trip_id: target.id,
          phone: r.phone, email: r.email, visibility: r.visibility,
        })),
        { onConflict: 'player_id' },
      )
      if (writeErr) missed.push('contact details')
      else contacts = rows.length
    }

    // What each player set for themselves — one column a read, so a column
    // a database does not have yet costs that detail alone.
    for (const column of ['nickname', 'colour', 'home_course_id'] as const) {
      const { data: got, error: readErr } = await admin
        .from('players').select(`id, ${column}`).eq('trip_id', source.id).in('id', fromIds)
      if (readErr) continue
      const set = ((got ?? []) as unknown as Record<string, unknown>[]).filter(r => r[column] !== null && r[column] !== undefined)
      const results = await Promise.all(set.map(r =>
        admin.from('players').update({ [column]: r[column] }).eq('trip_id', target.id).eq('id', toFor.get(r.id as string)!)))
      if (results.some(r => r.error)) missed.push(column === 'home_course_id' ? 'home clubs' : `${column}s`)
    }
  }

  // The notices, oldest first, stamped now in the same order.
  const { data: posted, error: noticeErr } = await admin
    .from('event_messages')
    .select('body, created_at')
    .eq('trip_id', source.id)
    .order('created_at', { ascending: false })
    .limit(MAX_SEEDED_NOTICES)
  if (noticeErr) missed.push('notices')
  else if (posted && posted.length > 0) {
    const now = Date.now()
    const oldestFirst = [...posted].reverse()
    const { error: writeErr } = await admin.from('event_messages').insert(
      oldestFirst.map((n, i) => ({
        trip_id: target.id,
        body: n.body,
        created_at: new Date(now - (oldestFirst.length - i) * 1000).toISOString(),
      })),
    )
    if (writeErr) missed.push('notices')
    else notices = posted.length
  }

  return { status: 200, body: { ok: missed.length === 0, contacts, notices, missed } }
}
