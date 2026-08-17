// The branded QR as a PNG — for anywhere a browser isn't.
//
// The share page draws its code with qr-code-styling, which needs a DOM and
// therefore cannot run in the confirmation email's serverless route. The
// plain `qrcode` package runs anywhere but only draws squares. This file is
// the bridge: `qrcode` computes the matrix — the part that must be right —
// and the styling is rasterised here by hand into a pngjs buffer, matching
// the share page's look module for module: brown circle dots, emerald
// extra-rounded anchor rings, emerald anchor dots, white ground.
//
// Pure and deterministic: data in, PNG buffer out, no I/O. The route
// attaches what comes back; scripts/test-qr-email.ts decodes it with jsQR
// so a change that stops it scanning fails the suite rather than the trip.
//
// Literal hexes for the same reason the share page carries them: a QR is
// data, not chrome, and these are the light palette's own values.

import QRCode from 'qrcode'
import { PNG } from 'pngjs'

const DOT = { r: 0x4a, g: 0x37, b: 0x28 } // bark #4A3728
const ANCHOR = { r: 0x0a, g: 0x9d, b: 0x56 } // accent #0A9D56
const WHITE = { r: 0xff, g: 0xff, b: 0xff }

type Rgb = { r: number; g: number; b: number }

/** Quiet zone, in modules — the spec asks for at least this much white. */
const MARGIN = 4

/** Pixels per module. ~37 modules for a trip URL at level H → ~490px. */
const SCALE = 12

function blend(png: PNG, x: number, y: number, c: Rgb, a: number) {
  if (a <= 0 || x < 0 || y < 0 || x >= png.width || y >= png.height) return
  const i = (y * png.width + x) * 4
  png.data[i] = Math.round(c.r * a + png.data[i] * (1 - a))
  png.data[i + 1] = Math.round(c.g * a + png.data[i + 1] * (1 - a))
  png.data[i + 2] = Math.round(c.b * a + png.data[i + 2] * (1 - a))
  png.data[i + 3] = 255
}

/** A filled circle with an analytically anti-aliased edge. */
function fillCircle(png: PNG, cx: number, cy: number, rad: number, c: Rgb) {
  const x0 = Math.floor(cx - rad - 1)
  const x1 = Math.ceil(cx + rad + 1)
  const y0 = Math.floor(cy - rad - 1)
  const y1 = Math.ceil(cy + rad + 1)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - rad
      blend(png, x, y, c, Math.min(1, Math.max(0, 0.5 - d)))
    }
  }
}

/** A filled rounded rectangle, centred, likewise anti-aliased. */
function fillRoundRect(
  png: PNG, cx: number, cy: number, half: number, rad: number, c: Rgb,
) {
  const x0 = Math.floor(cx - half - 1)
  const x1 = Math.ceil(cx + half + 1)
  const y0 = Math.floor(cy - half - 1)
  const y1 = Math.ceil(cy + half + 1)
  const inner = half - rad
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const qx = Math.abs(x + 0.5 - cx) - inner
      const qy = Math.abs(y + 0.5 - cy) - inner
      const d =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        rad
      blend(png, x, y, c, Math.min(1, Math.max(0, 0.5 - d)))
    }
  }
}

/** Is this module inside one of the three 7×7 finder patterns? */
function inFinder(row: number, col: number, size: number): boolean {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= size - 7) ||
    (row >= size - 7 && col < 7)
  )
}

/**
 * The trip QR, styled like the share page's, as a PNG buffer.
 * Level H throughout — the same glare-and-shake headroom as on screen.
 */
export function styledQrPng(data: string): Buffer {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'H' })
  const size = qr.modules.size
  const px = (size + MARGIN * 2) * SCALE
  const png = new PNG({ width: px, height: px })

  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = WHITE.r
    png.data[i + 1] = WHITE.g
    png.data[i + 2] = WHITE.b
    png.data[i + 3] = 255
  }

  // Every dark module outside the finders is a circle a module wide —
  // qr-code-styling's 'dots' type, which the share page proved scannable.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.data[row * size + col]) continue
      if (inFinder(row, col, size)) continue
      fillCircle(
        png,
        (MARGIN + col + 0.5) * SCALE,
        (MARGIN + row + 0.5) * SCALE,
        SCALE / 2,
        DOT,
      )
    }
  }

  // The three anchors: an extra-rounded emerald ring a module thick,
  // punched back to white, with the emerald dot in the middle.
  const corners: Array<[number, number]> = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]
  for (const [col, row] of corners) {
    const cx = (MARGIN + col + 3.5) * SCALE
    const cy = (MARGIN + row + 3.5) * SCALE
    fillRoundRect(png, cx, cy, 3.5 * SCALE, 2.5 * SCALE, ANCHOR)
    fillRoundRect(png, cx, cy, 2.5 * SCALE, 1.5 * SCALE, WHITE)
    fillCircle(png, cx, cy, 1.5 * SCALE, ANCHOR)
  }

  return PNG.sync.write(png)
}
