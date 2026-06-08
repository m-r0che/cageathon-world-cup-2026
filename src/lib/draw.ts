// Snake-draft 48 teams across 5 players, and inversely couple each team to a Cage film
// so each team carries a permanent RT-based score multiplier.
//
// Balance trick: film pots are paired INVERSELY with team pots:
//   Team Pot 1 (favourites)  ↔  Film Pot D (worst films → lowest multipliers)
//   Team Pot 4 (minnows)     ↔  Film Pot A (best films  → highest multipliers)
// So the strongest teams carry the smallest boost and the weakest teams carry the largest —
// the multiplier "budget" each player receives ends up roughly equal even though the
// individual team/film coupling is random.

import { POTS, TEAMS, type Team, type PotIndex } from "./teams.ts";
import { FILMS, filmPots, multiplierFor, type CageFilm } from "./films.ts";
import { shuffle } from "./rng.ts";

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  avatarPosition?: string;
}

export interface DrawPick {
  player: string;
  team: string;
  pot: PotIndex;
  film: string;        // film title — references FILMS catalogue
  rtScore: number;     // copy of the film's RT score (so the frontend doesn't need to join)
  multiplier: number;  // computed: 0.5 + rt/100
  order: number;       // sequence in the overall draw (0..47)
}

export interface Draw {
  seed: string;
  createdAt: string;
  players: Player[];
  picks: DrawPick[];
}

export function runDraw(seed: string, players: Player[]): Draw {
  if (players.length < 2) throw new Error("need ≥2 players");

  const baseOrder = shuffle(players.map((p) => p.id), `${seed}:players`);
  const N = baseOrder.length;

  // Per-pot film shuffles. filmPots()[0] = top RT (paired with team pot 4, index 3).
  const fp = filmPots();
  const filmsByTeamPot: Record<PotIndex, CageFilm[]> = {
    1: shuffle(fp[3]!, `${seed}:films:1`),  // worst films → pot 1 teams
    2: shuffle(fp[2]!, `${seed}:films:2`),
    3: shuffle(fp[1]!, `${seed}:films:3`),
    4: shuffle(fp[0]!, `${seed}:films:4`),  // best films → pot 4 teams
  };

  // Track which film index we're up to per pot.
  const cursors: Record<PotIndex, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  // Flatten teams pot-by-pot, each pot shuffled with its own seed (so reveal can be pot-by-pot).
  const flat: { team: Team; pot: PotIndex }[] = [];
  for (const pot of [1, 2, 3, 4] as PotIndex[]) {
    for (const t of shuffle(POTS[pot], `${seed}:pot:${pot}`)) {
      flat.push({ team: t, pot });
    }
  }

  const picks: DrawPick[] = [];
  let cursor = 0;
  let dir = 1;
  for (let i = 0; i < flat.length; i++) {
    const { team, pot } = flat[i]!;
    const film = filmsByTeamPot[pot][cursors[pot]++]!;
    picks.push({
      player: baseOrder[cursor]!,
      team: team.code,
      pot,
      film: film.title,
      rtScore: film.rtScore,
      multiplier: multiplierFor(film.rtScore),
      order: i,
    });
    const next = cursor + dir;
    if (next < 0 || next >= N) dir = -dir;
    else cursor = next;
  }

  if (picks.length !== TEAMS.length) {
    throw new Error(`draw size mismatch: got ${picks.length}, expected ${TEAMS.length}`);
  }

  return {
    seed,
    createdAt: new Date().toISOString(),
    players,
    picks,
  };
}

export function teamsFor(draw: Draw, playerId: string): Team[] {
  const codes = draw.picks.filter((p) => p.player === playerId).map((p) => p.team);
  return codes
    .map((c) => TEAMS.find((t) => t.code === c))
    .filter((t): t is Team => Boolean(t));
}

export function ownerOf(draw: Draw, teamCode: string): string | null {
  const pick = draw.picks.find((p) => p.team === teamCode);
  return pick?.player ?? null;
}

export function multiplierForTeam(draw: Draw, teamCode: string): number {
  const pick = draw.picks.find((p) => p.team === teamCode);
  return pick?.multiplier ?? 1;
}

/** Quick lookup of the film/RT/multiplier coupling per team code. */
export function teamFilm(draw: Draw, teamCode: string): { film: string; rtScore: number; multiplier: number } | null {
  const pick = draw.picks.find((p) => p.team === teamCode);
  if (!pick) return null;
  return { film: pick.film, rtScore: pick.rtScore, multiplier: pick.multiplier };
}

// Re-export so other modules don't have to import films.ts directly.
export { FILMS } from "./films.ts";
