import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { MAX_UPLOAD_BYTES } from '@/lib/clubs'
import { runUpload } from '../club'
import { clubStore } from '../store'
import { imageWork } from '../images'

// POST /api/club/upload — a form with `clubId`, `kind` (crest | art |
// art_dark) and `file` (or `remove=1`), and a Green Dot member's token as
// `Authorization: Bearer …`: a club's crest or art, resized to WebP on the
// server (D156) and kept in the `club-assets` bucket (migration 087). The
// rules are ../club.ts `runUpload`.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
  try {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ ok: false, error: 'Nothing was sent.' }, { status: 400, headers: NO_STORE })
    const file = form.get('file')
    let bytes: Uint8Array | null = null
    if (form.get('remove') !== '1') {
      if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: 'Choose an image.' }, { status: 400, headers: NO_STORE })
      if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, error: 'Keep the image under 4 MB.' }, { status: 400, headers: NO_STORE })
      bytes = new Uint8Array(await file.arrayBuffer())
    }
    const out = await runUpload({ token, clubId: form.get('clubId'), kind: form.get('kind'), bytes }, clubStore(createAdminClient()), imageWork)
    return NextResponse.json(out.body, { status: out.status, headers: NO_STORE })
  } catch (e) {
    console.error('club upload failed:', e)
    return NextResponse.json({ ok: false, error: 'Could not save the image — try again.' }, { status: 503, headers: NO_STORE })
  }
}
