# Ceremony cross-judge (Phase C)

Read-only cross-judge of candidates A (opus), B, C against the 6-criterion rubric.
Grounding + live `/api/state` (worker.ts:267-302) + `scoring.ts` were checked to judge
data honesty against ground truth, not each candidate's self-description.

## Ground-truth facts used to judge

- `/api/state` ships `draw, standings, today, live, upcoming, recent, last_updated, tournament_start`.
  `recent` = last 5 **FINISHED** matches reversed → the **FINAL (Spain 1-0 Argentina, 2026-07-19)
  is present as `recent[0]`** for a finished tournament.
- There is **no exposed "World Cup champion team" field**. `scoring.ts` derives `winnerCode` from the
  FINAL match and folds `+PROGRESSION.WINNER` into that team's `progressionPoints`; only the final
  numbers are exposed (scoring.ts:206-231).
- Winner is `standings.rows[0]` (sorted desc, tiebreak goals) — Roman/p3. No client scoring needed.

## 1. Criterion-by-criterion scores

| # | Criterion | A | B | C |
|---|-----------|---|---|---|
| 1 | Standalone page under `public/ceremony/`, no worker route | 5 | 5 | 5 |
| 2 | Ordered typed discriminated deck; pure builder from state | 5 | 4 | 5 |
| 3 | Data honesty: `/api/state` only, no client scoring, snapshot once | 5 | 5 | 4 |
| 4 | Content coverage (winner/standings/teams/films/players/uniqueness, Wrapped feel) | 5 | 5 | 5 |
| 5 | Small surface (laziness): thin shell, no new API/KV | 4 | 4 | 5 |
| 6 | Maintainer path: add a slide kind without rewriting the renderer | 5 | 3 | 4 |
| | **Total** | **29** | **26** | **28** |

### Notes per criterion

**1 — Standalone page.** All three correctly target static `public/ceremony/` served by the asset
binding before SPA fallback; none add a worker route. Tie at 5. A is most explicit that binding wins
over SPA fallback; immaterial to the score.

**2 — Domain model.**
- **A (5):** 9-variant union tagged by `kind`, `SlideBase`, pure `buildCeremonyDeck` composed of
  per-chapter segment producers, `computeContext` builds every index once. Slides are *fully-resolved
  view-model atoms* (`TeamLine`, `RankedPlayer`) — renderers never hold a code/id. Cleanest boundary.
- **C (5):** 9-variant union with `dwellMs` (timing-as-data, not a parallel switch), beat-sheet fold
  over `BuildContext`, hydrated `PlayerFace`/`TeamFace` payloads. Equally principled.
- **B (4):** 8-variant union + pure builder + selectors — solid, but slides carry *nested* resolved
  objects (`slide.winner.standing.total`, `TeamStory.breakdown`) rather than flat atoms, so renderers
  navigate object graphs instead of reading ready fields. A notch below A/C on boundary discipline.

**3 — Data honesty.**
- **B (5):** fetch once `no-store`, `parseCeremonyState`, never computes points, champion from
  `standings.rows[0]`, and — uniquely — reads the **real FINAL from `recent`** with an explicit graceful
  fallback (omit score, don't invent) if it has aged out. This is the honest source for "Spain won."
- **A (5):** snapshot once, frozen, no poll, no client scoring, reads `standings`/`TeamBreakdown` as-is,
  mines `highlight[]` via a boundary parser. Never fabricates. (Caveat under criterion 4: its snapshot
  omits `recent`, so it cannot *show* the real final — a coverage gap, not a dishonesty.)
- **C (4):** honest on scoring, but derives the cup-champion **team** from "max `progressionPoints`
  path including winner bonus" (DESIGN tradeoff #4) — an indirect **re-derivation of `winnerCode`
  client-side** when the FINAL match is sitting in `recent`. It uses server numbers, so it's not full
  recompute, but it reconstructs a server-owned conclusion and can misattribute on ties. C even flags
  this as an open risk and picks the indirect path anyway. Dinged one point.

**4 — Content coverage.** All three cover winner hero, standings, all teams, Cage films, all five
players, and the uniqueness gimmick with a mobile full-bleed Wrapped structure — all 5.
- A is richest on **awards** (superlatives mined from `TeamBreakdown.highlight[]`) but, because its
  `CeremonySnapshot` drops matches, it **cannot render the real Spain 1-0 result** — it folds ESP into a
  generic `teamAward` with no score. Breadth compensates; net 5, with the final-score gap noted.
- B has the most literal coverage of the grounding facts (real final score in the Spain slide,
  per-player galleries so every squad gets a moment, an explicit `cageathon-rules` uniqueness slide).
- C has the strongest *dedicated* uniqueness + `carry` beats and `dwellMs` for auto-advance pacing.

**5 — Small surface (Laziness Protocol).** None add API/KV/routes — the important part. Differentiator
is incidental machinery:
- **C (5):** leanest control model — one cursor + abort flag, beat sheet, `dwellMs` as data. Fewest moving parts.
- **A (4):** most *concepts* (3 pure cores + `h()` hyperscript + pure nav reducer + mapped-type registry
  + resolved atoms). Justified, not slop — but the largest reader surface.
- **B (4):** middle, but pays a `Brand<>` tax on 5 aliases (`PlayerId`, `TeamCode`, `HexColor`, …) that
  buys little on a no-build one-shot page and adds reader load.

**6 — Maintainer path (add a slide kind without rewriting the renderer).**
- **A (5):** `SlideRegistry = { [K in Slide["kind"]]: SlideRenderer<…> }` is a mapped type — a new union
  member is a **compile error until its renderer exists**. No central `switch` to drift. Content additions
  are one edit to a segment producer. Strongest guarantee; in shipped JS the registry is just an object literal (no cost).
- **C (4):** `switch` in `paintSlide` **plus an explicit `assertNever` exhaustiveness helper** — enforced,
  and beat producers make content additions trivial. One notch below A only because it's a central switch
  rather than a per-kind map.
- **B (3):** plain `switch (slide.kind)` with **no `assertNever`/exhaustiveness guard**. DESIGN claims it
  "should fail at compile time," but a bare switch silently falls through when a kind is added. Weakest.

## 2. Recommended base: **Candidate A (opus)**

A wins the two criteria the rubric weights hardest for longevity — domain model (2) and maintainer path
(6) — while tying the rest, and it has the **cleanest boundary**: slides are flat, fully-resolved
view-model atoms, so renderers are pure `(slide) => HTMLElement` projections with zero snapshot access.
That property is what makes every renderer independently testable and is exactly what B (nested object
graphs) and, to a lesser degree, C don't fully commit to.

On Laziness: A carries the largest reader surface, so this isn't a free win. But its "extra" surface is
principled, not gratuitous, and mostly *types*, not runtime:
- the mapped-type registry compiles down to a plain object literal in the shipped no-build JS (zero runtime cost) and is the single best mechanism for criterion 6;
- the pure nav reducer is ~a dozen lines and makes navigation testable and idempotent at the bounds;
- `h()` eliminates the exact `innerHTML` escaping footgun that already exists in `app.js` (`rtLink`).

C is the close runner-up (28) and genuinely leaner; if the team wants to optimize purely for smallest
surface it's defensible. But the Laziness tie-break only applies *when tied*, and A leads on the
architecture-quality criteria — so it isn't a tie. Take A, then graft C's leanness wins into it.

## 3. Grafts worth taking from the losers

- **From C — `dwellMs` on `SlideBase` (`sketch.ts`, `SlideBase.dwellMs`).** Timing-as-data enables a
  Wrapped-style auto-advance without a parallel timing switch. Add it to A's `SlideBase` so the shell's
  reducer can advance on a dwell timer *as well as* tap/swipe/keys.
- **From C — `assertNever` runtime guard (`sketch.ts`, `assertNever`).** Critical for A specifically:
  A ships as vanilla JS with **no build step**, so the mapped-type registry's compile-time exhaustiveness
  *evaporates at ship*. Wrap A's `renderSlide` dispatch with a `default`/fallthrough that calls
  `assertNever(slide)` (or throws on unknown `kind`) so a missing renderer fails **loudly at runtime**,
  not silently. This closes A's one gap on criterion 6 in the shipped artifact.
- **From C — the explicit `carry` beat (`sketch.ts`, `CarrySlide`) framing Spain × Knowing → Roman.**
  Promote A's generic `teamAward` handling of ESP into a first-class "the Cup carry" moment; it's the
  emotional link the grounding calls out and reads better as its own slide than as one superlative.
- **From B — read the real FINAL from `recent` (`DESIGN.md` Spain slide + tradeoff #6).** A's
  `CeremonySnapshot` must be widened to include `recent` (or just the FINAL match) so the ceremony can
  show **Spain 1-0 Argentina** honestly, with B's graceful "omit the score, don't invent" fallback if the
  final has aged out of `recent`. This fixes A's only real content gap (criterion 4).
- **From B — `defineCeremonyAssets` (`sketch.ts`).** Validate `hero.jpg`/`og.jpg` paths at the boundary
  alongside `toSnapshot`, rather than sprinkling literal asset paths into slides. Small, tidy, on-brand
  with A's boundary discipline.

## 4. What to reject from the losers, and why

- **Reject C's cup-champion-from-`progressionPoints` derivation** (`DESIGN.md` tradeoff #4;
  `BuildContext.cupChampion` in `sketch.ts`). It re-derives a server-owned conclusion (`winnerCode`)
  client-side when the FINAL match is available in `recent`. Use B's approach: read the FINAL from
  `recent`. Deriving "who won the Cup" from points is indirect and can misattribute.
- **Reject B's exhaustiveness-free `switch renderSlide`** (`sketch.ts`, `renderSlide`; `DESIGN.md`
  usage). A bare `switch (slide.kind)` drifts silently when a kind is added. Keep A's mapped-type
  registry, hardened with C's `assertNever` for the no-build runtime.
- **Reject B's pervasive `Brand<>` aliases** (`sketch.ts`, `PlayerId`/`TeamCode`/`HexColor`/`AssetPath`/
  `IsoDateString`). Branding every primitive is surface/reader-load tax for a one-shot vanilla page and
  buys little once `toSnapshot` has validated the boundary. A's plain resolved atoms are sufficient.
- **Reject C's dwell-auto-advance as the *only* control model** (`DESIGN.md` open question; `playEpisode`
  advancing on a dwell timer). Auto-advance-only harms control/accessibility. Keep A's user-driven pure
  reducer (tap-zones/swipe/keys) as the primary nav and treat `dwellMs` as an *optional* enhancement.
- **Reject A's own latent temptation to hardcode/omit the final.** A's snapshot currently drops matches;
  do not paper over that by hardcoding "Spain 1-0" or inferring it — take the `recent` graft instead so
  the fact is data-sourced and degrades gracefully.
