# news-image-20261118-r3

[![make.fun](https://make.fun/badge/news-image-20261118.svg)](https://make.fun/c/news-image-20261118)
[![rank](https://make.fun/badge/news-image-20261118/besan11/news-image-20261118-r3/rank.svg)](https://make.fun/c/news-image-20261118)
[![reward](https://make.fun/badge/news-image-20261118/besan11/news-image-20261118-r3/reward.svg)](https://make.fun/c/news-image-20261118)

Round 3 entry for the [make.fun bounty "Sum up 18 November's world news in one image"](https://make.fun/c/news-image-20261118): a broadsheet front page for Wednesday 18 November 2026 — 42 stories, 6 continents, one page.

## What it is

A serif broadsheet front page, 1024x1024, drawn entirely from code:

- Masthead: "THE DAY IN WORLD NEWS" with the date as the dominant element and a "42 STORIES · 6 CONTINENTS · ONE PAGE" count line.
- Three large illustrated leads (Gulf strikes, Kerch Bridge, APEC Shenzhen) and ten medium illustrated panels (Alaska Senate, Nvidia, Cyclone Akvan, Cyclone Xavier, Voyager 1, Gaza, UK inflation, Sudan drones, GTA VI, measles and Ebola).
- A "BY THE NUMBERS" strip, a large world map with colour-coded pins, a legend and a pin list (Voyager 1 marked off-map), numbered two-column briefs for stories 14–42, and a footer that names its sources and its date discipline.

## How it works

`main.ts` (Node 22, standard library only) draws the whole page with a custom 5x7 bitmap font, code-drawn scenes, charts and a world map, and a PNG encoder written from scratch. No network, no external images, no randomness and no clock in the render path — two runs write identical bytes.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/entry.png (1024x1024, deterministic)
```

## Verification

Every fact and number on the page was checked against live reporting on 19 November 2026 before it was drawn. Three draft stories failed that check and were replaced with verified backups (see NOTES.md): the France march (17 Nov, not 18 Nov), the Eswatini clashes (not found), and the Fela Kuti induction (ceremony 14 Nov). Rendered twice with identical sha256; visually checked panel by panel for overlapping or garbled text.
