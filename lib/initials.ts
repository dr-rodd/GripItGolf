/**
 * A member's initial for the profile circle (D319): the first letter of
 * their name, upper case — one letter, so a long name and a short one sit
 * the same. Letters and digits only; anything else gives nothing.
 */
export function initialsOf(name: string | null | undefined): string {
  const first = [...String(name ?? '').trim()].find(c => /[\p{L}\p{N}]/u.test(c))
  return first ? first.toLocaleUpperCase('en-IE') : ''
}
