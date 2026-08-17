/**
 * The email's QR must scan. Run with: npm run test:qr-email
 *
 * lib/qrPng.ts hand-rasterises the styled code — brown dots, emerald
 * anchors — because qr-code-styling cannot run in a serverless route. Hand
 * rasterisation means a geometry mistake (a dot half a module off, an
 * anchor ring too thin, a margin trimmed) produces a picture that still
 * looks like a QR and silently stops scanning. So this test does what a
 * phone does: renders the exact buffer the route attaches and decodes it
 * with jsQR. It also pins the brand: at least one pixel of bark and one of
 * emerald, on white, so a refactor that quietly falls back to plain black
 * squares fails here rather than in an inbox.
 */

import { PNG } from 'pngjs'
import jsQR from 'jsqr'
import { styledQrPng } from '../lib/qrPng'

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

section('the attached PNG decodes to the trip URL')
const url = 'https://greendot.live/trip/GX7K2P'
const png = PNG.sync.read(styledQrPng(url))
ok(png.width === png.height, 'square image')
ok(png.width >= 400, `at least 400px for the 200px slot (got ${png.width})`)

const decoded = jsQR(
  new Uint8ClampedArray(png.data), png.width, png.height,
)
ok(decoded !== null, 'jsQR finds a code at all')
eq(decoded?.data, url, 'decodes to exactly the URL that went in')

section('the brand is in the pixels')
let bark = 0, emerald = 0, white = 0
for (let i = 0; i < png.data.length; i += 4) {
  const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]]
  if (r === 0x4a && g === 0x37 && b === 0x28) bark++
  if (r === 0x0a && g === 0x9d && b === 0x56) emerald++
  if (r === 0xff && g === 0xff && b === 0xff) white++
}
ok(bark > 1000, `bark #4A3728 dots present (${bark} px)`)
ok(emerald > 1000, `emerald #0A9D56 anchors present (${emerald} px)`)
ok(white > png.width * png.height / 3, 'white ground dominates')

section('the quiet zone survives')
// A scanner needs white around the code; check the outer 2 modules are clean.
let edgeDark = 0
const band = Math.floor(png.width / 24) // ~2 of ~48 module-widths
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const onEdge =
      x < band || y < band || x >= png.width - band || y >= png.height - band
    if (!onEdge) continue
    if (png.data[(y * png.width + x) * 4] < 0xf0) edgeDark++
  }
}
eq(edgeDark, 0, 'no ink in the outer margin band')

console.log(`\n${'─'.repeat(56)}`)
if (failed === 0) {
  console.log(`✓ all ${passed} checks passed`)
} else {
  console.log(`✗ ${failed} of ${passed + failed} failed`)
  for (const f of failures) console.log(`  · ${f}`)
  process.exit(1)
}
