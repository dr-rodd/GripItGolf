# Interclub

Ross, 27 November 2026. Golf Ireland's inter-club competitions — the Barton
Shield, the Senior and Junior Cups, the Jimmy Bruen, the Pierce Purcell and
the rest — on Green Dot. Partly as a feature, partly as something to show
Golf Ireland: a club's interclub matches scored live by anybody with a
link, against the official draw, on a platform that already does it.

The 2026 Connacht team captains' briefing (Golf Ireland, 1 May 2026) is the
source for the rules below; the General Regulations are in Golf Ireland's
Competitions Handbook.

## Decisions

| | Decision |
|---|---|
| D352 | **The national draws are public**, at `/interclub` — every competition, province by province, its draw read off Golf Ireland's Golf Genius hub and redrawn as Green Dot's bracket. No account, no code. |
| D353 | **Each club fills in its own side of a tie.** Any member of that club adds players — typed in, or picked from the club's list. |
| D354 | **A side nobody fills in can still be beaten**: the match is scored against a vacant opposition and the club that turned up goes through. |
| D355 | **Handicaps are typed in and changeable**: the interclub eligibility index is a box, not a lookup. Green Dot cannot read Golf Ireland's handicap records. |
| D356 | **A tie is an event with a public link and a QR code**, the same as any Green Dot event, so anybody — spectators included — can open it and score. Usually it is spectators who keep a tie's scores up to date, so scoring must be easy for whoever holds the link. Good advertising: the people watching see what the platform does. |
| D357 | **A club sees interclub from its own side** in the members app — its teams, its next tie, its results — and taps through to the tie as an event. |

## What Golf Genius holds

Found November 2026, by reading the hub (`www.golfgenius.com/pages/12071759943296907291`):

- **A tab a province** (Connacht, Leinster, Munster, Ulster), each a
  dropdown of competitions; each competition is **its own small Golf Genius
  site**. 156 competitions in 2026.
- **A draw is a spreadsheet pasted in as an HTML table**, never data. The
  bracket is in the layout — a row a first-round place, a column a round,
  each later round's cell spanning 2, 4, 8… rows — and every cell is typed
  by hand: "Ballinrobe (H) 3.5", "Team 12 BYE", "Laytown Bettystown .(A )4
  H", "Rockmount [H] - 6", "Kilcock 2 (19th", "Castletroy W", "Rosapenna
  (Disq". `lib/interclub.ts` reads all of those and is tested on saved
  copies of the real pages.
- **Clubs only — no players.** A club's line-up for a tie is not published
  (bar one or two final match sheets). Players have to come from the clubs.
- **Each draw names its convenor with an email and phone number.** Green
  Dot never copies them; the test fixtures have them blanked.
- Of the 156 in November 2026: **109 read as a bracket**, 20 have no draw
  page (a stroke-play stage first), 9 are pictures, and 18 are pages that
  are not knockout draws at all (a qualifying day's tee times, a final's
  match sheet). Everything not read says so and links to the original.

## The rules, from the briefing

What a tie needs to know, per competition (the briefing's "Competition
Formats" tables):

- **Team size**: Senior Cup 5, Junior Cup 5, Barton Shield 4 (two pairs),
  Jimmy Bruen 8 (four fourball pairs), Pierce Purcell 8, foursomes
  competitions 6 or 8, Girls 3…
- **Format**: singles, foursomes or fourball match play; Barton Shield
  counts holes up rather than matches.
- **Do all matches finish on 18?** Yes for most team competitions of pairs
  (all square after 18 is a half); No for the Senior and Junior Cups (play
  on until there is a winner).
- **A tied tie**: each captain has 15 minutes to name the player or pair
  for a sudden-death playoff at the home venue; a pair must have played
  together in the match. Some competitions nominate the playoff pair on the
  team sheet.
- **Handicap allowances (2026)**: four-ball match play — low player to
  scratch, each other 75% of the difference in course handicaps; foursomes
  50% of the combined difference; singles the full difference. Strokes off
  the **Inter-Club Eligibility Handicap Index**, not the current index.
- **Eligibility**: 20 scores on record by 31 December, 4 singles
  competition scores in the year, a pair's combined index within a band
  (19.0–46.0 in the women's four-ball). Checked by the club's handicap
  secretary in Golf Ireland's Clubhouse; Green Dot only records that it was.
- **Home and away**: in round 1 the top team is at home, thereafter the
  convenor decides (Reg. 4.5). Many ties are split — some matches at each
  club — with a team sheet per venue.
- **Results** reported to the convenor within 24 hours; official 48 hours
  after the match (Reg. 8.5a).

## Stages

**Stage 1 — the national draws (built).** `/interclub` lists the
competitions a province at a time, searchable; `/interclub/<province>/<competition>`
draws its bracket with the knockout's own `MatchplayBracket` in a read-only
mode (`readOnly`, each side's score as written, an H for home), each round's
play-by date and notes under it. Read through Next's fetch cache and the
pages regenerated every 15 minutes (`app/interclub/source.ts`). Nothing
stored, no migration.

**Stage 2 — a tie as an event.** "Set up this tie" from a match in the
draw makes an event that is the Ryder Cup model already built:

- the two clubs are the event's two **tags**, each in its colour;
- the home and away venues are two **sessions** (or one, unsplit), each on
  its club's home course (`clubs.home_course_id`);
- each match is a **Matches** slot (`session_matches`), its count from the
  competition's team size, its format from the competition;
- the **Overall** adds the points up and the two-tag ticker reads "3 to
  win";
- a tied match is half a point (`matchTie: 'half'`) or played on (`'extra'`)
  by the competition's "finish on 18" answer;
- **anyone with the link scores** (`score_session_matches` on, no PIN asked
  of a scorer), and the event carries its QR code and short link.

New in stage 2: the link from a draw match to its event (a migration — one
row a tie, the draw's competition and position); each club's members adding
their side's players (D353, the field's own `add_players` door narrowed to
a tag); the **vacant side** (D354 — a match with nobody on one side is
scored against nobody and won by the side that played); a player's
**interclub index**, typed and changeable (D355); and the **playoff** when
the overall is level (a nominated pair, sudden death, at the home venue).

**Stage 3 — the club's side.** A Green Dot club matched to the names in the
draws (a club's own setting, since the draws spell names a dozen ways); its
teams, next tie and results in the members app (D357); the tie's event one
tap away. The match stream (D326, D332) comes alive with the club's ties.

**Stage 4 — results back.** A finished tie's result in the form the
convenor wants it (W/T/L and the match scores), ready to send, and a copy
for the club's handicap secretary.

## Open questions for later stages

- Who may set up a tie's event — any member of either club, or the club's
  Officers?
- A split tie's playoff is at the home venue with a pair from the home team
  sheet: is it a third session, or a match added to the home session?
- Does the Barton Shield's holes-up count need its own board, or is it the
  Overall counting holes rather than points?
- Golf Ireland's branding: the competition names are shown as published,
  with the source credited and "Green Dot is independent of Golf Ireland"
  under every page. No Golf Ireland logo is used (CLAUDE.md, Golf Ireland).
