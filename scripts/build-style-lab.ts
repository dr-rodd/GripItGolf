/**
 * Writes app/style-lab.css from the registry in lib/styleLab.ts.
 *
 *   npm run fonts:lab              write it
 *   npm run fonts:lab -- --check   fail if the file on disk is out of date
 *
 * The stylesheet is generated so the registry is the only copy of what the
 * lab can change: add a font there, run this, and the CSS follows.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { labStylesheet } from '../lib/styleLab'

const OUT = 'app/style-lab.css'
const want = labStylesheet()

if (process.argv.includes('--check')) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf-8') : ''
  if (have !== want) {
    console.error(`${OUT} is out of date — run npm run fonts:lab`)
    process.exit(1)
  }
  console.log(`${OUT} is current`)
} else {
  writeFileSync(OUT, want)
  console.log(`wrote ${OUT}`)
}
