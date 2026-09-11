# Cageathon World Cup 2026

Nicolas Cage-themed World Cup 2026 sweepstake — 5 players, 48 teams, snake draft across 4 quality pots, live scoring, racing leaderboard.

Runs entirely on Cloudflare: Worker + Static Assets + KV + Cron Trigger. No third-party hosting.

## Stack

- **Cloudflare Worker** (`src/worker.ts`) — API + static assets + cron
- **KV namespace `WC`** — draw, players, matches cache, last_updated
- **Cron trigger** every 15 min → pulls football-data.org
- **Vanilla HTML/CSS/JS** frontend in `public/` — no build step, mobile-first

## Bootstrap (production)

Run `npm install`.

```bash
npm install
```

Copy `wrangler.local.toml.example` to `wrangler.local.toml`.

```bash
cp wrangler.local.toml.example wrangler.local.toml
```

### Bind existing production

If you only deploy by pushing to `main`, skip `wrangler.local.toml`.
Workers Builds inherits the live `WC` binding.

If you deploy from a laptop, run `wrangler kv namespace list`.
Put the current `WC` namespace id into `wrangler.local.toml`.
If you have a preview id, put that preview id into `wrangler.local.toml` as well.
Do not create a new namespace.
A new namespace orphans live draw and matches data.

### Bind a new Cloudflare account

Run `wrangler kv namespace create WC`.
Then run `wrangler kv namespace create WC --preview`.
Paste the printed ids into `wrangler.local.toml`.

### Put secrets

```bash
wrangler secret put FOOTBALL_DATA_API_KEY      # free key from football-data.org
wrangler secret put ADMIN_TOKEN                # any long random string
```

### Deploy the worker

Push to `main` deploys through Cloudflare Workers Builds.
That job runs `npx wrangler deploy` against the committed `wrangler.toml`.
The public file names `binding = "WC"` and does not include a namespace id.
Wrangler then inherits the `WC` binding already on the live Worker.
Do not create a new namespace for that Worker.

To deploy from your laptop, pin the ids and pass the local file.

```bash
npx wrangler deploy -c wrangler.local.toml
```

`npx wrangler dev` can use the committed `wrangler.toml`.
Local KV does not need remote ids.

Lock in the draw.
The draw write is idempotent.
Pass `?force=1` to overwrite it.

```bash
curl -X POST https://cageathon-world-cup-2026.<acct>.workers.dev/api/draw \
  -H "authorization: Bearer $ADMIN_TOKEN"
```

Pull live match data.

```bash
curl -X POST https://cageathon-world-cup-2026.<acct>.workers.dev/api/refresh \
  -H "authorization: Bearer $ADMIN_TOKEN"
```

### Local dev

```bash
echo 'ADMIN_TOKEN=local-dev-token' > .dev.vars
echo 'FOOTBALL_DATA_API_KEY=<optional-key>' >> .dev.vars     # omit if testing offline
npx wrangler dev
# open http://localhost:8787 and POST /api/draw with Bearer local-dev-token
```

### Verify everything is wired

After the first `/api/refresh`, GET `/api/diagnostics` (admin) to confirm
football-data's team codes all map to our 48 teams. Any TLAs listed in
`unmappedTlas` need to be added to `TLA_OVERRIDES` in `src/lib/football-data.ts`.

### Record the draw video (for WhatsApp etc.)

```bash
npm run record:draw
```

Spawns wrangler if it's not already running, drives a headless Chromium via
Playwright at 1280×720 with `?record=1` (which auto-opens The Draw tab and
hides the daily strip + Cage scatter for a clean frame), then transcodes the
captured webm to mp4 via ffmpeg. Output: `recordings/draw.mp4` (~1.2 MB, ~19s).

## Configure the roster

Edit `DEFAULT_PLAYERS` in `src/worker.ts` (names, colours) and drop avatars in `public/players/` as `p1.png` … `p5.png`. Or set them at runtime:

```bash
curl -X PUT https://cageathon-world-cup-2026.<acct>.workers.dev/api/players \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '[
    {"id":"p1","name":"Matt",  "avatar":"/players/p1.png","color":"#ff5e3a"},
    {"id":"p2","name":"Alice", "avatar":"/players/p2.png","color":"#ffcc00"},
    {"id":"p3","name":"Bob",   "avatar":"/players/p3.png","color":"#34c759"},
    {"id":"p4","name":"Cara",  "avatar":"/players/p4.png","color":"#5ac8fa"},
    {"id":"p5","name":"Dave",  "avatar":"/players/p5.png","color":"#af52de"}
  ]'
```

## Run the draw

The draw is deterministic — same `DRAW_SEED` (in `wrangler.toml`) + same player list = same teams. Lock it in **before** the tournament starts:

```bash
curl -X POST https://cageathon-world-cup-2026.<acct>.workers.dev/api/draw \
  -H "authorization: Bearer $ADMIN_TOKEN"
```

The result is written to KV under `draw` and never overwritten unless you pass `?force=1`.

## Local dev

```bash
npx wrangler dev
# open http://localhost:8787
```

`wrangler dev` uses local KV by default. Make a test draw with the same curl as above pointed at `http://localhost:8787`.

## Deploy

A push to `main` runs `npx wrangler deploy` in Workers Builds and inherits the live `WC` binding.

To deploy from a laptop, pin ids in `wrangler.local.toml` first.

```bash
npx wrangler deploy -c wrangler.local.toml
```

## Scoring summary

Per-match base points (per team):

| Event                            | Pts |
|----------------------------------|----:|
| Win                              |  +3 |
| Draw                             |  +1 |
| Goal scored (incl. extra time)   |  +1 |
| Clean sheet                      |  +1 |
| Beat a higher-pot team           |  +3 |

Final per-match score = `base × team's permanent Cage multiplier`, where the
multiplier is `0.5 + rt/100` (range ×0.5 to ×1.5), set at draw time. Films are
inverse-pot paired — Pot 1 teams (strongest) carry the lowest multipliers,
Pot 4 (weakest) the highest — so each player's expected multiplier budget
ends up roughly equal regardless of which teams they drew.

Progression bonuses (awarded once each, NOT multiplied):

| Event                               | Pts |
|-------------------------------------|----:|
| Reach R32 (out of groups)           |  +2 |
| Reach R16                           |  +4 |
| Reach QF                            |  +6 |
| Reach SF                            | +10 |
| Reach Final                         | +15 |
| Win it all                          | +25 |

Knockout matches: AET goals count, penalty-shootout tallies don't. The team
that advances gets the +3 win bonus (and the underdog bonus if it beat a
higher pot). football-data's `score.winner` is documented to name the
shootout winner, but the live feed has been seen to omit it, so the advancing
side is resolved defensively from the penalty tally (`score.penalties`) — see
`normalise()` in football-data.ts.

Tiebreakers: total points → total goals scored.

## Files

```
src/
  worker.ts             # routes + cron
  lib/
    teams.ts            # 48 teams × pot
    films.ts            # 48 Cage films + RT scores + multiplier formula
    draw.ts             # deterministic snake draft + inverse-pot film coupling
    scoring.ts          # standings calc (incl. AET / PSO handling)
    cage.ts             # daily Cage Spotlight (informational, no scoring impact)
    football-data.ts    # API client + TLA reconciliation
    rng.ts              # seeded RNG
public/
  index.html  styles.css  app.js
  cage/                 # decorative Cage portraits for the desktop scatter
  players/              # drop avatars here (p1.jpg ... p5.jpg)
wrangler.toml
wrangler.local.toml.example
```
