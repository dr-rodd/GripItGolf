'use client'

import { useMemo, useState } from 'react'
import { FIELD, FIELD_LABEL, buttonClass } from '@/app/components/ui'
import { CLUB_GROUNDS, cleanHex, clubColours, type ClubShades } from '@/lib/clubColour'
import { ART_MIN_WIDTH } from '@/lib/clubs'
import { askClub, uploadClubImage, type ClubSummary } from '@/lib/accountClient'

/**
 * A club's look, for its owners and admins (stage (e1), D118, D125,
 * D155, D156): one colour, a crest and one piece of art — and, rarely, a dark
 * version of the art. The colour is previewed by day and at night before it
 * is saved, as `lib/clubColour.ts` will show it, with a line when it had to
 * be adjusted to stay readable. Images go to the server whole; it checks,
 * resizes and keeps them.
 */
export default function ClubLook({ club, onChange }: { club: ClubSummary; onChange: (c: ClubSummary) => void }) {
  const [colour, setColour] = useState(club.colour ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const chosen = cleanHex(colour)
  const preview = useMemo(() => clubColours(chosen), [chosen])

  async function saveColour(next: string | null) {
    setBusy('colour'); setNote(null)
    const r = await askClub('colour', { clubId: club.id, colour: next })
    setBusy(null)
    if (!r.ok || !r.club) { setNote({ tone: 'error', text: r.ok ? 'Could not save — try again.' : r.error }); return }
    onChange(r.club)
    setNote({ tone: 'ok', text: next ? 'Colour saved.' : 'Colour taken off.' })
  }

  async function upload(kind: 'crest' | 'art' | 'art_dark', file: File | null) {
    setBusy(kind); setNote(null)
    const r = await uploadClubImage(club.id, kind, file)
    setBusy(null)
    if (!r.ok || !r.club) { setNote({ tone: 'error', text: r.ok ? 'Could not save — try again.' : r.error }); return }
    onChange(r.club)
    setNote({ tone: 'ok', text: file ? 'Saved.' : 'Taken off.' })
  }

  const unchanged = chosen === club.colour
  return (
    <section className="mt-8" id="look">
      <h2 className="t-h2 text-ink">The club’s look</h2>
      <p className="text-ink/65 text-sm mt-1">Shown only on {club.name}’s own pages: its public page and its members area.</p>

      <label htmlFor="club-colour" className={`${FIELD_LABEL} mt-5`}>Colour</label>
      <div className="flex items-center gap-3">
        <input id="club-colour" type="color" value={chosen ?? CLUB_GROUNDS.light.text} onChange={e => setColour(e.target.value)}
          className="w-14 h-14 rounded-field border border-line-strong bg-surface p-1 flex-shrink-0" aria-label="Pick a colour" />
        <input type="text" value={colour} onChange={e => setColour(e.target.value)} spellCheck={false}
          autoCapitalize="characters" aria-label="Colour as a hex code" className={`${FIELD} font-mono`} />
      </div>
      {preview && (
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Swatch label="By day" g={CLUB_GROUNDS.light} s={preview.light} name={club.name} />
          <Swatch label="At night" g={CLUB_GROUNDS.dark} s={preview.dark} name={club.name} />
        </div>
      )}
      {preview?.adjusted && (
        <p className="t-cap text-ink/80 mt-2">
          Adjusted a little so it stays readable and never looks like Green Dot’s own green — the hue is kept.
        </p>
      )}
      {!chosen && colour.trim() && <p className="t-cap text-rust-deep mt-2">Type a colour as six letters and numbers after a #.</p>}
      <div className="flex flex-wrap gap-3 mt-4">
        <button type="button" disabled={busy !== null || !chosen || unchanged} onClick={() => void saveColour(chosen)}
          className={buttonClass('secondary', false)}>
          {busy === 'colour' ? 'Saving…' : 'Save colour'}
        </button>
        {club.colour && (
          <button type="button" disabled={busy !== null} onClick={() => void saveColour(null)} className={buttonClass('quiet', false)}>
            Use no colour
          </button>
        )}
      </div>

      <ImagePick label="Crest" hint="Square works best. Shown in a circle, 512 pixels across." url={club.crestUrl}
        busy={busy === 'crest'} disabled={busy !== null} onPick={f => void upload('crest', f)} round />
      <ImagePick label="Art" hint={`Landscape, at least ${ART_MIN_WIDTH} pixels wide, soft and light, with sky at the top. Darkened for night by itself.`}
        url={club.artUrl} busy={busy === 'art'} disabled={busy !== null} onPick={f => void upload('art', f)} />
      {club.artUrl && (
        <ImagePick label="Night art (optional)" hint="Only if the darkened art doesn’t suit. Most clubs never need one."
          url={club.artDarkUrl} busy={busy === 'art_dark'} disabled={busy !== null} onPick={f => void upload('art_dark', f)} />
      )}
      {note && <p className={`t-cap mt-4 ${note.tone === 'error' ? 'text-rust-deep' : 'text-accent-deep'}`} role={note.tone === 'error' ? 'alert' : 'status'}>{note.text}</p>}
    </section>
  )
}

/** The colour as it will show: a page, a card with the name in the club's words, a ring and a lit tab. */
function Swatch({ label, g, s, name }: { label: string; g: { page: string; card: string; text: string }; s: ClubShades; name: string }) {
  const { page, card, text: ink } = g
  return (
    <div className="rounded-tile p-3 border border-line" style={{ background: page }}>
      <p className="t-cap" style={{ color: ink }}>{label}</p>
      <div className="rounded-tile p-3 mt-2" style={{ background: card }}>
        <span className="block w-8 h-8 rounded-full" style={{ border: `2px solid ${s.club}`, background: card }} aria-hidden="true" />
        <p className="text-[13px] font-semibold mt-2" style={{ color: s.deep }}>Members</p>
        <p className="text-[13px] truncate" style={{ color: ink }}>{name}</p>
        <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[13px] font-semibold" style={{ background: s.club, color: s.on }}>Club</span>
      </div>
    </div>
  )
}

function ImagePick({ label, hint, url, busy, disabled, onPick, round = false }: {
  label: string; hint: string; url: string | null; busy: boolean; disabled: boolean; onPick: (f: File | null) => void; round?: boolean
}) {
  const id = `club-image-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="mt-8">
      <p className={FIELD_LABEL}>{label}</p>
      <p className="t-cap text-ink/65 -mt-1 mb-3">{hint}</p>
      {url && (
        // A club's own image, resized on the server.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={`${round ? 'w-24 h-24 rounded-full object-contain' : 'w-full h-32 rounded-tile object-cover'} bg-surface border border-line mb-3`} />
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <label htmlFor={id} className={`${buttonClass('secondary', false)} ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
          {busy ? 'Saving…' : url ? 'Change' : 'Choose an image'}
        </label>
        <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f) }} />
        {url && (
          <button type="button" disabled={disabled} onClick={() => onPick(null)} className={buttonClass('quiet', false)}>Take it off</button>
        )}
      </div>
    </div>
  )
}
