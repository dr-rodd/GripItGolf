# The page-title marks, re-inked for dark mode.
#
# "leaderboard." / "settings." / "scoring." / "stats hub." / "trip." are
# supplied artwork: brown lettering (#4A3728) closed by the emerald dot
# (#0A9D56), keyed to alpha. On the dark page the brown reads at 1.8:1, and
# a CSS filter cannot lift it without dragging the dot through colours that
# are not the brand's — so each file gets a pre-rendered twin with the
# lettering set in the dark palette's bark (#D9C6B2) and the dot left alone.
#
# Per pixel: the two inks are cleanly separable by which of red or green
# leads (brown is red-led, emerald green-led), so lettering pixels take the
# bark RGB and keep their alpha — the anti-aliasing is in the alpha channel,
# so edges stay smooth.
#
# Run from the repo root after replacing any title artwork:
#   python3 scripts/make-dark-titles.py
#
# Committed like scripts/make-line-logo.ts: the outputs are checked in, the
# generator exists so a replaced original can bring its twin with it.

from PIL import Image

MARKS = ["leaderboard", "settings", "scoring", "stats-hub", "trip"]
BARK_DARK = (217, 198, 178)  # --gd-bark under html.dark

for name in MARKS:
    src = f"public/title-{name}.png"
    out = f"public/title-{name}-dark.png"
    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            # Emerald is green-led (10, 157, 86); brown is red-led (74, 55, 40).
            if g > r:
                continue
            px[x, y] = (*BARK_DARK, a)
    img.save(out)
    print(f"{out}: {w}x{h}")
