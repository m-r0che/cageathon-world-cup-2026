# Candidate B design

## Problem

Build a closing ceremony at `/ceremony/` that feels like a mobile-first Wrapped recap without turning the existing app into a second scoring client. The current system has the right facts already: `GET /api/state` returns players, teams, films, draw picks, standings, and recent matches; `standings.rows` is sorted and each row carries `TeamBreakdown` records with match points, progression points, goals, Cage film, Rotten Tomatoes score, multiplier, and scoring highlights. The page should live as static files under `public/ceremony/`, use `hero.jpg` and `og.jpg`, and leave worker routes plus `src/` code alone. The design challenge is keeping a celebratory story UI honest: Roman won, Spain carried the Cup, but the ceremony should read final totals from the state snapshot instead of hardcoding or recomputing them.

## Usage (caller's view)

Quickstart for the ceremony page:

```ts
import {
  buildCeremonyDeck,
  defineCeremonyAssets,
  loadCeremonySnapshot,
  renderCeremony,
} from "./app";

const snapshot = await loadCeremonySnapshot({ endpoint: "/api/state" });
const assets = defineCeremonyAssets({
  heroImage: "/ceremony/hero.jpg",
  ogImage: "/ceremony/og.jpg",
});
const deck = buildCeremonyDeck(snapshot, assets);

renderCeremony({
  host: document.querySelector<HTMLElement>("#ceremony")!,
  deck,
});
```

The load path is deliberately boring. It fetches once, validates the boundary, builds a deck, then hands that deck to the DOM shell. No polling. A viewer who starts the ceremony sees one coherent version of the tournament.

Renderer usage:

```ts
const handle = renderCeremony({ host, deck, initialSlideId: "winner" });

nextButton.addEventListener("click", () => handle.next());
previousButton.addEventListener("click", () => handle.previous());
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") handle.next();
  if (event.key === "ArrowLeft") handle.previous();
});
```

Adding a new slide is one data addition plus one renderer case:

```ts
type CeremonySlide =
  | WinnerHeroSlide
  | PodiumSlide
  | ChampionTeamSlide
  | PlayerWrappedSlide
  | TeamGallerySlide
  | CageFilmSlide
  | CageathonRulesSlide
  | ClosingSlide;

function renderSlide(slide: CeremonySlide): HTMLElement {
  switch (slide.kind) {
    case "winner-hero":
      return renderWinnerHero(slide);
    case "cageathon-rules":
      return renderRules(slide);
  }
}
```

The planned deck order:

1. Winner hero: Roman, champion, using `/ceremony/hero.jpg`.
2. Final podium: all five players in standings order with totals, match points, progression points, and goals.
3. Spain story: ESP, Roman, `Knowing`, `35% RT`, `x0.85`, and the final match if `/api/state.recent` still includes it.
4. One player-wrapped card per player, in standings order, with their best team and signature stat.
5. Team galleries grouped by player so every squad gets a moment.
6. Cage film beat: the strangest multiplier swings, from cursed favorites to boosted minnows.
7. Cageathon rules: snake draft, inverse film pots, match points, progression bonuses, and why this was not normal fantasy football.
8. Closing: Roman again, final date, and a share-friendly end card.

## Shape

Data comes first. `sketch.ts` defines `CeremonyStateSnapshot` as a validated form of `/api/state` where `draw` and `standings` are required. Raw JSON stays `unknown` until `parseCeremonyState` accepts it, per boundary-discipline. Inside the builder, types are trusted.

The ceremony is an ordered `CeremonyDeck`:

```ts
interface CeremonyDeck {
  readonly generatedAt: IsoDateString;
  readonly sourceAsOf: IsoDateString | null;
  readonly assets: CeremonyAssets;
  readonly champion: PlayerResult;
  readonly slides: readonly CeremonySlide[];
}
```

Slides are a discriminated union keyed by `kind`, not a bag of optional fields. A `WinnerHeroSlide` always has a `winner` and `heroImage`. A `PodiumSlide` always has the standings. A `CageFilmSlide` always has film stories. This encodes the ceremony invariants in the type system and keeps future slide additions local, per encode-lessons-in-structure.

The main functions are:

- `loadCeremonySnapshot({ endpoint })`: fetches `/api/state` once with `cache: "no-store"` and calls `parseCeremonyState`.
- `defineCeremonyAssets({ heroImage, ogImage })`: validates static ceremony asset paths before they enter slide data.
- `parseCeremonyState(raw)`: validates the external payload and returns `CeremonyStateSnapshot`.
- `buildCeremonyDeck(snapshot, assets)`: pure story builder. It joins players, standings rows, teams, draw picks, and film data. It never touches DOM and never computes points.
- `selectChampion`, `selectStandings`, `selectTeamStories`, `selectFilmStories`: small selectors so the builder does not repeat map joins.
- `parseScoringHighlight(raw)`: optional parser for the existing `TeamBreakdown.highlight` string format when a slide wants match chips.
- `renderCeremony({ host, deck })`: thin shell for DOM, keyboard, touch, progress, and reduced-motion handling.
- `renderSlide(slide)`: exhaustive dispatch. A missing slide renderer should fail at compile time in the sketch and visibly in JS during implementation.

Module map for implementation:

- `public/ceremony/index.html`: static page at `/ceremony/`, Open Graph tags pointing at `/ceremony/og.jpg`, root container, no app-wide tabs.
- `public/ceremony/styles.css`: mobile-first full-bleed slides, CSS variables for player colors, safe-area spacing, scroll-snap fallback, `prefers-reduced-motion`.
- `public/ceremony/app.js`: no-build implementation of the sketched functions, using JSDoc or close naming from `sketch.ts`.
- `public/ceremony/hero.jpg` and `public/ceremony/og.jpg`: supplied assets.

The deck owns order and story choice. The renderer owns only presentation and navigation. That is the main line I would hold.

## Synthesis decision

TBD by arena

## Tradeoffs accepted

- We accept a separate static page in exchange for not touching worker routing or the existing tabbed app.
- We accept a one-time state snapshot in exchange for a ceremony that does not change while someone is watching.
- We accept client-side boundary validation in exchange for keeping `/api/state` as the only API.
- We accept a small amount of duplicate type naming between the sketch and no-build JS in exchange for keeping the deployed page vanilla.
- We accept that the final-match score depends on `recent` still containing the final. If it is absent, the Spain slide should celebrate ESP from the team story and omit the score rather than invent data.

## Alternatives considered

- Worker-rendered `/ceremony` route. Rejected because static assets already serve the path and the page needs no server-only data.
- A slideshow controlled by tab booleans or `currentSlide === "x"` checks spread through DOM code. Rejected because the ceremony is an ordered data story; a discriminated deck is easier to extend and test.
- Recomputing standings or replaying match scoring in the ceremony client. Rejected because `scoring.ts` already owns the rules and `standings.rows` is the source of truth.
- A fully hardcoded Roman victory page. Rejected because it would drift from live totals and hide the Cageathon mechanics that make the event worth recapping.
- Reusing the main `public/app.js` tab renderer. Rejected because the main app is a live dashboard with 60-second polling, while the ceremony is a frozen recap with different navigation and motion.

## Open questions and risks

- Should the ceremony auto-advance like Wrapped, or stay user-controlled with optional next and previous buttons?
- If the final match falls out of `recent`, do we accept the no-score Spain slide, or should `/api/state` include the final match explicitly before implementation starts?
- Do we want one share URL for the ceremony only, or per-slide share fragments such as `/ceremony/#spain`?
- Should all 48 teams appear in team-gallery slides, or should the first release show each player's top teams with a link back to the main Draw tab for the full squad?
- Are we comfortable saying "Roman won" in copy while still deriving the displayed champion from `standings.rows[0]`?

## Next implementation step

Create `public/ceremony/index.html`, `styles.css`, and `app.js`, then implement `loadCeremonySnapshot`, `parseCeremonyState`, and `buildCeremonyDeck` before writing slide-specific DOM renderers.
