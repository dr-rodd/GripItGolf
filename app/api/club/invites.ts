// A club's invite codes as the server keeps them: only ever hashed (stage
// (c)). Its own file so the club route and the Clubhouse's both read it.

import { createHash } from 'crypto'
import { normaliseInviteCode } from '@/lib/clubs'

/** An invite code as kept: only ever hashed. */
export function inviteHash(code: string): string {
  return createHash('sha256').update(`club-invite|${normaliseInviteCode(code)}`, 'utf8').digest('hex')
}

/** The count of wrong codes from one address, the address only ever hashed. */
export function inviteTryKey(address: string): string {
  return `club-code:${createHash('sha256').update(`club|code|${address}`, 'utf8').digest('hex')}`
}
