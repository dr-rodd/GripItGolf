// The feed route's answers — one shape for every action (./feed.ts and the
// stages built on it), in a file of its own so none of them import another.

export type FeedBody = Record<string, unknown> & { ok: true }
export type FailStatus = 400 | 401 | 403 | 404 | 409 | 429 | 503
export type FeedOutcome =
  | { status: 200; body: FeedBody }
  | { status: FailStatus; body: { ok: false; error: string } }

export const FEED_NOT_READY = 'The feed is not set up yet.'
export const fail = (status: FailStatus, error: string): FeedOutcome => ({ status, body: { ok: false, error } })
export const done = (body: Record<string, unknown> = {}): FeedOutcome => ({ status: 200, body: { ok: true, ...body } })
export const str = (v: unknown) => (typeof v === 'string' ? v : '')
