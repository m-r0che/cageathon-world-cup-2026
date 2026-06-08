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

| Event                          | Pts |
|--------------------------------|----:|
| Group win                      |  +3 |
| Group draw                     |  +1 |
| Goal scored                    |  +1 |
| Clean sheet                    |  +1 |
| Beat a higher-pot team         |  +3 |
| Reach R16 / QF / SF / F / Win  |  +4 / +6 / +10 / +15 / +25 |
| Day's Cage Blessed             |  ×2 base for that match |
| Day's Cage Cursed              |  ÷2 base for that match |

Tiebreakers: total points → total goals scored.

## Files

```
src/
  worker.ts             # routes + cron
  lib/
    teams.ts            # 48 teams × pot × Cage movie
    draw.ts             # deterministic snake draft
    scoring.ts          # standings calc
    cage.ts             # daily blessing/curse
    football-data.ts    # API client
    rng.ts              # seeded RNG
public/
  index.html  styles.css  app.js
  players/              # drop avatars here
wrangler.toml
```
