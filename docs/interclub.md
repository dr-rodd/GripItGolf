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
| D358 | **Team captain is a club credential of its own** (Ross, 27 Nov 2026) — a fourth tick on the club's list beside Officer and Clubhouse, given in the Clubhouse. A team captain sets up and runs all of the club's interclub activity: ties, their players, settling. Officers and Clubhouse do not, unless also ticked. |
| D359 | **Home and away are not modelled** (Ross: "unimportant"). A tie is played where its matches are played; the venue is picked when the tie is set up, and a tie split over two clubs is two sessions, each on its own course. Nothing about who is at home changes a score. |
| D360 | **A level tie goes to extra holes**, the player or pair picked from a list of those who played in the tie — sudden death, the winner taking the tie. |
| D361 | **Settle match** — for anything complicated (a concession, a ruling, an abandoned tie, a dispute), a team captain records the result by hand and it stands over the cards, said as settled on the board. The rules are not all modelled; settling is the escape hatch. It also settles a match against a vacant side (D354). |
| D362 | **The Barton Shield counts matches won, with holes up beside** them. |
| D363 | **interclub.stream** (Ross, 27 Nov 2026) — the old match.stream, given its interclub name: a general stream of every tie the member's clubs are in, and a sub-stream a tie (`match:<tie id>`), picked from the title's menu, **live ties first**. Everybody on either club's list follows a tie without asking. In the general stream a **live ticker** shows the club's live ties; a tap pops out their matches (`InterclubLive`), and a match opens to be scored: **who won each hole — or halved — with no scores at all** ("rather than score entry as it's not always clear"), any marked hole amended, Finalise once the holes decide it, or **just the result** (a margin optional). Results go into the tie's stream naming **the clubs, never the players** (D304). |
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

**Stage 2 — a tie as an event** (as agreed 27 Nov 2026, D358–D362; **built with stage 3's settling, playoff and holes beside**, migration 108 — `lib/interclubTie.ts`, `/api/interclub`, `/interclub/tie/<code>`; not yet: the holes beside on the event's own leaderboard, which shows matches only). A
team captain whose club is in a match on the draw taps **Set up this match**
(the club matched to the draw's spelling — `sameClub`, or the name the club
gives itself for the draws). That makes an event which is the Ryder Cup
model already built:

- the two clubs are the event's two **tags**, each in its colour;
- one **Matches** session at the venue chosen (a second session only where
  the tie is split over two clubs, D359), its count and format from the
  competition — five singles for a Senior Cup, four fourballs for a Jimmy
  Bruen, two foursomes for a Barton Shield — changeable;
- the **Overall** adds the points, the two-tag ticker reads "3 to win"; a
  Barton Shield shows holes up beside the matches won (D362);
- a tied match is half a point or played on, by the competition's "finish
  on 18" answer;
- **anyone with the link scores** (`score_session_matches` on, the event's
  short link and QR shared), with no PIN asked of a scorer;
- each club's team captain fills **their own side** — typed or picked from
  the club's list — with each player's interclub index typed in (D355); a
  side nobody fills is vacant and its matches settled to whoever turned up
  (D354);
- **a level tie**: the captain picks the player or pair from those who
  played, and the playoff is a match on extra holes (D360);
- **Settle match**: a team captain's result by hand, over the cards (D361).

Captains' writes go through the server (a route of its own on the service
role), so no row-level security changes; scorers write the match cards as
any member of an event already does. One migration: the credential, the
club's name in the draws, and the table linking a draw match to its event.

**Stage 3 — the club's side** (the team captain's credential, the club's name in the draws and a captain's ties on `/interclub` built with stage 2; **the members app's view built 27 Nov 2026** — an Interclub row at the head of Comps opening `/club/<slug>/interclub`: the club's ties for every member, each opening the match to watch or score, a captain's to the tie's own page, the captain's card and every draw. Still to come: the match stream, D332). A Green Dot club matched to the names in the
draws (a club's own setting, since the draws spell names a dozen ways); its
teams, next tie and results in the members app (D357); the tie's event one
tap away. The match stream (D326, D332) comes alive with the club's ties.

**The stream (built 27 Nov 2026, D363, migration 109).** `session_matches.hole_marks` holds holes marked by hand (`readHoleMarks`, `withHoleMark`, `markIssue` in lib/matchCard.ts): a hole both sides have scores on is decided by its scores; a hole without them takes its mark — on the card, the leaderboard, the ticker and the board alike, since `playSessionCard` reads them. Marks go in order, any marked hole may be amended, and come off from the last hole back. `/api/interclub` `live` (a club's live ties, or one by code), `match.mark` and `match.result`, for anybody on either club's list; a match with its result is a captain's to change. Reading or writing a tie writes its results into its stream (`writeInterclubResults`, idempotent on `interclub:<tie>:<slot>`). The event's own card shows a marked hole as marked; marking from the card itself is still to come — anybody without a club account scores there with scores.

**Stage 4 — results back.** A finished tie's result in the form the
convenor wants it (W/T/L and the match scores), ready to send, and a copy
for the club's handicap secretary.

## Open questions for later stages

- Golf Ireland's branding: the competition names are shown as published,
  with the source credited and "Green Dot is independent of Golf Ireland"
  under every page. No Golf Ireland logo is used (CLAUDE.md, Golf Ireland).
