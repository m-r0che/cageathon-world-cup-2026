// football-data.org client.
// Free tier is rate-limited (~10 req/min); we cache aggressively in KV.
// Docs: https://www.football-data.org/documentation/quickstart
//
// Competition ID 2000 = FIFA World Cup.

import { TEAMS } from "./teams.ts";

export type MatchStage =
  | "GROUP_STAGE"
  | "LAST_32"           // new in 2026: top 32 advance from groups
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type MatchStatus =
  | "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED"
  | "FINISHED" | "POSTPONED" | "SUSPENDED" | "CANCELLED";

export interface NormalisedMatch {
  id: number;
  utcDate: string;        // ISO
  status: MatchStatus;
  stage: MatchStage;
  group?: string;
  homeCode: string | null;
  awayCode: string | null;
  // Final score AFTER extra time if AET was played; pre-penalties.
  // These count for goal-based scoring.
  homeGoals: number | null;
  awayGoals: number | null;
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  // Optional knockout details — surfaced so the UI can show "AET" / "PSO 4-3".
  duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  penalties?: { home: number; away: number } | null;
}

// football-data.org uses 3-letter "tla" codes that mostly match FIFA codes.
// Override known mismatches here as new ones surface in /api/diagnostics.
const TLA_OVERRIDES: Record<string, string> = {
  KSA: "SAU",   // Saudi Arabia
  CTA: "CIV",   // Côte d'Ivoire (Ivory Coast)
  CGO: "COD",   // football-data sometimes uses CGO for DR Congo
  HTI: "HAI",   // Haiti (FIFA: HAI, IOC: HAI/HTI variants)
  URY: "URU",   // Uruguay — verified against live 2026 data (ISO vs FIFA)
  CUR: "CUW",   // Curaçao — IOC variant (defensive; the real-world case has tla=null, see NAME_OVERRIDES)
  ANT: "CUW",   // Netherlands Antilles legacy code — Curaçao inherited it after 2010 dissolution
};

// Fallback when football-data sends `tla: null` (observed for Curaçao in the live 2026 feed —
// caused GER 7-1 CUW to silently score zero on 06-14). Keys are lowercased, accent-stripped names.
const NAME_OVERRIDES: Record<string, string> = {
  "curacao": "CUW",
};

function normaliseName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// Tracks any TLA we saw in real match data that didn't map to one of our 48 teams.
// Read by the /api/diagnostics endpoint.
const unmappedTlas = new Map<string, string>();   // TLA → most recent team name we saw

function mapTla(tla: string | undefined | null, fallbackName?: string | null): string | null {
  if (tla) {
    const up = tla.toUpperCase();
    const mapped = TLA_OVERRIDES[up] ?? up;
    if (TEAMS.some((t) => t.code === mapped)) return mapped;
    if (fallbackName) unmappedTlas.set(up, fallbackName);
    return null;
  }
  // No TLA at all — football-data occasionally omits it for late-confirmed teams.
  // Fall back to the team name so the match still scores.
  if (fallbackName) {
    const byOverride = NAME_OVERRIDES[normaliseName(fallbackName)];
    if (byOverride) return byOverride;
    unmappedTlas.set(`(no tla: ${fallbackName})`, fallbackName);
  }
  return null;
}

export function getUnmappedTlas(): { tla: string; name: string }[] {
  return Array.from(unmappedTlas.entries()).map(([tla, name]) => ({ tla, name }));
}

interface RawMatch {
  id: number;
  utcDate: string;
  status: MatchStatus;
  stage: MatchStage;
  group?: string | null;
  homeTeam?: { tla?: string | null; name?: string | null };
  awayTeam?: { tla?: string | null; name?: string | null };
  score?: {
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    fullTime?: { home?: number | null; away?: number | null };
    extraTime?: { home?: number | null; away?: number | null };
    penalties?: { home?: number | null; away?: number | null };
  };
}

export async function fetchMatches(
  apiKey: string,
  competitionId: string,
): Promise<NormalisedMatch[]> {
  const url = `https://api.football-data.org/v4/competitions/${competitionId}/matches`;
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`football-data ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { matches: RawMatch[] };
  return json.matches.map(normalise);
}

function normalise(m: RawMatch): NormalisedMatch {
  // If extra time was played, its score is the *cumulative* goals through 120 min
  // — prefer it as the canonical goal count. Penalty-shootout tallies are NOT added
  // to goalsFor (they don't count toward the +1-per-goal mechanic).
  const aet = m.score?.extraTime;
  const ft = m.score?.fullTime;
  const aetPresent = aet && (aet.home != null || aet.away != null);
  const homeGoals = (aetPresent ? aet?.home : ft?.home) ?? null;
  const awayGoals = (aetPresent ? aet?.away : ft?.away) ?? null;

  const p = m.score?.penalties;
  const penalties = p && p.home != null && p.away != null
    ? { home: p.home, away: p.away }
    : null;

  // Per the football-data v4 docs, score.winner should name the shootout winner
  // (HOME_TEAM/AWAY_TEAM) with duration PENALTY_SHOOTOUT. The live 2026 feed credited no
  // win for a shootout (PAR knocking out GER in the R32 showed only a clean sheet), so we
  // resolve the winner defensively from the penalty tally whenever duration is
  // PENALTY_SHOOTOUT. This AGREES with score.winner when the feed populates it
  // (penalties.home > penalties.away ⟺ HOME_TEAM) and fills the gap when it doesn't, so
  // the advancing side still earns its +3 win and any underdog bonus.
  let winner = m.score?.winner ?? null;
  if (m.score?.duration === "PENALTY_SHOOTOUT" && penalties) {
    if (penalties.home > penalties.away) winner = "HOME_TEAM";
    else if (penalties.away > penalties.home) winner = "AWAY_TEAM";
  }

  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    stage: m.stage,
    group: m.group ?? undefined,
    homeCode: mapTla(m.homeTeam?.tla, m.homeTeam?.name),
    awayCode: mapTla(m.awayTeam?.tla, m.awayTeam?.name),
    homeGoals,
    awayGoals,
    winner,
    duration: m.score?.duration,
    penalties,
  };
}
