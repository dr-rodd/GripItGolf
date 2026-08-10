/**
 * The website lookup's pure half. Run with: npm run test:course-lookup
 *
 * `lib/courseLookup.ts` turns a club website into a suggestion the
 * add-course form can pre-fill. What matters:
 *
 *   1. HTML becomes words — scripts and styles must not leak into what
 *      Claude reads, and a ratings table must survive as its numbers.
 *   2. Only the club's own pages are followed, and only the ones that
 *      smell like a scorecard.
 *   3. A misread figure costs that field, never the lookup — anything
 *      outside the card check's ranges comes back null.
 *   4. The fetch never touches a private address.
 */

import {
  htmlToText, ratingsLinks, normalizeLookup, lookupIsEmpty, privateHost,
} from '../lib/courseLookup'

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

// ─── HTML → text ───────────────────────────────────────────────

section('htmlToText')
{
  eq(htmlToText('<p>Par <b>72</b></p>'), 'Par 72', 'tags become spaces, words survive')
  eq(htmlToText('<script>var x = "slope 999";</script>CR 71.4'), 'CR 71.4', 'scripts are removed whole')
  eq(htmlToText('<style>.a{content:"Par 99"}</style>Slope 125'), 'Slope 125', 'styles are removed whole')
  eq(htmlToText('White &amp; Red &nbsp; tees'), 'White & Red tees', 'entities decode')
  eq(htmlToText('<table><tr><td>White</td><td>71.4</td><td>125</td></tr></table>'),
    'White 71.4 125', 'a ratings table survives as its numbers')
  eq(htmlToText('<!-- slope 999 -->72'), '72', 'comments are removed')
}

// ─── Which links are worth following ───────────────────────────

section('ratingsLinks')
{
  const html = `
    <a href="/scorecard">Scorecard</a>
    <a href="/the-course/">Course</a>
    <a href="/news">News</a>
    <a href="https://elsewhere.example.com/scorecard">Their scorecard</a>
    <a href="mailto:pro@club.ie">Email</a>
    <a href="/scorecard#front">Scorecard again</a>
    <a href="/green-fees">Visitor tee rates</a>
  `
  const links = ratingsLinks(html, 'https://club.example.com/')
  eq(links, [
    'https://club.example.com/scorecard',
    'https://club.example.com/the-course/',
    'https://club.example.com/green-fees',
  ], 'scorecard-ish links only, same origin, deduplicated')
  eq(ratingsLinks('<a href="/scorecard">Card</a>', 'https://club.example.com/scorecard'),
    [], 'the page itself is not followed again')
}

// ─── The suggestion off the wire ───────────────────────────────

section('normalizeLookup')
{
  const s = normalizeLookup({
    location: '  Lahinch, Clare, Ireland  ',
    tees: [
      { name: 'Blue', gender: 'M', par: 72, courseRating: 74.42, slope: 132 },
      { name: 'Red', gender: 'F', par: 72, courseRating: null, slope: 1250 },
      { name: 'Blue', gender: 'M', par: 70, courseRating: 70, slope: 120 },
      { name: '', gender: 'M', par: 72, courseRating: 71, slope: 120 },
    ],
  })
  eq(s.location, 'Lahinch, Clare, Ireland', 'location is trimmed')
  eq(s.tees.length, 2, 'duplicates and nameless tees are dropped')
  eq(s.tees[0], { name: 'Blue', gender: 'M', par: 72, courseRating: 74.4, slope: 132 },
    'course rating rounds to one decimal, first reading wins')
  eq(s.tees[1].slope, null, 'a slope of 1250 costs the field, not the lookup')
  eq(s.tees[1].par, 72, 'the rest of that tee survives')

  eq(normalizeLookup(null), { location: null, tees: [] }, 'garbage in, empty suggestion out')
  ok(lookupIsEmpty(normalizeLookup({})), 'an empty extraction reads as empty')
  ok(!lookupIsEmpty(s), 'a suggestion with tees is not empty')

  const many = normalizeLookup({
    location: null,
    tees: Array.from({ length: 10 }, (_, i) => ({
      name: `Tee ${i}`, gender: 'M', par: 72, courseRating: 70, slope: 120,
    })),
  })
  eq(many.tees.length, 6, 'never more than six tees')
}

// ─── Private hosts ─────────────────────────────────────────────

section('privateHost')
{
  ok(privateHost('localhost'), 'localhost is refused')
  ok(privateHost('127.0.0.1'), 'loopback is refused')
  ok(privateHost('10.0.0.5'), '10.x is refused')
  ok(privateHost('172.20.1.1'), '172.16–31 is refused')
  ok(privateHost('192.168.1.1'), '192.168 is refused')
  ok(privateHost('169.254.169.254'), 'the metadata address is refused')
  ok(privateHost('club.internal'), '.internal is refused')
  ok(!privateHost('lahinchgolf.com'), 'a real club is allowed')
  ok(!privateHost('172.32.0.1'), '172.32 is public and allowed')
}

// ─── Result ────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(failures.map(f => `  - ${f}`).join('\n'))
  process.exit(1)
}
