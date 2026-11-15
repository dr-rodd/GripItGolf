// The service-role store behind /api/club (./club.ts). Every club table is
// closed to phones (migration 086); only this reaches them.

import { randomBytes } from 'crypto'
import { Resend } from 'resend'
import type { createAdminClient } from '@/lib/supabase-admin'
import { SITE } from '@/config/site'
import type { ClubRole, ListRow } from '@/lib/clubs'
import type { AttemptWindow } from '@/lib/membership'
import { asUser } from '../account/store'
import type { ClubRecord, ClubStore, MemberRecord } from './club'

type Db = ReturnType<typeof createAdminClient>

const CLUB_COLS = 'id, slug, name, verified_at, refused_at'
const ROW_COLS = 'id, club_id, name, member_number, gui_number, email, role, user_id, removed_at, on_boards'
const SEND_TIMEOUT_MS = 8000

type ClubRow = { id: string; slug: string; name: string; verified_at: string | null; refused_at: string | null }
type RowRow = {
  id: string; club_id: string; name: string; member_number: string | null; gui_number: string | null
  email: string | null; role: ClubRole; user_id: string | null; removed_at: string | null; on_boards: boolean
}

const asClub = (c: ClubRow): ClubRecord => ({ id: c.id, slug: c.slug, name: c.name, verifiedAt: c.verified_at, refusedAt: c.refused_at })
const asRow = (r: RowRow): MemberRecord => ({
  id: r.id, clubId: r.club_id, name: r.name, memberNumber: r.member_number, guiNumber: r.gui_number,
  email: r.email, role: r.role, userId: r.user_id, removedAt: r.removed_at, onBoards: r.on_boards,
})

/** Where a code's email points people: greendot.live, or the preview's own. */
export function siteOrigin(): string {
  const preview = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
  return preview ? `https://${process.env.VERCEL_URL}` : 'https://greendot.live'
}

export function clubStore(db: Db): ClubStore {
  return {
    async userFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      return error ? null : asUser(data.user)
    },
    async clubsOf(userId) {
      const { data, error } = await db.from('club_members').select(ROW_COLS).eq('user_id', userId).is('removed_at', null)
      if (error) throw error
      const rows = (data ?? []) as RowRow[]
      if (rows.length === 0) return []
      const { data: clubs, error: e } = await db.from('clubs').select(CLUB_COLS).in('id', rows.map(r => r.club_id))
      if (e) throw e
      const byId = new Map(((clubs ?? []) as ClubRow[]).map(c => [c.id, asClub(c)]))
      return rows.filter(r => byId.has(r.club_id)).map(r => ({ club: byId.get(r.club_id)!, row: asRow(r) }))
        .sort((a, b) => a.club.name.localeCompare(b.club.name))
    },
    async clubsMadeBy(userId) {
      const { count, error } = await db.from('clubs').select('id', { count: 'exact', head: true }).eq('created_by', userId)
      if (error) throw error
      return count ?? 0
    },
    async slugsLike(base) {
      const { data, error } = await db.from('clubs').select('slug').like('slug', `${base}%`)
      if (error) throw error
      return ((data ?? []) as { slug: string }[]).map(r => r.slug)
    },
    async createClub(c, owner) {
      const { data, error } = await db.from('clubs').insert({ slug: c.slug, name: c.name, created_by: c.createdBy }).select(CLUB_COLS).single()
      if (error || !data) throw error ?? new Error('No club came back.')
      const club = asClub(data as ClubRow)
      const now = new Date().toISOString()
      const { error: e } = await db.from('club_members').insert({
        club_id: club.id, name: owner.name, email: owner.email, role: 'owner', user_id: owner.userId, linked_at: now,
      })
      if (e) {
        await db.from('clubs').delete().eq('id', club.id)
        throw e
      }
      return club
    },
    async club(clubId) {
      const { data, error } = await db.from('clubs').select(CLUB_COLS).eq('id', clubId).maybeSingle()
      if (error) {
        if (error.code === '22P02') return null // not a uuid
        throw error
      }
      return data ? asClub(data as ClubRow) : null
    },
    async rows(clubId) {
      // A club's list can pass Supabase's 1,000-row page: read in pages.
      const out: MemberRecord[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('club_members').select(ROW_COLS)
          .eq('club_id', clubId).order('name').order('id').range(from, from + 999)
        if (error) throw error
        const page = (data ?? []) as RowRow[]
        out.push(...page.map(asRow))
        if (page.length < 1000) break
      }
      return out
    },
    async insertRows(clubId, rows: ListRow[]) {
      let n = 0
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(r => ({
          club_id: clubId, name: r.name, member_number: r.memberNumber, gui_number: r.guiNumber, email: r.email,
        }))
        const { error } = await db.from('club_members').insert(chunk)
        if (error) throw error
        n += chunk.length
      }
      return n
    },
    async updateRow(id, patch) {
      const { error } = await db.from('club_members').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
      if (error?.code === '23505') return 'clash'
      if (error) throw error
      return 'ok'
    },
    async lastInviteAt(memberId) {
      const { data, error } = await db.from('club_invites').select('created_at').eq('member_id', memberId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (error) throw error
      return (data as { created_at?: string } | null)?.created_at ?? null
    },
    async saveInvite(i) {
      const { error } = await db.from('club_invites').insert({ member_id: i.memberId, email: i.email, code_hash: i.codeHash, expires_at: i.expiresAt })
      if (error) throw error
    },
    async sendEmail(to, subject, html, text) {
      const key = process.env.RESEND_API_KEY
      if (!key) return false
      const send = new Resend(key).emails.send({ from: `Green Dot <${SITE.supportEmail}>`, to, subject, html, text })
      const result = await Promise.race([
        send,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('send timed out')), SEND_TIMEOUT_MS)),
      ])
      if (result.error) throw result.error
      return true
    },
    async inviteByHash(hash) {
      const { data, error } = await db.from('club_invites').select('id, member_id, expires_at, used_at').eq('code_hash', hash).maybeSingle()
      if (error) throw error
      const r = data as { id: string; member_id: string; expires_at: string; used_at: string | null } | null
      return r ? { id: r.id, memberId: r.member_id, expiresAt: r.expires_at, usedAt: r.used_at } : null
    },
    async useInvite(id, at) {
      const { data, error } = await db.from('club_invites').update({ used_at: at }).eq('id', id).is('used_at', null).select('id')
      if (error) throw error
      return (data ?? []).length === 1
    },
    async row(memberId) {
      const { data, error } = await db.from('club_members').select(ROW_COLS).eq('id', memberId).maybeSingle()
      if (error) throw error
      return data ? asRow(data as RowRow) : null
    },
    async guiHolders(gui) {
      const { data, error } = await db.from('club_members').select('user_id').eq('gui_number', gui)
        .not('user_id', 'is', null).is('removed_at', null)
      if (error) throw error
      return [...new Set(((data ?? []) as { user_id: string }[]).map(r => r.user_id))]
    },
    async guisOf(userId) {
      const { data, error } = await db.from('club_members').select('gui_number').eq('user_id', userId)
        .not('gui_number', 'is', null).is('removed_at', null)
      if (error) throw error
      return [...new Set(((data ?? []) as { gui_number: string }[]).map(r => r.gui_number))]
    },
    async readAttempts(keys) {
      const out = new Map<string, AttemptWindow>()
      const { data, error } = await db.from('account_attempts').select('key, failures, window_started').in('key', keys)
      if (error) throw error
      for (const r of (data ?? []) as { key: string; failures: number; window_started: string }[]) {
        out.set(r.key, { failures: r.failures, windowStarted: r.window_started })
      }
      return out
    },
    async writeAttempt(key, w) {
      const { error } = await db.from('account_attempts')
        .upsert({ key, failures: w.failures, window_started: w.windowStarted }, { onConflict: 'key' })
      if (error) throw error
    },
    randomBytes: n => new Uint8Array(randomBytes(n)),
    siteOrigin,
  }
}
