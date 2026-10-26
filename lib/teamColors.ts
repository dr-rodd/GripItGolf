// The team palette — twelve colours, one copy, however a team comes to
// exist: the organiser's drag editor, the self-pick join screen and the
// tags portal all colour from here. A new team takes the next colour by
// count, so sides made in sequence read as distinct without anybody
// choosing. A player picking their own colour picks from it too
// (lib/playerColours.ts).

export const PRESET_COLORS = [
  '#DC2626', '#2563EB', '#16A34A', '#9333EA',
  '#EA580C', '#DB2777', '#0D9488', '#0A9D56',
  '#65A30D', '#7C3AED', '#0891B2', '#B45309',
]

/** What each one is called, for a screen reader — the swatch itself has no words. */
export const PRESET_COLOR_NAMES: Record<string, string> = {
  '#DC2626': 'Red',    '#2563EB': 'Blue',    '#16A34A': 'Green',   '#9333EA': 'Purple',
  '#EA580C': 'Orange', '#DB2777': 'Pink',    '#0D9488': 'Teal',    '#0A9D56': 'Emerald',
  '#65A30D': 'Lime',   '#7C3AED': 'Violet',  '#0891B2': 'Cyan',    '#B45309': 'Amber',
}
