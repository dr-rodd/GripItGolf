/**
 * The style lab's fonts and registry. Run with: npm run test:style-lab
 *
 * test:branding holds the fence — that nothing lab-related leaks into
 * globals.css, the layout's fonts or a server read of the cookie. This holds
 * what is inside it: every font the registry offers has its files, its
 * licence, the characters an Irish golf trip prints, tabular figures where
 * a board needs them, and the weights its role asks for. The fonts are read
 * with fontkit, so a file that merely exists is not enough.
 */

import fs from 'fs'
import { execFileSync } from 'child_process'
import * as fontkit from 'fontkit'
import {
  AXES, LAB_FAMILIES, HOUSE_SETUP, STYLE_BOOT_SCRIPT, labCount, parseSetup, serialiseSetup,
  setupAttributes, type FontOption, type Setup,
} from '../lib/styleLab'
import { THEME_BOOT_SCRIPT, resolvesDark, themeChoiceOf } from '../lib/theme'

let passed = 0, failed = 0
const failures: string[] = []
function ok(cond: boolean, label: string) {
  if (cond) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function eq(got: unknown, want: unknown, label: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) passed++
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}\n        got  ${g}\n        want ${w}`) }
}
const section = (n: string) => console.log(`\n${n}`)

const DIR = 'public/fonts/lab'
const WARN_BYTES = 120 * 1024
const GLYPHS = [...'áéíóúÁÉÍÓÚ’–·0123456789']

/** The weights a text or score face must reach. A title needs the one weight it is set at. */
const NEEDS: Record<'text' | 'score', number[]> = { text: [400, 600], score: [400, 700] }

const fontOptions = AXES.flatMap(a => a.options as readonly unknown[])
  .filter((o): o is FontOption => typeof o === 'object' && o !== null && 'role' in o)

section('The registry')
{
  for (const axis of AXES) {
    const ids = axis.options.map(o => o.id)
    eq(new Set(ids).size, ids.length, `${axis.label}: option ids are unique`)
    eq(ids[0], axis.house, `${axis.label}: house is listed first`)
    ok(/^data-[a-z-]+$/.test(axis.attr), `${axis.label}: a data- attribute (${axis.attr})`)
  }
  const famIds = LAB_FAMILIES.map(f => f.id)
  eq(new Set(famIds).size, famIds.length, 'family ids are unique')
  for (const f of LAB_FAMILIES) {
    ok(f.family.startsWith('Lab '), `${f.id}: its family is prefixed Lab, so no house face can collide`)
  }
  for (const o of fontOptions) {
    ok(o.fallback === 'sans' || o.fallback === 'serif', `${o.role} ${o.id} has a fallback`)
    if (o.family) ok(famIds.includes(o.family), `${o.role} ${o.id} names a family the lab ships`)
  }
  for (const f of LAB_FAMILIES) {
    ok(fontOptions.some(o => o.family === f.id), `${f.id} is offered somewhere — no orphan files`)
  }
}

section('Every font is there, licensed, and complete')
for (const fam of LAB_FAMILIES) {
  ok(['OFL', 'Apache', 'ITF-FFL'].includes(fam.licence), `${fam.id}: licence is OFL, Apache or ITF-FFL (${fam.licence})`)
  const folder = `${DIR}/${fam.id}`
  const licenceFile = fs.existsSync(folder)
    ? fs.readdirSync(folder).find(n => /^(OFL|LICEN[CS]E|FFL)/i.test(n))
    : undefined
  ok(!!licenceFile, `${fam.id}: a licence file sits beside the fonts`)

  const roles = new Set(fontOptions.filter(o => o.family === fam.id).map(o => o.role))
  for (const file of fam.files) {
    const p = `${DIR}/${file.path}`
    const exists = fs.existsSync(p)
    ok(exists, `${fam.id}: ${file.path} exists`)
    if (!exists) continue
    const buf = fs.readFileSync(p)
    ok(buf.subarray(0, 4).toString('latin1') === 'wOF2', `  …and is woff2`)
    if (buf.length > WARN_BYTES) console.log(`  WARN  ${file.path} is ${Math.round(buf.length / 1024)} KB`)

    const font = fontkit.create(buf) as fontkit.Font
    const missing = GLYPHS.filter(c => !font.hasGlyphForCodePoint(c.codePointAt(0)!))
    eq(missing, [], `  …has á é í ó ú Á É Í Ó Ú ’ – · and 0–9`)

    if (roles.has('score')) {
      ok(font.availableFeatures.includes('tnum'), `  …has tabular figures (tnum), or board columns wobble`)
    }

    // The weights the file can draw: a variable range, or its one weight.
    const declared = file.weight.split(' ').map(Number)
    const axis = font.variationAxes?.wght
    const [lo, hi] = axis ? [axis.min, axis.max] : [declared[0], declared[0]]
    ok(declared[0] >= lo && (declared[1] ?? declared[0]) <= hi,
      `  …its declared weight ${file.weight} is inside what it carries (${lo}–${hi})`)
    for (const role of roles) {
      const needs = role === 'title'
        ? fontOptions.filter(o => o.family === fam.id && o.role === 'title').map(o => o.weight ?? 700)
        : NEEDS[role]
      if (role === 'title') {
        ok(needs.every(w => w >= 600 && w <= 800), `  …a title weight between 600 and 800 (${needs.join(', ')})`)
      }
      ok(needs.every(w => w >= lo && w <= hi), `  …covers the ${role} weights ${needs.join(' and ')}`)
    }
  }
}

section('The stylesheet is generated and current')
{
  let current = true
  try {
    execFileSync('npx', ['tsx', 'scripts/build-style-lab.ts', '--check'], { stdio: 'pipe' })
  } catch { current = false }
  ok(current, 'app/style-lab.css matches the registry (npm run fonts:lab -- --check)')
}

section('A setup survives the round trip')
{
  eq(serialiseSetup(HOUSE_SETUP), 'title=schibsted text=archivo score=bespoke depth=raised corners=soft grain=on',
    'the house setup, written out')
  const lab: Setup = { title: 'bricolage', text: 'instrument', score: 'newsreader', depth: 'deep', corners: 'sharp', grain: 'off' }
  eq(parseSetup(serialiseSetup(lab)), lab, 'parse(serialise(x)) is x')
  eq(parseSetup(serialiseSetup(HOUSE_SETUP)), HOUSE_SETUP, '  …for the house setup too')
  // Every option on every axis, one at a time
  let all = true
  for (const a of AXES) for (const o of a.options) {
    const s = { ...HOUSE_SETUP, [a.key]: o.id }
    if (JSON.stringify(parseSetup(serialiseSetup(s))) !== JSON.stringify(s)) all = false
  }
  ok(all, '  …for every option on every axis')

  eq(parseSetup('title=clash corners=pointy'), HOUSE_SETUP, 'unknown ids come back as house')
  eq(parseSetup('colour=gold title=gabarito').title, 'gabarito', 'an unknown axis is ignored, the rest kept')
  eq(parseSetup(''), HOUSE_SETUP, 'nothing is house')
  eq(parseSetup(null), HOUSE_SETUP, '  …and so is null')
  eq(parseSetup(decodeURIComponent(encodeURIComponent(serialiseSetup(lab)))), lab, 'the URL-encoded cookie value reads back')

  eq(setupAttributes(HOUSE_SETUP), {}, 'house is no attributes at all')
  eq(setupAttributes({ ...HOUSE_SETUP, title: 'bricolage', grain: 'off' }),
    { 'data-title-font': 'bricolage', 'data-grain': 'off' }, 'a lab setup is only the axes it moved')
  eq(labCount({ ...HOUSE_SETUP, title: 'bricolage', grain: 'off' }), 2, 'and the pill counts those: Lab · 2')
}

section('The head script')
{
  // Run it against a fake document and see what it puts on <html>.
  const run = (cookie: string) => {
    const attrs: Record<string, string> = {}
    const document = { cookie, documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v } } }
    new Function('document', STYLE_BOOT_SCRIPT)(document)
    return attrs
  }
  eq(run(''), {}, 'no cookie, no attributes')
  eq(run(`gg_theme=dark; gg_style=${encodeURIComponent('title=gabarito text=archivo depth=flat')}`),
    { 'data-title-font': 'gabarito', 'data-depth': 'flat' }, 'it sets the lab axes and skips the house ones')
  eq(run(`gg_style=${encodeURIComponent('title=Bad<script> colour=gold grain=off')}`),
    { 'data-grain': 'off' }, 'a value that is not a plain word is ignored, as is an unknown axis')
  eq(run('gg_style=%E0%A4%A'), {}, 'a malformed cookie throws inside the try, and nothing is set')
}

section('The theme: light, dark or the phone\'s own')
{
  // The head script against a fake phone: what class it leaves, and whether
  // a phone turning dark later moves a System page with it.
  const boot = (cookie: string, systemDark: boolean) => {
    const classes = new Set<string>()
    const listeners: (() => void)[] = []
    const q = { matches: systemDark, addEventListener: (_: string, f: () => void) => listeners.push(f) }
    const document = {
      cookie,
      documentElement: { classList: { toggle: (c: string, on: boolean) => { if (on) classes.add(c); else classes.delete(c) } } },
      querySelector: () => null,
      addEventListener: () => {},
    }
    const window = { matchMedia: () => q }
    new Function('document', 'window', THEME_BOOT_SCRIPT)(document, window)
    return {
      dark: () => classes.has('dark'),
      phoneTurns: (dark: boolean) => { q.matches = dark; listeners.forEach(f => f()) },
    }
  }
  eq(boot('', true).dark(), false, 'no choice is light, whatever the phone says')
  eq(boot('gg_theme=dark', false).dark(), true, 'Dark is dark')
  eq(boot('gg_theme=light', true).dark(), false, 'Light is light on a dark phone')
  eq(boot('gg_theme=system', true).dark(), true, 'System on a dark phone is dark')
  eq(boot('gg_theme=system', false).dark(), false, '  …and on a light one, light')
  const sys = boot('a=1; gg_theme=system', false)
  sys.phoneTurns(true)
  eq(sys.dark(), true, 'System follows the phone turning dark, without a reload')
  const fixed = boot('gg_theme=light', false)
  fixed.phoneTurns(true)
  eq(fixed.dark(), false, '  …which never moves a page set to Light')

  eq(themeChoiceOf('x=1; gg_theme=system'), 'system', 'the choice reads back off the cookie')
  eq(themeChoiceOf('gg_theme=purple'), 'light', '  …and anything else is light')
  eq(resolvesDark('system', true) && !resolvesDark('light', true) && resolvesDark('dark', false), true,
    'resolvesDark agrees with the script')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
