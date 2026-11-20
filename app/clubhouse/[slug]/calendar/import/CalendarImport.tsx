'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { IconCheck } from '@/app/components/icons'
import { FIELD, FIELD_LABEL, Pill, buttonClass, cardClass } from '@/app/components/ui'
import { CALENDAR_FORMAT, readCalendarFile, type CalendarCells } from '@/lib/calendarImport'
import { typeLabel, type EventType } from '@/lib/clubEvents'
import { clubEventDates, irishToday } from '@/lib/clubs'
import { calendarPromptOf, importCalendarRows, previewCalendar, type ImportPreviewRow, type ImportRowOutcome } from '../../../clubhouseClient'
import { UPLOAD_ACCEPT, readListFile } from '../../members/PasteSheet'
import { useShell } from '../../ShellContext'

const CHUNK = 10
const STATUS_WORDS: Record<ImportPreviewRow['status'], string> = { new: 'New', changed: 'Changed', same: 'Same', bad: 'Can’t import' }
const OUTCOME_WORDS: Record<ImportRowOutcome['outcome'], string> = { made: 'Made', changed: 'Changed', same: 'No change', skipped: 'Skipped', failed: 'Not imported' }

/**
 * Import a calendar (stage c2, M12–M17): copy the prompt — written from the
 * club's own memberships, presets and home course — or download the blank
 * template; take it with the club's calendar to any chatbot; paste or upload
 * the CSV it answers with; see every row before anything is saved (New,
 * Changed, Same, bad cells in rust with why, a row the chatbot was unsure of
 * in amber to tick, and what the club has that the file does not mention);
 * then import, a few rows at a time. Nothing is deleted. Desktop only.
 */
export default function CalendarImport() {
  const { face, club, may } = useShell()
  const thisYear = Number(irishToday(new Date()).slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [prompt, setPrompt] = useState<{ prompt: string; template: string; ready: boolean } | null>(null)
  const [promptError, setPromptError] = useState('')
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState('')
  const [fileError, setFileError] = useState('')
  const [rows, setRows] = useState<{ line: number; cells: CalendarCells }[] | null>(null)
  const [preview, setPreview] = useState<{ rows: ImportPreviewRow[]; notInFile: { name: string; date: string; type: string }[] } | null>(null)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null)
  const [report, setReport] = useState<ImportRowOutcome[] | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let live = true
    void calendarPromptOf(club.id, year).then(r => {
      if (!live) return
      if (r.ok) { setPrompt(r); setPromptError('') } else setPromptError(r.error)
    })
    return () => { live = false }
  }, [club.id, year])

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, same: 0, bad: 0, check: 0 }
    for (const r of preview?.rows ?? []) { c[r.status]++; if (r.check && r.status !== 'bad') c.check++ }
    return c
  }, [preview])

  if (!may('keep_calendar')) return <p className="text-ink/80 text-[15px]">Only someone with Clubhouse imports the club’s calendar.</p>

  async function copy() {
    if (!prompt) return
    try { await navigator.clipboard.writeText(prompt.prompt); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { area.current?.select() }
  }

  function download() {
    if (!prompt) return
    const url = URL.createObjectURL(new Blob([prompt.template], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `${face.slug}-calendar-${year}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function upload(file: File | undefined) {
    if (!file) return
    const r = await readListFile(file)
    if (!r.ok) { setFileError(r.why); return }
    setText(r.text); setFileError(''); void read(r.text)
  }

  async function read(t = text) {
    setError(''); setReport(null); setPreview(null)
    const file = readCalendarFile(t)
    if (!file.ok) { setFileError(file.why); setRows(null); return }
    setFileError(''); setRows(file.rows); setBusy(true)
    const r = await previewCalendar(club.id, file.rows.map(x => ({ line: x.line, cells: x.cells as Record<string, string> })))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setPreview(r); setTicked(new Set())
  }

  async function run() {
    if (!rows || !preview) return
    const batch = crypto.randomUUID()
    const out: ImportRowOutcome[] = []
    setBusy(true); setError(''); setProgress({ done: 0, of: rows.length })
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK)
      const r = await importCalendarRows(club.id, batch, part.map(x => ({ line: x.line, cells: x.cells as Record<string, string> })), [...ticked])
      if (!r.ok) {
        // A chunk that could not be sent is said row by row; the rest carry on.
        out.push(...part.map(x => ({ line: x.line, title: x.cells.Title ?? '', outcome: 'failed' as const, why: r.error })))
      } else out.push(...r.done)
      setProgress({ done: Math.min(rows.length, i + CHUNK), of: rows.length })
    }
    setBusy(false); setProgress(null); setReport(out)
  }

  // What Import will bring in: new and changed rows, a row the chatbot was unsure of only once ticked.
  const importable = (preview?.rows ?? []).filter(r => (r.status === 'new' || r.status === 'changed') && (!r.check || ticked.has(r.line))).length
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <p className="t-cap text-ink/65"><Link href={`/clubhouse/${face.slug}/calendar`} className="underline underline-offset-2">Calendar</Link></p>
          <h1 className="t-h1 text-ink mt-1">Import a calendar</h1>
          <p className="t-cap text-ink/65 mt-1">Bring the season in from whatever calendar the club keeps. Nothing already here is deleted.</p>
        </div>
      </div>

      <div>
        {/* Step 1 — the prompt */}
        <section className={`${cardClass()} p-5 mt-6`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[min(16rem,100%)]">
              <h2 className="t-card text-ink">1. Copy the prompt</h2>
              <p className="t-cap text-ink/65 mt-1">Give it, with the club’s calendar file, to any chatbot. It answers with a CSV in {CALENDAR_FORMAT}. Or download the blank template and fill it in yourself.</p>
            </div>
            <div>
              <label htmlFor="imp-year" className={FIELD_LABEL}>Season</label>
              <select id="imp-year" value={year} onChange={e => setYear(Number(e.target.value))} className={`${FIELD} ch-focus w-[120px]`}>
                {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {promptError && <p role="alert" className="t-cap text-rust-deep mt-3">{promptError}</p>}
          {prompt && !prompt.ready && <p className="t-cap text-ink/80 mt-3">The club’s calendar isn’t set up yet, so nothing can be imported — try again later.</p>}
          <textarea ref={area} readOnly value={prompt?.prompt ?? ''} rows={8} aria-label="The prompt" spellCheck={false}
            className={`${FIELD} ch-focus mt-4 font-mono text-[13px] h-auto ${prompt ? '' : 'skeleton'}`} />
          <div className="flex flex-wrap gap-3 mt-3">
            <button type="button" disabled={!prompt} onClick={() => void copy()} className={`${buttonClass('secondary', false)} ch-focus`}>
              {copied ? <><IconCheck size={18} /> Copied</> : 'Copy the prompt'}
            </button>
            <button type="button" disabled={!prompt} onClick={download} className={`${buttonClass('quiet', false)} ch-focus`}>Download a blank template</button>
          </div>
        </section>

        {/* Step 2 — the file */}
        <section className={`${cardClass()} p-5 mt-4`}>
          <h2 className="t-card text-ink">2. Paste or upload the CSV</h2>
          <p className="t-cap text-ink/65 mt-1">Everything the chatbot answered, code block and all — or the file it gave you.</p>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6} spellCheck={false} aria-label="The CSV"
            placeholder={`${CALENDAR_FORMAT}\nRef,Date,End date,Start,End,Title,Type,…`}
            className={`${FIELD} ch-focus mt-4 font-mono text-[13px] h-auto`} />
          {fileError && <p role="alert" className="t-cap text-rust-deep mt-3">{fileError}</p>}
          <div className="flex flex-wrap gap-3 mt-3">
            <button type="button" disabled={!text.trim() || busy || !prompt?.ready} onClick={() => void read()} className={`${buttonClass('secondary', false)} ch-focus`}>
              {busy && !preview && !progress ? 'Reading…' : 'Preview'}
            </button>
            <label className={`${buttonClass('quiet', false)} ch-focus cursor-pointer`}>
              Upload a file
              <input type="file" accept={UPLOAD_ACCEPT} className="sr-only" onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
            </label>
          </div>
        </section>

        {error && <p role="alert" className="t-cap text-rust-deep mt-4">{error}</p>}

        {/* Step 3 — the preview */}
        {preview && !report && (
          <section className="mt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="t-h2 text-ink">3. Check it</h2>
                <p className="t-label text-ink mt-1">
                  {[`${counts.new} new`, `${counts.changed} changed`, `${counts.same} the same`, counts.bad ? `${counts.bad} can’t be imported` : null, preview.notInFile.length ? `${preview.notInFile.length} not in this file` : null].filter(Boolean).join(' · ')}
                </p>
                {counts.check > 0 && <p className="t-cap text-ink/65 mt-1">{counts.check === 1 ? 'One row the chatbot was unsure of imports' : `${counts.check} rows the chatbot was unsure of import`} only when ticked.</p>}
              </div>
              <button type="button" disabled={busy || importable === 0} onClick={() => void run()} className={`${buttonClass('primary', false)} ch-focus`}>
                {progress ? `Importing… ${progress.done} of ${progress.of}` : `Import ${importable} ${importable === 1 ? 'row' : 'rows'}`}
              </button>
            </div>
            {progress && (
              <div className="h-1.5 rounded-full bg-tint mt-3 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.of} aria-valuenow={progress.done}>
                <div className="h-full bg-accent-deep" style={{ width: `${(progress.done / progress.of) * 100}%` }} />
              </div>
            )}
            <div className={`${cardClass()} mt-4 overflow-x-auto`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    {['Line', 'Status', 'Day', 'Title', 'Type', 'Details'].map(h => <th key={h} scope="col" className="t-eyebrow text-ink/65 font-normal px-3 py-3 whitespace-nowrap">{h}</th>)}
                    <th scope="col" className="t-eyebrow text-ink/65 font-normal px-3 py-3 whitespace-nowrap">Import</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(r => {
                    const unsure = !!r.check && r.status !== 'bad'
                    const on = ticked.has(r.line)
                    return (
                      <tr key={r.line} className={`border-b border-line last:border-b-0 align-top ${unsure ? 'bg-gold-tint' : ''}`}>
                        <td className="px-3 py-2.5 text-ink/65 text-[13px] tabular-nums">{r.line}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {r.status === 'bad' ? <span className="t-cap text-rust-deep font-semibold">{STATUS_WORDS.bad}</span> : <Pill tone={r.status === 'new' ? 'win' : undefined}>{STATUS_WORDS[r.status]}</Pill>}
                        </td>
                        <td className="px-3 py-2.5 text-ink/80 text-[15px] whitespace-nowrap tabular-nums">{/^\d{4}-\d{2}-\d{2}$/.test(r.date) ? clubEventDates(r.date, r.date) : r.date || '—'}</td>
                        <td className="px-3 py-2.5 text-ink text-[15px] font-medium">{r.title || '—'}{r.ref && <span className="block t-cap text-ink/65 font-normal">Ref {r.ref}</span>}</td>
                        <td className="px-3 py-2.5 text-ink/80 text-[15px] whitespace-nowrap">{typeLabel(r.type as EventType)}</td>
                        <td className="px-3 py-2.5 text-[13px] leading-snug">
                          {r.bad.map((b, i) => <span key={i} className="block text-rust-deep">{b.column}: {b.why}</span>)}
                          {r.why && <span className="block text-rust-deep">{r.why}</span>}
                          {r.sheet && <span className="block text-ink/80">{r.sheet}</span>}
                          {r.sheetWhy && <span className="block text-rust-deep">Tee sheet not made: {r.sheetWhy}{r.status !== 'new' ? ' — its old one is kept.' : ''}</span>}
                          {r.check && <span className="block text-gold-deep font-semibold">Check: {r.check}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {unsure && (r.status === 'new' || r.status === 'changed') ? (
                            <button type="button" role="checkbox" aria-checked={on} aria-label={`Import line ${r.line}`}
                              onClick={() => setTicked(t => { const n = new Set(t); if (on) n.delete(r.line); else n.add(r.line); return n })}
                              className={`ch-focus inline-flex items-center justify-center w-6 h-6 rounded-[6px] border ${on ? 'bg-accent-deep border-accent-deep text-white' : 'bg-surface border-line-strong'}`}>
                              {on && <IconCheck size={16} />}
                            </button>
                          ) : <span className="t-cap text-ink/65">{r.status === 'new' || r.status === 'changed' ? 'Yes' : '—'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {preview.notInFile.length > 0 && (
              <div className="mt-6">
                <h3 className="t-card text-ink">Not in this file</h3>
                <p className="t-cap text-ink/65 mt-1">Already on the club’s calendar between this file’s first and last day. The import leaves them as they are.</p>
                <ul className={`${cardClass()} mt-3 divide-y divide-line`}>
                  {preview.notInFile.map((n, i) => (
                    <li key={i} className="px-4 py-2.5 flex gap-4 text-[15px]">
                      <span className="text-ink/80 tabular-nums w-28 flex-shrink-0">{clubEventDates(n.date, n.date)}</span>
                      <span className="text-ink flex-1">{n.name}</span>
                      <span className="text-ink/65">{typeLabel(n.type as EventType)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Step 4 — the report */}
        {report && (
          <section className="mt-6">
            <h2 className="t-h2 text-ink">Imported</h2>
            <p className="t-label text-ink mt-1">
              {(['made', 'changed', 'same', 'skipped', 'failed'] as const).map(k => [k, report.filter(r => r.outcome === k).length] as const).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${OUTCOME_WORDS[k].toLowerCase()}`).join(' · ')}
            </p>
            <p className="t-cap text-ink/65 mt-1">Every row is on the club’s activity log under this import. Fix any row not imported in the file and import it again — the rows already in stay as they are.</p>
            <ul className={`${cardClass()} mt-4 divide-y divide-line`}>
              {report.filter(r => r.outcome !== 'same' || r.why).map(r => (
                <li key={r.line} className="px-4 py-2.5 flex gap-4 text-[15px]">
                  <span className="text-ink/65 tabular-nums w-14 flex-shrink-0">Line {r.line}</span>
                  <span className="text-ink flex-1">{r.title}{r.why && <span className={`block t-cap ${r.outcome === 'failed' ? 'text-rust-deep' : 'text-ink/65'}`}>{r.why}</span>}</span>
                  <span className={`t-cap font-semibold ${r.outcome === 'failed' ? 'text-rust-deep' : 'text-ink/80'}`}>{OUTCOME_WORDS[r.outcome]}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 mt-4">
              <Link href={`/clubhouse/${face.slug}/calendar`} className={`${buttonClass('secondary', false)} ch-focus`}>See the calendar</Link>
              <button type="button" onClick={() => { setReport(null); setPreview(null); setRows(null); setText('') }} className={`${buttonClass('quiet', false)} ch-focus`}>Import another file</button>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
