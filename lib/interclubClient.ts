import { accountToken, askServer } from './accountClient'

/**
 * The browser's half of /api/interclub (docs/interclub.md): one ask, with
 * the account's token where there is one. `ties` needs none; everything a
 * team captain does needs the account, and says so when it is missing.
 */
export type InterclubAnswer = { ok: true; [k: string]: unknown } | { ok: false; error: string; signedOut?: true }

export async function askInterclub(body: Record<string, unknown>, opts: { public?: boolean } = {}): Promise<InterclubAnswer> {
  const token = await accountToken()
  if (!token && !opts.public) return { ok: false, error: 'Sign in to your Green Dot account first.', signedOut: true }
  if (!token) {
    try {
      const res = await fetch('/api/interclub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({})) as Record<string, unknown>
      return json.ok ? { ...json, ok: true } : { ok: false, error: typeof json.error === 'string' ? json.error : 'Could not reach Green Dot — try again.' }
    } catch {
      return { ok: false, error: 'Could not reach Green Dot — try again.' }
    }
  }
  const out = await askServer(token, body, '/api/interclub')
  if (!out) return { ok: false, error: 'Could not reach Green Dot — try again.' }
  return out.body.ok ? { ...out.body, ok: true } : { ok: false, error: typeof out.body.error === 'string' ? out.body.error : 'Could not reach Green Dot — try again.' }
}
