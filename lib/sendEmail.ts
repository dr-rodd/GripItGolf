import { Resend } from 'resend'
import { undeliverable } from './emailGuard'

// Every email Green Dot sends through Resend goes through here (D308) — the
// trip confirmation, the club's invite codes and Forgot PIN. One place, so
// the rule that a `.invalid` address is never sent to cannot be missed by a
// fourth sender: `test:test-club` fails any other file that names Resend's
// send. Server only.
//
// Answers 'sent', 'not-configured' (no RESEND_API_KEY — the documented
// no-op) or 'refused' (an address nobody can receive at, lib/emailGuard.ts).
// A failed or slow send throws, as each caller expected before.

/** Longer than a healthy send, shorter than the function's own limit. */
export const SEND_TIMEOUT_MS = 8_000

export interface Email {
  from: string
  to: string
  subject: string
  html: string
  text: string
  attachments?: { filename: string; content: Buffer | string; contentId?: string }[]
}

export type SendResult = 'sent' | 'not-configured' | 'refused'

export async function sendEmail(email: Email): Promise<SendResult> {
  if (undeliverable(email.to)) return 'refused'
  const key = process.env.RESEND_API_KEY
  if (!key) return 'not-configured'
  const send = new Resend(key).emails.send(email)
  const result = await Promise.race([
    send,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('send timed out')), SEND_TIMEOUT_MS)),
  ])
  if (result.error) throw result.error
  return 'sent'
}
