'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { IconX } from '@/app/components/icons'
import { FIELD, buttonClass } from '@/app/components/ui'
import { askClub } from '@/lib/accountClient'
import { MAX_LIST_ROWS, parseMemberList } from '@/lib/clubs'

/** The files the list reads: text a spreadsheet saves (CSV, tab-separated, plain text). */
export const UPLOAD_ACCEPT = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain'

/**
 * Paste a list, or upload one (D207): read on this screen and shown whole
 * before anything is saved — the rows that will go in, and every line that
 * will not with why, in rust. Saving sends only the good rows; the server
 * matches them to the list (GUI number, member number, email) and says what
 * it skipped, a number already somebody else's included. Nobody is taken
 * off by being missing. A spreadsheet's own file (.xlsx) is asked to be
 * saved as CSV first — reading it would take a library the size of the page.
 */
export default function PasteSheet({ clubId, startText, onClose, onDone }: {
  clubId: string
  startText: string
  onClose: () => void
  onDone: (note: string, skipped: { name: string; why: string }[]) => void
}) {
  const [text, setText] = useState(startText)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const preview = useMemo(() => (text.trim() ? parseMemberList(text) : null), [text])

  useEffect(() => {
    if (!startText) box.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, startText])

  async function add() {
    if (!preview?.rows.length) return
    setBusy(true); setError('')
    const r = await askClub('add', { clubId, rows: preview.rows, slim: true })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    const parts = [r.added ? `${r.added} added` : null, r.updated ? `${r.updated} brought up to date` : null].filter(Boolean)
    onDone(parts.length ? `${parts.join(', ')}.` : 'Nothing new on that list.', r.skipped ?? [])
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="paste-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="ch-panel relative w-full md:w-[640px] h-full overflow-y-auto paper border-l border-line shadow-floating p-6">
        <div className="flex items-start gap-3">
          <h2 id="paste-title" className="t-h2 text-ink flex-1">Paste a list</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ch-hover ch-focus w-11 h-11 rounded-full flex items-center justify-center text-ink">
            <IconX size={22} />
          </button>
        </div>
        <p className="t-cap text-ink/65 mt-2 leading-snug">
          From a spreadsheet, one person a line: name, member number, GUI number, email — or a first line naming the columns.
          Anyone already on the list is brought up to date by their numbers or email. Nobody is taken off. Up to {MAX_LIST_ROWS} at a time.
        </p>
        <textarea ref={box} value={text} onChange={e => setText(e.target.value)} rows={8} spellCheck={false}
          aria-label="The list" className={`${FIELD} ch-focus mt-4 font-mono text-[13px] h-auto`} />

        {preview && (
          <div className="mt-5">
            <p className="t-label text-ink">
              {preview.rows.length} {preview.rows.length === 1 ? 'person' : 'people'} to add
              {preview.problems.length > 0 && `, ${preview.problems.length} line${preview.problems.length === 1 ? '' : 's'} left out`}
            </p>
            {preview.problems.length > 0 && (
              <ul className="mt-2 space-y-1">
                {preview.problems.slice(0, 50).map(p => (
                  <li key={p.line} className="t-cap text-rust-deep">Line {p.line}: {p.why}</li>
                ))}
                {preview.problems.length > 50 && <li className="t-cap text-rust-deep">…and {preview.problems.length - 50} more.</li>}
              </ul>
            )}
            {preview.rows.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-tile border border-line">
                <table className="w-full text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-line">
                      {['Name', 'Member number', 'GUI number', 'Email'].map(h => <th key={h} scope="col" className="t-eyebrow text-ink/65 px-3 py-2 font-normal">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 100).map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-2 text-ink">{r.name}</td>
                        <td className="px-3 py-2 text-ink/80 tabular-nums">{r.memberNumber ?? ''}</td>
                        <td className="px-3 py-2 text-ink/80 tabular-nums">{r.guiNumber ?? ''}</td>
                        <td className="px-3 py-2 text-ink/80 break-all">{r.email ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 100 && <p className="t-cap text-ink/65 px-3 py-2">…and {preview.rows.length - 100} more.</p>}
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" className="t-cap text-rust-deep mt-4">{error}</p>}
        <div className="flex gap-3 mt-6">
          <button type="button" disabled={busy || !preview?.rows.length} onClick={() => void add()} className={`${buttonClass('primary', false)} ch-focus`}>
            {busy ? 'Adding…' : `Add ${preview?.rows.length ?? 0}`}
          </button>
          <button type="button" onClick={onClose} className={`${buttonClass('quiet', false)} ch-focus`}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** A file chosen to upload, read as text — or why it cannot be. */
export async function readListFile(file: File): Promise<{ ok: true; text: string } | { ok: false; why: string }> {
  if (/\.(xlsx?|numbers|ods)$/i.test(file.name)) return { ok: false, why: 'Save the spreadsheet as CSV first, then upload that.' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, why: 'Keep the file under 2 MB — upload the list in parts.' }
  try {
    return { ok: true, text: await file.text() }
  } catch {
    return { ok: false, why: 'Could not read that file — try again.' }
  }
}
