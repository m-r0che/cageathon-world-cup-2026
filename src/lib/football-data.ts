// football-data.org client.
// Free tier is rate-limited (~10 req/min); we cache aggressively in KV.
// Docs: https://www.football-data.org/documentation/quickstart
//
// Competition ID 2000 = FIFA World Cup.

import { TEAMS } from "./teams.ts";

export type MatchStage =
  | "GROUP_STAGE"
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
  RSA: "RSA",   // South Africa (identity, listed for clarity)
  CGO: "COD",   // football-data sometimes uses CGO for DR Congo
  CRC: "CRC",   // Costa Rica isn't in 2026 but mapped for safety
  HTI: "HAI",   // Haiti (FIFA: HAI, IOC: HAI/HTI variants)
};

// Tracks any TLA we saw in real match data that didn't map to one of our 48 teams.
// Read by the /api/diagnostics endpoint.
const unmappedTlas = new Map<string, string>();   // TLA → most recent team name we saw

function mapTla(tla: string | undefined | null, fallbackName?: string | null): string | null {
  if (!tla) return null;
  const up = tla.toUpperCase();
  const mapped = TLA_OVERRIDES[up] ?? up;
  if (TEAMS.some((t) => t.code === mapped)) return mapped;
  // Record the mismatch so it's visible to the admin.
  if (fallbackName) unmappedTlas.set(up, fallbackName);
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
    winner: m.score?.winner ?? null,
    duration: m.score?.duration,
    penalties,
  };
}
