// Reading a CSV the way a spreadsheet or a chatbot writes one — the only
// copy (Clubhouse stage c2). Quoted cells may hold commas, line breaks and
// doubled quotes; a byte-order mark is dropped; a file pasted from a chat
// still wrapped in a ``` code block is unwrapped; a tab- or
// semicolon-separated file is read by its first line. Pure.

export type Delimiter = ',' | '\t' | ';'

/** The cells, line by line, and the line of the file each row began on. */
export function parseCsv(text: string): { rows: string[][]; lines: number[] } {
  let t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const fence = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(t)
  if (fence) t = fence[1]
  const first = t.split('\n').find(l => l.trim()) ?? ''
  const d: Delimiter = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',')
  const rows: string[][] = []
  const lines: number[] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else {
        if (ch === '\n') line++
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell.trim() === '') { cell = ''; quoted = true; continue }
    if (ch === d) { row.push(cell); cell = ''; continue }
    if (ch === '\n') {
      row.push(cell)
      if (row.some(c => c.trim() !== '')) { rows.push(row); lines.push(rowLine) }
      row = []; cell = ''; line++; rowLine = line
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim() !== '')) { rows.push(row); lines.push(rowLine) }
  return { rows: rows.map(r => r.map(c => c.trim())), lines }
}

/** A cell written safely: quoted where it must be, and a leading formula character defused. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@]/.test(s) && !/^[+-]?\d/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
