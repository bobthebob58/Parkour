# Measured movement limits (real physics, planner bot)

All gaps are edge-to-edge (`g`), target platform 5×5, run-up allowed. "with hands" = the bot may
catch the ledge (automatic); "feet only" = ledge catching disabled (NOGRAB=ledge).

| Height difference (dy) | Max gap, feet only | Max gap, with hands |
|---|---|---|
| −4 m | 10.25 | ≥ 10.5 |
| −2 m | 8.5 | ≥ 10.5 |
| −1 m | 8.5 | ≥ 10.5 |
| 0 m | 7.75 | 10.0 |
| +1 m | 6.75 | 9.25 |
| +1.5 m | 6.25 | 9.0 |
| +2 m | 5.0 | 8.75 |
| +2.5 m | 4.25 | 8.25 |
| +3 m | – (impossible) | 7.75 |

→ A "hands-only" catch-jump is any gap between the two columns (e.g. 8.5–9.5 m at the same height,
7.25–8.75 m to +1.5 m, 3–7.5 m to +3 m). For mandatory jumps keep ≥ 0.4 m inside the "with hands" max.

Double jump, feet only: dy −2 / 0 → 14 m, +1 → 13, +2 → 12, +3 → 11.5, +4 → 9, +5 → impossible.
Double jump with hands: dy −2 / 0 → ≥ 16 m, +1 → 15.5, +2 → 15, +3 → 14, +4 → 13.5, +5 → 12.5.
Design double-jump gaps at 10–13 m (≥ 1.5 m margin), double + catch up to 14.5 m.

Bars (hang bars, r 0.06):
- Rungs across the course (ang 90, x −len/2) at the same height: spacing 1.6 – 4.8 m centre to centre all work (leap = Space + W).
- Ladder (bars stacked upward, 0.3 m apart horizontally): up to 1.5 m higher per rung works (hop = Space without direction); 1.8 m fails.
- Bar 2.4 m above the take-off platform, starting 1.2 m out: reachable with a running jump.
- Leaping from a bar to a platform at the same level: gaps 3–7 m (from the bar) work.
- Monkey bar along the course (ang 0): hand over hand at 2.2 m/s; ≤ 9 m without chalk/gloves.

Vents (updraft grate, w 3): reach a platform up to `lift + 1` m higher (lift 5 → +6, 9 → +10, 13 → +14), gap 3.
Bounce pads: pow 14 → +6 m / 6 m out; pow 18 → +8 m / 9 m; pow 22–26 → +10 m / 12 m.
Ziplines: the end must be ≈ 2.2 m above the landing top, over or just before the landing.
Rope: range 32 m (45 m with long rope); swings of 15–30 m between anchors work (see testbaner/mech.json).
