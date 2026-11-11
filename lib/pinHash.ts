// An event's PINs as the server keeps them — the only copy (row-level
// security stage 4, D64; Ross, 11 Nov 2026). **Server only**: it reads the
// service-role key and uses Node's crypto, and nothing here is ever handed
// to a browser — no hash, no salt, no fingerprint.
//
// Two ways a PIN is stored:
//
// * **legacy** — plain SHA-256, hex, made on the organiser's phone before
//   stage 4 (`lib/passcode.ts` `hashPasscode`, the same bytes). Fast to
//   guess, which is why it never leaves the server now and is replaced the
//   first time the right PIN is typed (`verifyPin`'s `stale`).
// * **`s1$salt$key$fp`** — scrypt, salted, slow: what every PIN set or
//   checked from stage 4 on is stored as.
//
// **The public PIN's door cookie** (`entryToken`) is an HMAC, keyed by the
// server, of the event's code and the PIN's old plain hash. It is the same
// before and after a PIN is re-stored — the `fp` part carries it — so the
// field is never sent back to the door by the upgrade, and a cookie written
// before stage 4 (which held the plain hash itself) still opens the door.
// It holds nothing that helps guess the PIN without the server's key.

import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto'

export const PIN_SCHEME = 's1'

const KEYLEN = 32
/** scrypt's cost: about 50ms a check on a server, ruinous at a billion guesses. */
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function scrypt(pin: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(pin, salt, keylen, COST, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/** The plain SHA-256 a PIN was stored as before stage 4 — `hashPasscode`'s bytes. */
export function legacyPinHash(pin: string): string {
  return createHash('sha256').update(pin, 'utf8').digest('hex')
}

export function isLegacyHash(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored)
}

function secret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return s
}

/** The door cookie's value for a PIN whose plain hash is `legacy`. */
function fingerprint(code: string, legacy: string): string {
  return createHmac('sha256', secret()).update(`gd-entry|${code.trim().toUpperCase()}|${legacy}`).digest('base64url')
}

function same(a: string | Buffer, b: string | Buffer): boolean {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(a)
  const y = Buffer.isBuffer(b) ? b : Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

interface Parsed { salt: Buffer; key: Buffer; fp: string }

function parse(stored: string): Parsed | null {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== PIN_SCHEME) return null
  const [, salt, key, fp] = parts
  if (!salt || !key || !fp) return null
  return { salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url'), fp }
}

/** A PIN as it is stored from stage 4 on, for the event with this code. */
export async function hashPin(pin: string, code: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(pin, salt, KEYLEN)
  return [PIN_SCHEME, salt.toString('base64url'), key.toString('base64url'), fingerprint(code, legacyPinHash(pin))].join('$')
}

/**
 * Is this the PIN? `stale` says it was right and is still stored the old
 * way — the caller re-stores it (`hashPin`), silently. Anything unreadable
 * is simply not the PIN.
 */
export async function verifyPin(
  pin: string,
  stored: string | null | undefined,
): Promise<{ ok: boolean; stale: boolean }> {
  if (!pin || !stored) return { ok: false, stale: false }
  if (isLegacyHash(stored)) {
    const ok = same(legacyPinHash(pin), stored)
    return { ok, stale: ok }
  }
  const p = parse(stored)
  if (!p || p.key.length === 0) return { ok: false, stale: false }
  return { ok: same(await scrypt(pin, p.salt, p.key.length), p.key), stale: false }
}

/** What the public PIN's door cookie holds for this event. Null for a value that is not a PIN. */
export function entryToken(stored: string, code: string): string | null {
  if (isLegacyHash(stored)) return fingerprint(code, stored)
  return parse(stored)?.fp ?? null
}

/**
 * May this phone see the event? Always when it has no public PIN. Else only
 * with the door's cookie — or one written before stage 4, which held the
 * PIN's plain hash. Changing the PIN changes the token, so everybody is
 * asked again; removing it opens the door.
 */
export function entryAllowed(stored: string | null | undefined, cookie: string | null | undefined, code: string): boolean {
  if (typeof stored !== 'string' || stored.length === 0) return true
  if (!cookie) return false
  const token = entryToken(stored, code)
  if (!token) return false
  if (same(cookie, token)) return true
  return isLegacyHash(cookie) && same(fingerprint(code, cookie), token)
}
