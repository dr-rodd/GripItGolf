// The team palette — eight colours, one copy, however a team comes to
// exist: the organiser's drag editor, the self-pick join screen, the team
// picker, the tags portal, the field step's tags and a run challenge's
// teams all colour from here. A new team takes the next colour by count (or
// the first one not taken), so sides made in sequence read as distinct
// without anybody choosing. A player picking their own colour picks from it
// too (lib/playerColours.ts).
//
// **New default team colours, D75** (Ross, 11 Nov 2026; docs/refresh-plan.md
// 3.2): muted to sit on cream, told apart by lightness as well as hue, and
// no emerald or gold — emerald is action and live, gold is winning. **Only
// what is offered and assigned from now on**: a team, tag or player's colour
// is stored as its hex, and a stored colour from the old twelve is never
// rewritten — an older event looks exactly as it did. Three pairs sit just
// under `MIN_SIDE_DISTANCE` (cobalt–plum, cobalt–navy, slate–navy) and
// `setApart` shades them apart on a match; `test:branding` holds every pair.

export const PRESET_COLORS = [
  '#C8453A', '#3D6FB6', '#8A5BA8', '#D9731E',
  '#4F6B7A', '#C24D7C', '#6B7A2E', '#22375E',
]

/**
 * What each one is called, for a screen reader — the swatch itself has no
 * words. The old twelve keep their names, because their colours are still
 * stored on older teams and players and still drawn.
 */
export const PRESET_COLOR_NAMES: Record<string, string> = {
  '#C8453A': 'Brick',  '#3D6FB6': 'Cobalt', '#8A5BA8': 'Plum',  '#D9731E': 'Orange',
  '#4F6B7A': 'Slate',  '#C24D7C': 'Rose',   '#6B7A2E': 'Olive', '#22375E': 'Navy',
  '#DC2626': 'Red',    '#2563EB': 'Blue',    '#16A34A': 'Green',   '#9333EA': 'Purple',
  '#EA580C': 'Orange', '#DB2777': 'Pink',    '#0D9488': 'Teal',    '#0A9D56': 'Emerald',
  '#65A30D': 'Lime',   '#7C3AED': 'Violet',  '#0891B2': 'Cyan',    '#B45309': 'Amber',
}
