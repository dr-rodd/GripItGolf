import {
  PROVINCES, HUB_LEAGUE, widgetUrl, siteUrl, pageUrl, readCompetitionList, readSitePages, drawPageOf,
  readPageWidget, readDraw, drawTable, type Competition, type Draw, type ProvinceKey,
} from '@/lib/interclub'

/**
 * Reading the inter-club draws off Golf Genius — the server's half of
 * lib/interclub.ts, which decides everything. Every request goes through
 * Next's own fetch cache, kept `INTERCLUB_SECONDS`: a draw is read from
 * Golf Genius at most once in that time however many people look, and the
 * pages that show it are regenerated on the same clock. A draw changes when
 * a convenor types a result in, a few times a week; fifteen minutes is
 * live enough and asks next to nothing of somebody else's site.
 *
 * Nothing here ever throws to a page: a site that cannot be reached, or a
 * page that has changed shape, comes back as what it is, and the page says
 * so with the link to the original.
 */

export const INTERCLUB_SECONDS = 900

/** Who is asking, as Golf Genius sees it — named, with the site, like the weather route's. */
const USER_AGENT = 'GreenDotGolf/1.0 (+https://greendot.live/interclub)'

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      next: { revalidate: INTERCLUB_SECONDS },
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

export type ProvinceList = {
  key: ProvinceKey
  name: string
  /** Null where the hub could not be read just now. */
  competitions: Competition[] | null
}

/** Every province's competitions, read together. */
export async function readProvinces(): Promise<ProvinceList[]> {
  return Promise.all(PROVINCES.map(async p => {
    const html = await get(widgetUrl(HUB_LEAGUE, p.widgetPage))
    const competitions = html ? readCompetitionList(html, p.key) : null
    return { key: p.key, name: p.name, competitions: competitions && competitions.length > 0 ? competitions : null }
  }))
}

export async function findCompetition(province: ProvinceKey, slug: string): Promise<Competition | null | 'unreachable'> {
  const p = PROVINCES.find(x => x.key === province)!
  const html = await get(widgetUrl(HUB_LEAGUE, p.widgetPage))
  if (!html) return 'unreachable'
  return readCompetitionList(html, province).find(c => c.slug === slug) ?? null
}

export type CompetitionDraw =
  | { state: 'read'; draw: Draw; source: string }
  /** Golf Ireland shows this one as a picture or a results table — linked, never read. */
  | { state: 'elsewhere'; what: 'picture' | 'results' | 'other'; source: string }
  /** The site has no draw page yet (a stroke-play stage first, or a draw to come). */
  | { state: 'none'; source: string }
  /** A table this cannot read as a draw — never half read. */
  | { state: 'unreadable'; source: string }
  /** Golf Genius did not answer. */
  | { state: 'unreachable'; source: string }

/**
 * One competition's draw: its site, the page its menu calls the draw, the
 * table that page loads, read. Three requests, each cached.
 */
export async function readCompetitionDraw(c: Competition, today: string): Promise<CompetitionDraw> {
  const site = siteUrl(c.id)
  const home = await get(site)
  if (!home) return { state: 'unreachable', source: site }
  const page = drawPageOf(readSitePages(home))
  if (!page) return { state: 'none', source: site }
  const source = pageUrl(page.id)
  const pageHtml = await get(source)
  if (!pageHtml) return { state: 'unreachable', source }
  const widget = readPageWidget(pageHtml)
  if (widget.kind !== 'table') return { state: 'elsewhere', what: widget.what, source }
  const table = await get(widget.url)
  if (!table) return { state: 'unreachable', source }
  // A date written without its year ("5-Jun") is the season's: the first year the draw names, else this one.
  const year = Number(drawTable(table)?.match(/\b(20\d{2})\b/)?.[1] ?? today.slice(0, 4))
  const draw = readDraw(table, year)
  return draw ? { state: 'read', draw, source } : { state: 'unreadable', source }
}
