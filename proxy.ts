// Events live at /event/<code>, trips at /trip/<code> (Ross, 8 Nov 2026) —
// one set of pages, `app/trip/[tripCode]`, serves both.
//
// This runs before a page is chosen, on those two addresses only. It does
// two things and decides nothing: an /event/ address is served from the trip
// pages (a rewrite, so the address bar keeps saying /event/), and both carry
// two request headers saying which root was asked for and the whole address,
// because a layout cannot see the address it is rendering. The trip layout
// reads them, knows the kind, and sends an event's /trip/ link to /event/
// and a trip's /event/ link to /trip/ (lib/tripPaths.ts).
//
// Next.js 16 calls this file `proxy.ts` (it was `middleware.ts`) and always
// runs it on Node.

import { NextResponse, type NextRequest } from 'next/server'
import { PATH_HEADER, ROOT_HEADER } from './lib/tripPaths'

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const asked = pathname.startsWith('/event/') ? 'event' : 'trip'
  const query = new URLSearchParams(searchParams)
  query.delete('_rsc')
  const qs = query.toString()

  const headers = new Headers(request.headers)
  headers.set(ROOT_HEADER, asked)
  headers.set(PATH_HEADER, `${pathname}${qs ? `?${qs}` : ''}`)

  if (asked === 'event') {
    const url = request.nextUrl.clone()
    url.pathname = `/trip/${pathname.slice('/event/'.length)}`
    return NextResponse.rewrite(url, { request: { headers } })
  }
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/event/:path+', '/trip/:path+'],
}
