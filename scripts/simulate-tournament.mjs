#!/usr/bin/env node
// Monte-Carlo simulation of the full Cageathon tournament.
//
// Pipeline per trial:
//   1. Run the real draw with a per-trial seed (uses src/lib/draw.ts).
//   2. Synthesize a full WC bracket: 12 groups of 4 → R32 → R16 → QF → SF → 3rd/F.
//      Goals come from a Poisson model with per-team strength derived from pot.
//   3. Feed the resulting NormalisedMatch[] into the real scoring engine.
//   4. Aggregate fairness (win share, avg points) and engagement (gap, lead changes) metrics.
//
// Usage: node scripts/simulate-tournament.mjs [trials]    (default 2000)

import { TEAMS, POTS } from "../src/lib/teams.ts";
import { runDraw } from "../src/lib/draw.ts";
import { computeStandings } from "../src/lib/scoring.ts";
import { rng } from "../src/lib/rng.ts";

const TRIALS = Number(process.argv[2] ?? 2000);

const PLAYERS = [
  { id: "p1", name: "Jack",  avatar: "/p1.jpg", color: "#ff5e3a" },
  { id: "p2", name: "Tom",   avatar: "/p2.jpg", color: "#ffcc00" },
  { id: "p3", name: "Roman", avatar: "/p3.jpg", color: "#34c759" },
  { id: "p4", name: "Matt",  avatar: "/p4.jpg", color: "#5ac8fa" },
  { id: "p5", name: "Ed",    avatar: "/p5.jpg", color: "#af52de" },
];

// Pot-based base strength (rough xG-style attack rating).
const POT_STRENGTH = { 1: 1.85, 2: 1.45, 3: 1.15, 4: 0.90 };

function poisson(lambda, rand) {
  // Knuth's algorithm — fine for the small lambdas we use here (< ~5).
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  while (true) {
    k++;
    p *= rand();
    if (p <= L) return k - 1;
  }
}

function gaussian(rand) {
  // Box-Muller, one sample.
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Build per-team strength once per trial (deterministic from seed).
function buildStrengths(seed) {
  const r = rng(`${seed}:strengths`);
  const m = new Map();
  for (const t of TEAMS) {
    // ±15% per-team noise so a Pot 1 team isn't identical to every other Pot 1.
    const noise = 1 + 0.15 * gaussian(r);
    m.set(t.code, Math.max(0.35, POT_STRENGTH[t.pot] * noise));
  }
  return m;
}

function simMatch(home, away, stage, group, dateIso, matchId, strengths, rand, allowDraw = true) {
  const sH = strengths.get(home), sA = strengths.get(away);
  // Effective xG: own attack scaled by opponent's relative weakness.
  const ref = (sH + sA) / 2;
  const lamH = (sH * sH) / Math.max(ref, 0.4);
  const lamA = (sA * sA) / Math.max(ref, 0.4);
  let hg = poisson(lamH, rand);
  let ag = poisson(lamA, rand);
  // Knockout: must produce a winner. If level, treat as a draw for scoring (the
  // scoring engine awards draw +1 for both, which is the same as the worker does
  // for AET-then-pens matches) and pick a "moves on" winner by coin toss.
  let winner;
  if (hg > ag) winner = "HOME_TEAM";
  else if (ag > hg) winner = "AWAY_TEAM";
  else winner = "DRAW";

  let advances = null;
  if (!allowDraw && winner === "DRAW") {
    advances = rand() < 0.5 ? home : away;
  }
  return {
    id: matchId,
    utcDate: dateIso,
    status: "FINISHED",
    stage,
    group,
    homeCode: home,
    awayCode: away,
    homeGoals: hg,
    awayGoals: ag,
    winner,
    advances,
  };
}

// 12 groups: one team from each pot, randomised. Top 2 + best 8 thirds advance.
function buildGroups(seed) {
  const r = rng(`${seed}:groups`);
  const pots = { 1: [], 2: [], 3: [], 4: [] };
  for (const pot of [1, 2, 3, 4]) {
    const arr = POTS[pot].slice();
    // Fisher-Yates with deterministic rng.
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    pots[pot] = arr;
  }
  const groups = [];
  const letters = "ABCDEFGHIJKL";
  for (let i = 0; i < 12; i++) {
    groups.push({
      letter: letters[i],
      teams: [pots[1][i], pots[2][i], pots[3][i], pots[4][i]],
    });
  }
  return groups;
}

function simGroupStage(groups, strengths, rand) {
  const matches = [];
  let id = 1;
  const tables = new Map(); // groupLetter → array of {code, pts, gd, gf}
  for (const g of groups) {
    const codes = g.teams.map((t) => t.code);
    const stats = new Map(codes.map((c) => [c, { code: c, pts: 0, gd: 0, gf: 0 }]));
    // Round-robin: 6 matches.
    const fixtures = [
      [0, 1], [2, 3],
      [0, 2], [1, 3],
      [0, 3], [1, 2],
    ];
    let day = 11;
    for (const [a, b] of fixtures) {
      const m = simMatch(codes[a], codes[b], "GROUP_STAGE", g.letter,
        `2026-06-${String(day).padStart(2, "0")}T18:00:00Z`, id++, strengths, rand, true);
      matches.push(m);
      const sa = stats.get(codes[a]), sb = stats.get(codes[b]);
      sa.gf += m.homeGoals; sb.gf += m.awayGoals;
      sa.gd += m.homeGoals - m.awayGoals; sb.gd += m.awayGoals - m.homeGoals;
      if (m.winner === "HOME_TEAM") sa.pts += 3;
      else if (m.winner === "AWAY_TEAM") sb.pts += 3;
      else { sa.pts += 1; sb.pts += 1; }
      day++;
    }
    const sorted = Array.from(stats.values()).sort((x, y) =>
      y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
    tables.set(g.letter, sorted);
  }
  // Top 2 from each group (24) + best 8 third-placed (8) = 32.
  const top2 = [], thirds = [];
  for (const [, t] of tables) {
    top2.push(t[0], t[1]);
    thirds.push(t[2]);
  }
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  const advancing = [...top2, ...thirds.slice(0, 8)].map((s) => s.code);
  return { matches, advancing };
}

function simKnockoutRound(stage, codes, strengths, rand, day) {
  // Pair sequentially. Returns {matches, winners}.
  const matches = [];
  const winners = [];
  let id = stage.charCodeAt(0) * 1000 + day;
  for (let i = 0; i < codes.length; i += 2) {
    const m = simMatch(codes[i], codes[i + 1], stage, undefined,
      `2026-07-${String(day).padStart(2, "0")}T20:00:00Z`, id++, strengths, rand, false);
    matches.push(m);
    if (m.winner === "HOME_TEAM") winners.push(codes[i]);
    else if (m.winner === "AWAY_TEAM") winners.push(codes[i + 1]);
    else winners.push(m.advances);
    day = day; // (no-op — day stays the same per round for simplicity)
  }
  return { matches, winners };
}

function simTournament(seed) {
  const rand = rng(`${seed}:sim`);
  const strengths = buildStrengths(seed);
  const groups = buildGroups(seed);
  const { matches: gsMatches, advancing } = simGroupStage(groups, strengths, rand);

  // Re-seed advancing list so bracket pairings aren't strictly pot-sorted.
  const bracket = advancing.slice();
  for (let i = bracket.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bracket[i], bracket[j]] = [bracket[j], bracket[i]];
  }

  const r32 = simKnockoutRound("LAST_32", bracket, strengths, rand, 1);
  const r16 = simKnockoutRound("LAST_16", r32.winners, strengths, rand, 5);
  const qf  = simKnockoutRound("QUARTER_FINALS", r16.winners, strengths, rand, 10);
  const sf  = simKnockoutRound("SEMI_FINALS", qf.winners, strengths, rand, 14);

  // Third place: the two SF losers.
  const sfLosers = [];
  for (let i = 0; i < qf.winners.length; i += 2) {
    const a = qf.winners[i], b = qf.winners[i + 1];
    sfLosers.push(sf.winners.includes(a) ? b : a);
  }
  const third = simKnockoutRound("THIRD_PLACE", sfLosers, strengths, rand, 17);
  const fin   = simKnockoutRound("FINAL", sf.winners, strengths, rand, 19);

  return {
    matches: [
      ...gsMatches, ...r32.matches, ...r16.matches,
      ...qf.matches, ...sf.matches, ...third.matches, ...fin.matches,
    ],
    champion: fin.winners[0],
    strengths,
  };
}

function mean(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function stddev(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

function pct(n, d) { return ((100 * n) / d).toFixed(1) + "%"; }

// ─── Run trials ───────────────────────────────────────────────────────────
console.log(`Running ${TRIALS} simulated tournaments…`);
const t0 = Date.now();

const wins = Object.fromEntries(PLAYERS.map((p) => [p.id, 0]));
const podiums = Object.fromEntries(PLAYERS.map((p) => [p.id, 0]));
const lasts = Object.fromEntries(PLAYERS.map((p) => [p.id, 0]));
const totalsByPlayer = Object.fromEntries(PLAYERS.map((p) => [p.id, []]));
const gaps = []; // winner − last
const margins = []; // winner − 2nd
const closeFinishes = []; // gap top vs 2nd < 5pts
let progressionShare = 0, multiplierShare = 0; // sum across trials
const drawSeedShare = []; // share of total each player held in this trial

// Single example trial to print at the end.
let sample = null;

for (let i = 0; i < TRIALS; i++) {
  const seed = `sim-${i}`;
  const draw = runDraw(seed, PLAYERS);
  const sim = simTournament(seed);
  const standings = computeStandings(draw, sim.matches, new Date("2026-07-20T00:00:00Z"));

  const sorted = standings.rows;
  wins[sorted[0].playerId]++;
  podiums[sorted[0].playerId]++;
  podiums[sorted[1].playerId]++;
  podiums[sorted[2].playerId]++;
  lasts[sorted[sorted.length - 1].playerId]++;
  for (const row of sorted) totalsByPlayer[row.playerId].push(row.total);

  const winnerTotal = sorted[0].total;
  const lastTotal = sorted[sorted.length - 1].total;
  gaps.push(winnerTotal - lastTotal);
  margins.push(winnerTotal - sorted[1].total);
  if (winnerTotal - sorted[1].total < 5) closeFinishes.push(1); else closeFinishes.push(0);

  const sumTotal = sorted.reduce((s, r) => s + r.total, 0);
  const sumProg = sorted.reduce((s, r) => s + r.progressionPoints, 0);
  const sumMatch = sorted.reduce((s, r) => s + r.matchPoints, 0);
  progressionShare += sumProg / sumTotal;
  multiplierShare += sumMatch / sumTotal;

  // Per-trial multiplier-budget check: each player's mean multiplier.
  const draws = PLAYERS.map((p) => {
    const owned = draw.picks.filter((pk) => pk.player === p.id);
    return mean(owned.map((pk) => pk.multiplier));
  });
  drawSeedShare.push(draws);

  if (i === 0) sample = { seed, draw, sim, standings };
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s.\n`);

// ─── Report ──────────────────────────────────────────────────────────────
console.log("══ FAIRNESS ═══════════════════════════════════════════════════");
console.log("Win share (each player's chance of finishing 1st):");
for (const p of PLAYERS) {
  console.log(`  ${p.name.padEnd(6)}  ${pct(wins[p.id], TRIALS).padStart(7)}   (expected ${pct(1, 5)})`);
}
const winShares = PLAYERS.map((p) => wins[p.id] / TRIALS);
const winSpread = Math.max(...winShares) - Math.min(...winShares);
console.log(`Win-share spread (max − min): ${(winSpread * 100).toFixed(1)} percentage points`);

console.log("\nPodium share (top 3 finish):");
for (const p of PLAYERS) {
  console.log(`  ${p.name.padEnd(6)}  ${pct(podiums[p.id], TRIALS).padStart(7)}`);
}

console.log("\nWooden-spoon share (last place):");
for (const p of PLAYERS) {
  console.log(`  ${p.name.padEnd(6)}  ${pct(lasts[p.id], TRIALS).padStart(7)}`);
}

console.log("\nAverage points scored:");
for (const p of PLAYERS) {
  const xs = totalsByPlayer[p.id];
  console.log(`  ${p.name.padEnd(6)}  μ=${mean(xs).toFixed(1).padStart(6)}   σ=${stddev(xs).toFixed(1)}`);
}
const playerMeans = PLAYERS.map((p) => mean(totalsByPlayer[p.id]));
const meanSpread = Math.max(...playerMeans) - Math.min(...playerMeans);
console.log(`Mean-points spread across players: ${meanSpread.toFixed(1)} pts (${pct(meanSpread, mean(playerMeans))} of avg)`);

// Multiplier-budget check (draw-level fairness, decoupled from simulation).
console.log("\nMultiplier budget per player (mean of per-team multipliers, by trial):");
for (let pi = 0; pi < PLAYERS.length; pi++) {
  const xs = drawSeedShare.map((row) => row[pi]);
  console.log(`  ${PLAYERS[pi].name.padEnd(6)}  μ=${mean(xs).toFixed(3)}   σ=${stddev(xs).toFixed(3)}`);
}

console.log("\n══ ENGAGEMENT ════════════════════════════════════════════════");
console.log(`Avg winner-vs-last gap:        ${mean(gaps).toFixed(1)} pts`);
console.log(`Avg winner-vs-runner-up gap:   ${mean(margins).toFixed(1)} pts`);
console.log(`Close finishes (margin <5pts): ${pct(closeFinishes.reduce((a, b) => a + b, 0), TRIALS)}`);
console.log(`Share of total from match pts: ${pct(multiplierShare, TRIALS)}`);
console.log(`Share of total from progress:  ${pct(progressionShare, TRIALS)}`);

console.log("\n══ SAMPLE TOURNAMENT (seed=sim-0) ═══════════════════════════");
console.log(`Champion: ${sample.sim.champion}`);
console.log("Final standings:");
for (let i = 0; i < sample.standings.rows.length; i++) {
  const r = sample.standings.rows[i];
  const p = PLAYERS.find((p) => p.id === r.playerId);
  console.log(`  ${i + 1}. ${p.name.padEnd(6)}  ${String(r.total).padStart(4)}pts   (match ${r.matchPoints}, prog ${r.progressionPoints}, ${r.teams.length} teams)`);
}

// ─── Extra: does owning the champion guarantee winning? ──────────────────
console.log("\n══ SANITY: does the champion-owner always win? ══════════════");
let championIsTopScorer = 0;
for (let i = 0; i < TRIALS; i++) {
  const seed = `sim-${i}`;
  const draw = runDraw(seed, PLAYERS);
  const sim = simTournament(seed);
  const standings = computeStandings(draw, sim.matches, new Date("2026-07-20T00:00:00Z"));
  const champ = sim.champion;
  const owner = draw.picks.find((p) => p.team === champ)?.player;
  if (owner === standings.rows[0].playerId) championIsTopScorer++;
}
console.log(`Champion-owner finishes 1st: ${pct(championIsTopScorer, TRIALS)} of trials`);
console.log(`(If this were ~100% the winner bonus would be too dominant.)`);
