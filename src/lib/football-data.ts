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
  homeGoals: number | null;
  awayGoals: number | null;
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
}

// football-data.org uses 3-letter "tla" codes that mostly match FIFA codes.
// Override known mismatches here.
const TLA_OVERRIDES: Record<string, string> = {
  // football-data tla → our internal team code
  KSA: "SAU",
  KOR: "KOR",
  IRN: "IRN",
};

function mapTla(tla: string | undefined | null): string | null {
  if (!tla) return null;
  const up = tla.toUpperCase();
  const mapped = TLA_OVERRIDES[up] ?? up;
  return TEAMS.some((t) => t.code === mapped) ? mapped : null;
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
    fullTime?: { home?: number | null; away?: number | null };
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
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    stage: m.stage,
    group: m.group ?? undefined,
    homeCode: mapTla(m.homeTeam?.tla),
    awayCode: mapTla(m.awayTeam?.tla),
    homeGoals: m.score?.fullTime?.home ?? null,
    awayGoals: m.score?.fullTime?.away ?? null,
    winner: m.score?.winner ?? null,
  };
}
