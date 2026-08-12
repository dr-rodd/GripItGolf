'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DirectoryCourse } from '@/lib/courseDirectory'

/**
 * The platform course list, fetched in the browser by whoever needs to pick
 * from it.
 *
 * **Why not on the server, with everything else.** The catalogue is shared
 * platform rows (`trip_id IS NULL`) and it grows — the bulk import in
 * `docs/course-import.md` is dozens of clubs at a time and adding to it is a
 * migration, not a feature. Fetched in a page's own `Promise.all` it is a
 * query on the critical path of that tab and a payload serialised into the
 * HTML, every single load, for a sheet most visitors never open. Neither the
 * scoring screen nor Trip Setup needs a course list to render; only the
 * picker inside them does, and the picker is behind a tap.
 *
 * So it loads where it is used, and only once that component exists. Trip
 * creation already worked this way (`docs/design-system.md:117` — it made
 * `/dashboard/create` static, which is what lets the landing animation hand
 * over without a gap); this is the same trick applied to the two trip tabs
 * that were still paying for it up front.
 *
 * **`select('*')` deliberately.** `county` arrives with migration 032, which
 * is run by hand, and naming a column that does not exist fails the whole
 * query rather than dropping the field — which would empty the picker on a
 * database that has not run it. Absent, `countyOf` falls back to parsing the
 * location. This is the one copy of that reasoning; there were three.
 *
 * `loaded` is separate from an empty array on purpose: the directory always
 * has courses in it, so "none" means the query failed and is worth saying,
 * while "not yet" is not.
 */
export function usePlatformCourses() {
  const [courses, setCourses] = useState<DirectoryCourse[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    supabase
      .from('courses')
      .select('*')
      .is('trip_id', null)
      .order('name')
      .then(({ data, error }) => {
        if (!live) return
        if (error) console.error('usePlatformCourses query failed:', error)
        setCourses((data ?? []) as DirectoryCourse[])
        setLoaded(true)
      })
    return () => { live = false }
  }, [])

  return { courses, loaded }
}
