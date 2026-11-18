# NOTES — news-image-20261118-r3 (round 3, rebuilt from zero)

## Verification (19 Nov 2026, live search before drawing)

All 13 features and all 29 briefs were checked against live reporting.
Corrections applied inside kept stories:

- Gulf strikes: dropped the MQ-9 shootdown claim (dates to 3 Nov, not 18 Nov).
- Kerch Bridge: dropped "Moscow says it downed 1,441 drones" (not verified).
- Alaska: dropped "largest majority since 2009" (not verified).
- Gaza: headline reworded — the baby who died of cold was 13 Nov, not 18 Nov;
  the panel now leads with the Board of Peace warning.
- US tech outages: counted at 7, not "at least 8" (the 8th was unconfirmed).
- UK/Australia sanctions: worded as firms + parties, not "7 firms".
- Markets: Brent $92.66 (not $92.47).

## Replacements (draft story failed verification -> verified backup)

| # | Draft story | Why dropped | Replacement (verified) |
|---|---|---|---|
| 17 | France march | Marched and reported Tue 17 Nov, not 18 Nov | Earthshot Prize winners in Mumbai (Bhutan, Mahindra, Niue, PFAS-Free France, Ørsted; £1m each; announced 17 Nov, reported 18 Nov) |
| 29 | Clashes near Eswatini border | No such clashes found | Ethiopia–Eritrea fighting at Badme (Reuters 18 Nov: forces amass, war fears; drone strikes, shelling, civilians flee) |
| 38 | Fela Kuti Rock Hall induction | Ceremony was Sat 14 Nov, not 18 Nov | Bezos says he helped pick Pattinson as Bond (Reuters/BBC 18 Nov; Pattinson unveiled as seventh 007 on 16 Nov) |

Final count: 42 stories (13 features + 29 briefs), all 18 Nov 2026 news
(happened or first reported that day).

## Determinism

- `MAKEFUN_OUTPUT_DIR=out node main.ts` and a second run to `out2`:
  both sha256 `b1cd13cc7b3e2b0fa233efcc0c4b3b52f62daeb4731873001ff1e43978d0c46a`
- Size 44,596 bytes (< 1 MiB), 1024x1024, valid PNG signature.

## Visual check (19 Nov 2026)

Read the rendered PNG at full size and in cropped sections. Fixed after
the first render: three medium decks wrapped to 3 lines and spilled into
the next section (shortened to 2 lines); two tags overflowed their panels
(shortened); the gold Voyager label crossed the top of the map (removed
from the map; the off-map note moved to the pin list); Europe and Africa
merged into one landmass (Mediterranean gap opened in the polygons).
Final render: no overlapping or garbled text; masthead, leads, panels,
numbers strip, map + legend + pin list, briefs and footer all legible.

## 11-component self-check vs round 2 (Pren's rule, 19 Nov 00:12 WIB)

Every component rebuilt from zero and better than its round-2 counterpart:
masthead (serif + kicker + dominant date), 3 illustrated leads (was 1),
10 medium illustrated panels (was 4), large colour-coded map + legend +
pin list + Voyager off-map (was a small band, 8 red pins, no legend),
numbered 2-column briefs (was a dense 4-column grid), BY THE NUMBERS
strip with 4 big numbers while markets data stays in brief #23 (was a
one-line ticker), in-brief items promoted to numbered briefs 39–42
(was a dense 10-item strip), footer with explicit date discipline +
named sources (was sourceless), 42 stories (was 36), 13 illustrated
stories (was 5), explicit date discipline (was implicit).
