// Cageathon World Cup 2026 — Cloudflare Worker entrypoint.
//
// Responsibilities:
//   - Serve static assets (handled by the `assets` binding; we only intervene for /api/*).
//   - GET  /api/state    → everything the frontend needs in one shot
//   - POST /api/draw     → run the draw (admin token required, idempotent if !force)
//   - POST /api/refresh  → pull football-data now (admin token required)
//   - scheduled()        → cron pull every 15 min
//
// All state lives in KV under these keys:
//   draw          — Draw object (frozen once created)
//   players       — Player[]   (roster — edit via /api/players)
//   matches       — NormalisedMatch[]
//   last_updated  — ISO string

import { TEAMS } from "./lib/teams.ts";
import { FILMS } from "./lib/films.ts";
import { runDraw, type Draw, type Player } from "./lib/draw.ts";
import { fetchMatches, getUnmappedTlas, type NormalisedMatch } from "./lib/football-data.ts";
import { computeStandings } from "./lib/scoring.ts";
import { dailySpotlight } from "./lib/cage.ts";

export interface Env {
  ASSETS: Fetcher;
  WC: KVNamespace;
  COMPETITION_ID: string;
  DRAW_SEED: string;
  TOURNAMENT_START: string;
  FOOTBALL_DATA_API_KEY?: string;
  ADMIN_TOKEN?: string;
}

const DEFAULT_PLAYERS: Player[] = [
  { id: "p1", name: "Jack",  avatar: "/players/p1.jpg", color: "#ff5e3a", avatarPosition: "82% 76%" },
  { id: "p2", name: "Tom",   avatar: "/players/p2.jpg", color: "#ffcc00", avatarPosition: "46% 22%" },
  { id: "p3", name: "Roman", avatar: "/players/p3.jpg", color: "#34c759", avatarPosition: "68% 42%" },
  { id: "p4", name: "Matt",  avatar: "/players/p4.jpg", color: "#5ac8fa", avatarPosition: "42% 20%" },
  { id: "p5", name: "Ed",    avatar: "/players/p5.jpg", color: "#af52de", avatarPosition: "58% 32%" },
];

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

function unauthorised(): Response {
  return json({ error: "unauthorised" }, { status: 401 });
}

async function getPlayers(env: Env): Promise<Player[]> {
  const raw = await env.WC.get("players");
  if (!raw) return DEFAULT_PLAYERS;
  try { return JSON.parse(raw) as Player[]; } catch { return DEFAULT_PLAYERS; }
}

async function getDraw(env: Env): Promise<Draw | null> {
  const raw = await env.WC.get("draw");
  if (!raw) return null;
  try { return JSON.parse(raw) as Draw; } catch { return null; }
}

async function getMatches(env: Env): Promise<NormalisedMatch[]> {
  const raw = await env.WC.get("matches");
  if (!raw) return [];
  try { return JSON.parse(raw) as NormalisedMatch[]; } catch { return []; }
}

async function refreshMatches(env: Env): Promise<{ count: number; updated: string }> {
  if (!env.FOOTBALL_DATA_API_KEY) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY not set. For local dev add it to .dev.vars; " +
      "for production run `wrangler secret put FOOTBALL_DATA_API_KEY`.",
    );
  }
  const matches = await fetchMatches(env.FOOTBALL_DATA_API_KEY, env.COMPETITION_ID);
  const updated = new Date().toISOString();
  await env.WC.put("matches", JSON.stringify(matches));
  await env.WC.put("last_updated", updated);
  return { count: matches.length, updated };
}

function isAdmin(req: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) {
    console.warn(
      "[auth] ADMIN_TOKEN not set; all admin endpoints will 401. " +
      "Set via `wrangler secret put ADMIN_TOKEN` (or .dev.vars locally).",
    );
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === env.ADMIN_TOKEN;
}

const handlers: Record<string, (req: Request, env: Env) => Promise<Response>> = {
  "GET /api/state": async (_req, env) => {
    const [draw, matches, players, last_updated] = await Promise.all([
      getDraw(env),
      getMatches(env),
      getPlayers(env),
      env.WC.get("last_updated"),
    ]);
    const now = new Date();
    const standings = draw ? computeStandings(draw, matches, now) : null;
    const today = dailySpotlight(env.DRAW_SEED, now.toISOString());

    // Surface next 5 and last 5 matches so the home view feels live.
    const sorted = matches.slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate));
    const nowIso = now.toISOString();
    const upcoming = sorted.filter((m) => m.utcDate >= nowIso && m.status !== "FINISHED").slice(0, 5);
    const recent = sorted.filter((m) => m.status === "FINISHED").slice(-5).reverse();

    return json({
      players,
      teams: TEAMS,
      films: FILMS,
      draw,
      standings,
      today,             // daily spotlight (informational)
      upcoming,
      recent,
      last_updated,
      tournament_start: env.TOURNAMENT_START,
    });
  },

  "POST /api/draw": async (req, env) => {
    if (!isAdmin(req, env)) return unauthorised();
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const existing = await getDraw(env);
    if (existing && !force) {
      return json({ error: "draw already exists; pass ?force=1 to overwrite", draw: existing }, { status: 409 });
    }
    const players = await getPlayers(env);
    const draw = runDraw(env.DRAW_SEED, players);
    await env.WC.put("draw", JSON.stringify(draw));
    return json({ ok: true, draw });
  },

  "POST /api/refresh": async (req, env) => {
    if (!isAdmin(req, env)) return unauthorised();
    const result = await refreshMatches(env);
    return json({ ok: true, ...result });
  },

  "PUT /api/players": async (req, env) => {
    if (!isAdmin(req, env)) return unauthorised();
    const body = (await req.json()) as Player[];
    if (!Array.isArray(body) || body.length < 2) {
      return json({ error: "expected array of ≥2 players" }, { status: 400 });
    }
    await env.WC.put("players", JSON.stringify(body));
    return json({ ok: true, players: body });
  },

  // Admin diagnostics — health check for the football-data → scoring pipeline.
  // The critical signal is `unmappedTlas`: any TLA that came back from the API but
  // didn't map to one of our 48 teams. Empty = healthy.
  "GET /api/diagnostics": async (req, env) => {
    if (!isAdmin(req, env)) return unauthorised();
    const matches = await getMatches(env);
    const draw = await getDraw(env);
    const drawnCodes = new Set((draw?.picks ?? []).map((p) => p.team));
    const teamsNeverInMatchData = [...drawnCodes].filter(
      (code) => !matches.some((m) => m.homeCode === code || m.awayCode === code),
    );
    // Matches with TBD teams are expected pre-knockout — most knockout slots fill in as
    // groups conclude. We report a count rather than the full list to keep the response tidy.
    const tbdMatches = matches.filter((m) => m.homeCode === null || m.awayCode === null);
    return json({
      // Real problem signals
      unmappedTlas: getUnmappedTlas(),                  // ← must be empty for healthy scoring
      teamsNeverInMatchData,                            // ← drawn teams the API never references
      // Informational
      totalMatches: matches.length,
      tbdMatchesCount: tbdMatches.length,
      tbdMatchesByStage: tbdMatches.reduce<Record<string, number>>((acc, m) => {
        acc[m.stage] = (acc[m.stage] ?? 0) + 1;
        return acc;
      }, {}),
      lastUpdated: (await env.WC.get("last_updated")) ?? null,
    });
  },

  // Manual matches override — useful for local testing and as a break-glass if football-data is down.
  "PUT /api/matches": async (req, env) => {
    if (!isAdmin(req, env)) return unauthorised();
    const body = (await req.json()) as NormalisedMatch[];
    if (!Array.isArray(body)) return json({ error: "expected array of matches" }, { status: 400 });
    await env.WC.put("matches", JSON.stringify(body));
    await env.WC.put("last_updated", new Date().toISOString());
    return json({ ok: true, count: body.length });
  },
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      // Fail fast on missing/placeholder bindings — gives a usable error instead of a Cloudflare-internal one.
      if (!env.WC) {
        return json({
          error: "KV namespace `WC` is not bound. Run `wrangler kv namespace create WC` and paste the id into wrangler.toml.",
        }, { status: 500 });
      }
      const key = `${req.method} ${url.pathname}`;
      const handler = handlers[key];
      if (!handler) return json({ error: "not found" }, { status: 404 });
      try {
        return await handler(req, env);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: msg }, { status: 500 });
      }
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Hourly cron (24 req/day) — leaves headroom under football-data's 50-req/day free cap.
    // Log failures so they surface in `wrangler tail` — silent swallow would hide outages.
    ctx.waitUntil(
      refreshMatches(env).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[cron] refreshMatches failed:", msg);
      }),
    );
  },
};
