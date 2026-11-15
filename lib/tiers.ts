// What a Green Dot member may use — the only copy (D117, amended; Ross,
// 14 Nov 2026). **Pro comes from being on a verified club's list, or later
// from an entitlement bought by one person.** One function answers it.
//
// **Today every feature is everybody's**: each entry in the registry says
// `everyone`, so `mayUseFeature` answers yes whatever it is handed. Moving
// a feature to `pro` is one line here and nothing else. Nothing is sold.
//
// **Never asked on the way to joining, playing, scoring or watching** (D94):
// those are not features, and `test:clubs` fails a trip, scoring, join,
// entry or run file that imports this.

export type Tier = 'everyone' | 'pro'

export const FEATURES = {
  stats_history: { label: 'Your stats across every event', tier: 'everyone' },
  club_season: { label: 'A club’s season standings', tier: 'everyone' },
} as const satisfies Record<string, { label: string; tier: Tier }>

export type Feature = keyof typeof FEATURES

/** What is known of the person asking: never stored, asked afresh. */
export interface TierFacts {
  /** On a verified club's list, linked, not removed. */
  clubMember: boolean
  /** An entitlement bought by this person — none exist yet. */
  entitled: boolean
}

export function mayUseFeature(feature: Feature, facts: TierFacts): boolean {
  const tier: Tier = FEATURES[feature].tier
  if (tier === 'everyone') return true
  return facts.clubMember || facts.entitled
}
