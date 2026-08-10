import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { normalizeWebsite } from '@/lib/courseDirectory'
import {
  htmlToText, ratingsLinks, normalizeLookup, lookupIsEmpty, privateHost,
  LOOKUP_PROMPT, LOOKUP_SCHEMA, MAX_LOOKUP_TEXT, MAX_EXTRA_PAGES,
} from '@/lib/courseLookup'

// Reading a course's ratings off its website, for the add-course form.
//
// `lib/courseLookup.ts` decides everything — which of the site's pages are
// worth reading, what Claude is asked, and which figures can be trusted.
// This file fetches and asks. Whatever comes back only pre-fills the form;
// the person confirms every number before anything is written, so a failed
// or empty lookup is answered with a shrug, never an error page.
//
// Sonnet rather than Opus: this is a fast read of a ratings table with a
// human checking the answer, not a scorecard extraction that writes.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Per-page ceiling — a page bigger than this is a video site, not a ratings box. */
const MAX_PAGE_BYTES = 1_500_000
const FETCH_TIMEOUT_MS = 10_000

async function fetchPage(url: string): Promise<string | null> {
  const parsed = new URL(url)
  if (privateHost(parsed.hostname)) return null
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'GreenDotGolf/1.0 (+https://greendot.live)' },
      redirect: 'follow',
    })
    if (!res.ok) return null
    // A redirect may have moved the request; the same rule applies where it landed.
    if (res.url && privateHost(new URL(res.url).hostname)) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !/text\/html|application\/xhtml|text\/plain/.test(type)) return null
    const reader = res.body?.getReader()
    if (!reader) return null
    let received = 0
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_PAGE_BYTES) { await reader.cancel(); break }
      chunks.push(value)
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(
      chunks.reduce((acc, c) => { const merged = new Uint8Array(acc.length + c.length); merged.set(acc); merged.set(c, acc.length); return merged }, new Uint8Array()),
    )
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    console.error('course-lookup route threw:', e)
    return NextResponse.json(
      { ok: false, reason: 'error', message: `Could not read the website — fill the ratings in by hand. (${why})` },
      { status: 500 },
    )
  }
}

async function handle(req: NextRequest) {
  const body = await req.json().catch(() => null) as { website?: string } | null
  const website = normalizeWebsite(String(body?.website ?? ''))
  if (!website) {
    return NextResponse.json(
      { ok: false, reason: 'bad-request', message: 'That does not look like a web address.' },
      { status: 400 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // A missing key is a deployment gap, not a user mistake — say which.
    return NextResponse.json({
      ok: false, reason: 'not-configured',
      message: 'The website lookup is not set up yet — fill the ratings in by hand.',
    })
  }

  // ── Read the site: the given page, then its likeliest ratings pages ──
  const firstHtml = await fetchPage(website)
  if (firstHtml === null) {
    return NextResponse.json({
      ok: false, reason: 'unreachable',
      message: 'That website could not be reached — check the address, or fill the ratings in by hand.',
    })
  }

  let text = htmlToText(firstHtml)
  for (const link of ratingsLinks(firstHtml, website).slice(0, MAX_EXTRA_PAGES)) {
    if (text.length >= MAX_LOOKUP_TEXT) break
    const html = await fetchPage(link)
    if (html) text += `\n\n[${link}]\n${htmlToText(html)}`
  }
  text = text.slice(0, MAX_LOOKUP_TEXT)

  // ── Ask Claude to find the ratings box ──
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 2000,
    output_config: {
      format: { type: 'json_schema', schema: LOOKUP_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: LOOKUP_PROMPT },
        { type: 'text', text },
      ],
    }],
  })

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    return NextResponse.json({
      ok: false, reason: 'unreadable',
      message: 'The website could not be read — fill the ratings in by hand.',
    })
  }

  const raw = response.content.find(b => b.type === 'text')?.text ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error('course-lookup extraction was not JSON')
    return NextResponse.json({
      ok: false, reason: 'unreadable',
      message: 'The website could not be read — fill the ratings in by hand.',
    })
  }

  const suggestion = normalizeLookup(parsed)
  if (lookupIsEmpty(suggestion)) {
    return NextResponse.json({
      ok: false, reason: 'nothing-found',
      message: 'No ratings found on that site — they will be in your golf association app, or on the printed card.',
    })
  }

  return NextResponse.json({ ok: true, ...suggestion })
}
