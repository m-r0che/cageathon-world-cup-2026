# Cageathon World Cup 2026

Nicolas Cage-themed World Cup 2026 sweepstake — 5 players, 48 teams, snake draft across 4 quality pots, live scoring, racing leaderboard.

Runs entirely on Cloudflare: Worker + Static Assets + KV + Cron Trigger. No third-party hosting.

## Stack

- **Cloudflare Worker** (`src/worker.ts`) — API + static assets + cron
- **KV namespace `WC`** — draw, players, matches cache, last_updated
- **Cron trigger** every 15 min → pulls football-data.org
- **Vanilla HTML/CSS/JS** frontend in `public/` — no build step, mobile-first

## Bootstrap (production)

```bash
npm install

# 1. KV — note the namespace IDs printed, paste them into wrangler.toml
wrangler kv namespace create WC
wrangler kv namespace create WC --preview

# 2. Secrets
wrangler secret put FOOTBALL_DATA_API_KEY      # free key from football-data.org
wrangler secret put ADMIN_TOKEN                # any long random string

# 3. Deploy
npx wrangler deploy

# 4. Lock in the draw (idempotent — needs ?force=1 to overwrite)
curl -X POST https://cageathon-world-cup-2026.<acct>.workers.dev/api/draw \
  -H "authorization: Bearer $ADMIN_TOKEN"

# 5. Pull live match data
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

```bash
npx wrangler deploy
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
```
