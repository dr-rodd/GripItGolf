// A page drawn on the server may take components from a 'use client' file,
// and nothing else.
//
// Everything a 'use client' file exports reaches a server module as a client
// reference — fine for a component, which the browser draws, but a plain
// function becomes something that throws the moment the server calls it:
// "Attempted to call playByLine() from the server but playByLine is on the
// client". The build does not notice and neither does the type check; only
// the page fails, at runtime, on whatever data reaches the call. That is how
// the hub and the Scoring tab went down on 7 Nov 2026 — `playByLine` lived
// beside the tiles in LeagueRounds.tsx and both pages called it while they
// rendered. Rules belong in lib/, which both sides may import.
//
// So: every module under app/ and lib/ that is not itself a client file may
// import only components (PascalCase) and types from a client file — never a
// camelCase function or an ALL_CAPS constant.

import fs from 'fs'
import path from 'path'

let passed = 0
let failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n${name}`) }

const root = path.resolve(__dirname, '..')

/** Whether a module opens with the 'use client' directive (comments may come first). */
export function isClientModule(src: string): boolean {
  const body = src.replace(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/)*/, '')
  return /^\s*(['"])use client\1/.test(body)
}

/** The names a server module may not take from a client file: not a component, not a type. */
export function forbiddenNames(importClause: string): string[] {
  if (/^\s*\*\s+as\s+/.test(importClause)) return ['* (the whole module)']
  const named = (importClause.match(/\{([\s\S]*)\}/)?.[1] ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .filter(s => !s.startsWith('type '))
    .map(s => s.split(/\s+as\s+/)[0].trim())
  return named.filter(n => /^[a-z_$]/.test(n) || (/^[A-Z0-9_]+$/.test(n) && n.length > 1))
}

/** Each value import a server module takes from a client file, as `from ← target: names`. */
export function boundaryBreaches(
  file: string, src: string, readTarget: (spec: string) => { path: string; src: string } | null,
): string[] {
  if (isClientModule(src)) return []
  const out: string[] = []
  for (const m of src.matchAll(/^import\s+(?!type\b)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const target = readTarget(m[2])
    if (!target || !isClientModule(target.src)) continue
    const bad = forbiddenNames(m[1])
    if (bad.length) out.push(`${file} ← ${target.path}: ${bad.join(', ')}`)
  }
  return out
}

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(root, spec.slice(2))
    : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null
  if (!base) return null
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const p = base + ext
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) { if (f.name !== 'node_modules' && !f.name.startsWith('.')) walk(p, out) }
    else if (/\.tsx?$/.test(f.name)) out.push(p)
  }
  return out
}

section('The rule itself')
{
  ok(isClientModule("'use client'\n\nexport function A() {}") && isClientModule('// note\n/* more */\n"use client"\n'),
    "a 'use client' file is recognised, comments before the directive or not")
  ok(!isClientModule("import x from 'y'\n'use client'"), 'a directive that is not first is not one')
  const client = { path: 'Tiles.tsx', src: "'use client'\nexport function Tile() {}\nexport function playByLine() {}" }
  const read = () => client
  ok(boundaryBreaches('page.tsx', "import { Tile, playByLine, type Door } from './Tiles'", read).length === 1,
    'a server page taking a function from a client file is caught (the 7 Nov 2026 failure)')
  ok(boundaryBreaches('page.tsx', "import { Tile, type Door } from './Tiles'\nimport Default from './Tiles'", read).length === 0,
    'components, a default component and types pass')
  ok(boundaryBreaches('page.tsx', "import { STEP_TITLES } from './Tiles'", read).length === 1, 'so does an ALL_CAPS constant')
  ok(boundaryBreaches('Other.tsx', "'use client'\nimport { playByLine } from './Tiles'", read).length === 0,
    'a client file may take anything from another')
}

section('Every server module under app/ and lib/')
{
  const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]
  const cache = new Map<string, string>()
  const src = (p: string) => { if (!cache.has(p)) cache.set(p, fs.readFileSync(p, 'utf8')); return cache.get(p)! }
  const clientCount = files.filter(f => isClientModule(src(f))).length
  ok(files.length > 100 && clientCount > 20 && files.length - clientCount > 50, `the scan sees the tree (${files.length} modules, ${clientCount} client)`)
  const breaches = files.flatMap(f => boundaryBreaches(path.relative(root, f), src(f), spec => {
    const p = resolveSpec(f, spec)
    return p ? { path: path.relative(root, p), src: src(p) } : null
  }))
  for (const b of breaches) console.log(`    ${b}`)
  ok(breaches.length === 0, 'no server module calls a function from a client file — rules go in lib/')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
