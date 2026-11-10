/**
 * The open card a scoring screen resumes: one `live_rounds` row with the
 * round and course it is on. Its own file since the legacy `/scoring` screen
 * that used to declare it (ScoringClient) was deleted — the live card and the
 * round dashboard are what read it now.
 */
export interface ActiveLiveRound {
  id: string; course_id: string; round_id: string; activated_by: string | null
  rounds: { round_number: number } | null
  courses: { name: string } | null
}
