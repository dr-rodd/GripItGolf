// Which tee names already have a colour (Ross, 11 Nov 2026).
//
// The scorecard styles (`TEE_DOT` in app/components/scorecardStyle.ts) draw
// these names' dots without any help, so the card check never asks the photo
// for a colour for one of them: it is asked only where the name does not
// say — Granite-and-Sandstone-style names the list does not know, or an
// unusual colour. `test:card-check` holds this list to `TEE_DOT`'s keys, so
// a name added to one cannot be missed by the other.

export const KNOWN_TEE_NAMES: readonly string[] = [
  'Black', 'Blue', 'White', 'Red', 'Yellow', 'Sandstone', 'Slate', 'Granite', 'Claret',
]

/** Whether this tee's name already says its colour. */
export function teeNameHasColour(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase()
  return KNOWN_TEE_NAMES.some(k => k.toLowerCase() === n)
}
