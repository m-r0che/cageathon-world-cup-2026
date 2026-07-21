# Ceremony grounding (architect Phase A)

## Question answered by `how`

How the frontend and `/api/state` work, and where `/ceremony` plugs in.

## Verdict

- **Standalone page** at `public/ceremony/index.html` (+ own CSS/JS). Asset binding serves it at `/ceremony/` before SPA fallback.
- **No new API required.** Consume existing `GET /api/state`.
- Do not recompute scoring client-side. Use `standings.rows` / `TeamBreakdown` as-is.
- Snapshot state at ceremony start (60s poll on main app must not mutate mid-slideshow).

## Live facts (production, 2026-07-21)

- Winner: **Roman** (p3) — 293.57 pts
- Runner-up: Matt 225.26 · Jack 179.42 · Tom 146.25 · Ed 145.60
- World Cup champion (football-data): **Spain** beat Argentina 1–0 (2026-07-19 FINAL)
- Roman owns ESP (film: Knowing, ×0.85) — his Spain run carried the Cup

## Placement constraints

- Vanilla HTML/CSS/JS, no build step
- Mobile-first, Spotify Wrapped–style full-bleed slides
- Hero + OG use provided celebration image (`public/ceremony/hero.jpg`, `og.jpg`)
- Highlight: teams, players, Cage films, Cageathon uniqueness

## Existing patterns to reuse

- Fat `/api/state` payload
- Draw animation phase sequencing (`playDrawAnimation` + `sleep`) as phase template
- Player colors / avatars from `players[]`
