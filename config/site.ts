export const SITE = {
  /**
   * The enterprise is Green Dot Live now: live scoring and leaderboards for
   * any event, with golf as the first sport. The wordmark and the rest of
   * the visual identity are unchanged until the new logo arrives.
   */
  name: "Green Dot Live",
  /**
   * Your handicap is the best 8 of your last 20 rounds. On the graph those
   * eight show as green dots — so a green dot is a round that counted, and
   * that is what every golfer is chasing when they tee off.
   */
  tagline: "Your handicap is the best 8 of your last 20. Go and get a green dot.",

  /** Carried over from the Donegal Masters pages, which still read it. */
  competitionName: "4th Donegal Masters",

  /**
   * Where people write for help, and to ask about or delete their data —
   * the one copy, printed by the privacy page, the terms and the run
   * screens. Strava's API Policy (§2.4) asks for an easily found support
   * contact; a greendot.live address, so it outlives any one person's inbox.
   */
  supportEmail: "support@greendot.live",

  /**
   * Who runs Green Dot Live, as the privacy notice must name them (GDPR
   * Art. 13: the controller's identity and contact details) — a legal name
   * and a postal address. Unset, the notice names the service and the
   * support address alone, which is the gap to close before Strava's review.
   */
  controller: null as string | null,
}
