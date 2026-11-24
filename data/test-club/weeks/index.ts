// The week files, registered (D312). A file is read through here rather than
// from the folder at run time, so it is in the build the site is deployed
// from — Claude Code adds one line here with each week file it writes, and
// test:test-club fails a file in this folder that is not listed.
//
// Each key is the file's name without .json: the Monday the week starts on.

import w20261123 from './2026-11-23.json'

export const WEEKS: Record<string, unknown> = {
  '2026-11-23': w20261123,
}
