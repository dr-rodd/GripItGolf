// How long a server answer took (MO3, D282) — one line in Vercel's logs and
// a Server-Timing header, so the before and after of a speed change are read
// off the live site rather than guessed. Nothing on screen; never a person's
// name, token or anything they typed — only the route, the action and the
// milliseconds.

export function startTimer(): () => number {
  const t0 = performance.now()
  return () => Math.round(performance.now() - t0)
}

/** Logs `{ timing, action, ms, status }` and returns the header's value. */
export function logTiming(route: string, action: unknown, ms: number, status: number): string {
  const a = typeof action === 'string' && /^[a-z.]{1,32}$/.test(action) ? action : 'other'
  console.log(JSON.stringify({ timing: route, action: a, ms, status }))
  return `app;dur=${ms}`
}
