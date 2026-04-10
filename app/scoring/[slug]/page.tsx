import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import CourseDashboardClient from "./CourseDashboardClient"

export const dynamic = "force-dynamic"

// Slug → candidate DB course names (handles minor name variations)
const SLUG_NAMES: Record<string, string[]> = {
  "old-tom-morris":    ["Old Tom Morris"],
  "st-patricks-links": ["St Patrick Links", "St Patricks Links"],
  "sandy-hills":       ["Sandy Hills"],
}

export default async function CourseDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const candidates = SLUG_NAMES[slug]
  if (!candidates) notFound()

  const [
    coursesRes,
    playersRes,
    roundsRes,
    holesRes,
    teesRes,
    hcpsRes,
  ] = await Promise.all([
    supabase.from("courses").select("id, name"),
    supabase
      .from("players")
      .select("id, name, role, handicap, gender, is_composite, teams(name, color)")
      .order("name"),
    supabase
      .from("rounds")
      .select("id, round_number, status, courses(id, name)")
      .order("round_number"),
    supabase
      .from("holes")
      .select(
        "id, hole_number, par, stroke_index, course_id, par_ladies, stroke_index_ladies, " +
        "yardage_black, yardage_blue, yardage_white, yardage_red, " +
        "yardage_sandstone, yardage_slate, yardage_granite, yardage_claret"
      )
      .order("hole_number"),
    supabase
      .from("tees")
      .select("id, course_id, name, gender, par, course_rating, slope"),
    supabase
      .from("round_handicaps")
      .select("round_id, player_id, playing_handicap"),
  ])

  const course = (coursesRes.data ?? []).find(c =>
    candidates.some(name => c.name.toLowerCase() === name.toLowerCase())
  )
  if (!course) notFound()

  return (
    <CourseDashboardClient
      courseName={course.name}
      courseId={course.id}
      players={(playersRes.data ?? []) as any}
      rounds={(roundsRes.data ?? []) as any}
      holes={(holesRes.data ?? []) as any}
      tees={(teesRes.data ?? []) as any}
      roundHandicaps={hcpsRes.data ?? []}
    />
  )
}
