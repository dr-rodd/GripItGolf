// Links back to Strava — kept apart from lib/strava.ts so a browser
// component can use them without pulling in the signing code there.
//
// Strava's API Policy §2.4 asks for clear links from the app to the
// runner's own Strava: every Strava run in a runner's list links to its
// activity page ("View on Strava", the wording Strava's brand guidelines
// use), and the connected card links to where Green Dot's access can be
// managed or removed.

/** A Strava activity's own page. */
export function activityUrl(id: number): string {
  return `https://www.strava.com/activities/${id}`
}

/** Where a runner manages — or removes — Green Dot's access on Strava. */
export const STRAVA_APPS_URL = 'https://www.strava.com/settings/apps'
