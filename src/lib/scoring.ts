// Scoring engine.
//
// Per finished match, for each team:
//   base = 0
//   if WON:    base += 3
//   elif DRAW: base += 1
//   base += goalsScored                       (1 per goal)
//   if cleanSheet (opponent scored 0): base += 1
//   if beat a team from a HIGHER pot:  base += 3   (underdog bonus)
//
//   matchPts = round(base * teamMultiplier)
//
// Where teamMultiplier is the team's permanent Cage-film multiplier set at draw time
// (0.5× for a 0% RT film up to 1.5× for a 100% RT film). The inverse-pot coupling
// in draw.ts means weak teams carry big multipliers and strong teams carry small ones —
// every player gets a roughly equal multiplier budget. See draw.ts for the balance trick.
//
// Tournament progression bonuses (awarded once each, NOT multiplied — they recognise the
// achievement of advancing, not film luck):
//   Reached Round of 16:  +4
//   Reached Quarter:      +6
//   Reached Semi:        +10
//   Reached Final:       +15
//   Won the Final:       +25
//
// Tiebreakers: total points → total goals scored by owned teams.

import { TEAMS, byCode } from "./teams.ts";
import type { Draw } from "./draw.ts";
import type { NormalisedMatch, MatchStage } from "./football-data.ts";

export interface TeamBreakdown {
  code: string;
  matchPoints: number;
  progressionPoints: number;
  goalsScored: number;
  multiplier: number;
  film: string;
  rtScore: number;
  highlight: string[];
}

export interface PlayerStanding {
  playerId: string;
  total: number;
  matchPoints: number;
  progressionPoints: number;
  goalsScored: number;
  teams: TeamBreakdown[];
}

export interface Standings {
  asOf: string;
  rows: PlayerStanding[];  // sorted desc
}

const PROGRESSION = {
  LAST_16: 4,
  QUARTER_FINALS: 6,
  SEMI_FINALS: 10,
  FINAL: 15,
  WINNER: 25,
} as const;

const STAGE_ORDER: MatchStage[] = [
  "GROUP_STAGE", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL",
];

function stageIndex(s: MatchStage): number {
  if (s === "THIRD_PLACE") return STAGE_ORDER.indexOf("SEMI_FINALS");
  return STAGE_ORDER.indexOf(s);
}

export function computeStandings(
  draw: Draw,
  matches: NormalisedMatch[],
  now: Date = new Date(),
): Standings {
  // Build per-team stats keyed by code.
  const teamStats = new Map<string, TeamBreakdown>();
  for (const t of TEAMS) {
    const pick = draw.picks.find((p) => p.team === t.code);
    teamStats.set(t.code, {
      code: t.code,
      matchPoints: 0,
      progressionPoints: 0,
      goalsScored: 0,
      multiplier: pick?.multiplier ?? 1,
      film: pick?.film ?? "",
      rtScore: pick?.rtScore ?? 0,
      highlight: [],
    });
  }

  const sorted = matches.slice().sort((a, b) => a.utcDate.localeCompare(b.utcDate));
  const furthest = new Map<string, number>();
  let winnerCode: string | null = null;

  for (const m of sorted) {
    if (!m.homeCode || !m.awayCode) continue;

    const sIdx = stageIndex(m.stage);
    if (sIdx >= 0) {
      furthest.set(m.homeCode, Math.max(furthest.get(m.homeCode) ?? 0, sIdx));
      furthest.set(m.awayCode, Math.max(furthest.get(m.awayCode) ?? 0, sIdx));
    }

    if (m.status !== "FINISHED") continue;
    if (m.homeGoals == null || m.awayGoals == null) continue;

    const homeTeam = byCode(m.homeCode);
    const awayTeam = byCode(m.awayCode);
    if (!homeTeam || !awayTeam) continue;

    for (const side of ["home", "away"] as const) {
      const isHome = side === "home";
      const team = isHome ? homeTeam : awayTeam;
      const oppTeam = isHome ? awayTeam : homeTeam;
      const goalsFor = isHome ? m.homeGoals : m.awayGoals;
      const goalsAgainst = isHome ? m.awayGoals : m.homeGoals;

      let base = 0;
      const notes: string[] = [];

      if (m.winner === "DRAW") {
        base += 1; notes.push("draw +1");
      } else if (
        (m.winner === "HOME_TEAM" && isHome) ||
        (m.winner === "AWAY_TEAM" && !isHome)
      ) {
        base += 3; notes.push("win +3");
        if (oppTeam.pot < team.pot) {
          base += 3;
          notes.push(`upset vs pot ${oppTeam.pot} +3`);
        }
      }
      if (goalsFor > 0) {
        base += goalsFor;
        notes.push(`${goalsFor} goal${goalsFor === 1 ? "" : "s"} +${goalsFor}`);
      }
      if (goalsAgainst === 0) {
        base += 1; notes.push("clean sheet +1");
      }

      const stats = teamStats.get(team.code)!;
      const multiplied = Math.round(base * stats.multiplier);
      if (stats.multiplier !== 1 && base > 0) {
        notes.push(`×${stats.multiplier.toFixed(2)} = ${multiplied}`);
      }
      stats.matchPoints += multiplied;
      stats.goalsScored += goalsFor;
      const dateLabel = m.utcDate.slice(5, 10);
      stats.highlight.push(`${dateLabel} vs ${oppTeam.code} ${goalsFor}-${goalsAgainst}: ${multiplied}pt (${notes.join(", ")})`);
    }

    if (m.stage === "FINAL" && m.winner && m.winner !== "DRAW") {
      winnerCode = m.winner === "HOME_TEAM" ? m.homeCode : m.awayCode;
    }
  }

  // Award progression bonuses based on furthest stage reached (cumulative).
  for (const [code, idx] of furthest) {
    const stage = STAGE_ORDER[idx];
    const stats = teamStats.get(code);
    if (!stats || !stage) continue;
    if (stage === "LAST_16")        stats.progressionPoints += PROGRESSION.LAST_16;
    if (stage === "QUARTER_FINALS") stats.progressionPoints += PROGRESSION.LAST_16 + PROGRESSION.QUARTER_FINALS;
    if (stage === "SEMI_FINALS")    stats.progressionPoints += PROGRESSION.LAST_16 + PROGRESSION.QUARTER_FINALS + PROGRESSION.SEMI_FINALS;
    if (stage === "FINAL")          stats.progressionPoints += PROGRESSION.LAST_16 + PROGRESSION.QUARTER_FINALS + PROGRESSION.SEMI_FINALS + PROGRESSION.FINAL;
  }
  if (winnerCode) {
    const stats = teamStats.get(winnerCode);
    if (stats) stats.progressionPoints += PROGRESSION.WINNER;
  }

  const rows: PlayerStanding[] = draw.players.map((p) => {
    const owned = draw.picks
      .filter((pk) => pk.player === p.id)
      .map((pk) => teamStats.get(pk.team)!)
      .filter(Boolean);
    const matchPoints = owned.reduce((s, t) => s + t.matchPoints, 0);
    const progressionPoints = owned.reduce((s, t) => s + t.progressionPoints, 0);
    const goalsScored = owned.reduce((s, t) => s + t.goalsScored, 0);
    return {
      playerId: p.id,
      total: matchPoints + progressionPoints,
      matchPoints,
      progressionPoints,
      goalsScored,
      teams: owned,
    };
  });

  rows.sort((a, b) => b.total - a.total || b.goalsScored - a.goalsScored);

  return { asOf: now.toISOString(), rows };
}
