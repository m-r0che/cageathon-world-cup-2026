# Ceremony synthesis

## Pick

**Base: Candidate A.** Wins domain model + maintainer path (segment producers, hydrated slides, exhaustive renderer registry). Ties on standalone / honesty / coverage / surface.

## Grafts

| From | Graft | Why |
|------|-------|-----|
| B | Include `recent` (and optionally enough matches) in the snapshot; Spain FINAL score from real match data; omit score if absent | A's snapshot dropped matches; B alone sources Spain 1–0 ARG honestly |
| B | Graceful "omit, don't invent" when FINAL falls out of `recent` | Avoids hardcoding |
| C | `dwellMs` on slides (timing as data) | Auto-advance without parallel switch |
| C | Runtime `assertNever` / default exhaustiveness guard | No-build JS loses A's compile-time registry guarantee |
| C | Explicit `carry` beat (Spain × Knowing → Roman) | Narrative climax the Wrapped arc needs |

## Rejected

- C's cup-champion-from-`progressionPoints` inference (re-derives when `recent` has FINAL)
- B's Brand<> tax and exhaustiveness-free switch-only path
- Ceremony as tab inside main `app.js`
- New `/api/ceremony`
- Client-side scoring

## Ship shape (vanilla, no build)

```
public/ceremony/
  index.html      # OG → og.jpg, hero preload, #stage
  styles.css      # full-bleed mobile Wrapped slides
  ceremony.js     # freeze → build deck → mount player
  hero.jpg
  og.jpg
```

Plus a discreet link on the main app into `/ceremony/`.

## Domain model (locked)

`CeremonyDeck = { championId, slides: Slide[] }` where `Slide` is a discriminated union.
`buildCeremonyDeck(snapshot)` is pure.
Shell holds only `{ index }` and advances via reducer / next-prev / dwell.

Slide kinds (merged):
`cover | bignum | uniqueness | filmReel | playerCard | standings | carry | superlative | champion | outro`
