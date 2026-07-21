// Cageathon closing ceremony — freeze → build deck → mount player.
// Vanilla JS module. Pure build; thin DOM shell. No poll.

export const HERO_IMAGE = "/ceremony/hero.jpg";
export const OG_IMAGE = "/ceremony/og.jpg";

const DEFAULT_DWELL = 7500;
const COVER_DWELL = 0; // tap to advance

export function assertNever(x) {
  throw new Error(`unexpected: ${JSON.stringify(x)}`);
}

function isObj(v) {
  return v !== null && typeof v === "object";
}

/** Validate /api/state once. Require draw + standings.rows length ≥ 1. */
export function freezeSnapshot(raw) {
  if (!isObj(raw)) throw new Error("state: expected object");
  if (!Array.isArray(raw.players) || raw.players.length < 1) {
    throw new Error("state: players missing");
  }
  if (!Array.isArray(raw.teams) || !Array.isArray(raw.films)) {
    throw new Error("state: teams/films missing");
  }
  if (!isObj(raw.draw) || !Array.isArray(raw.draw.picks) || raw.draw.picks.length < 1) {
    throw new Error("state: draw required");
  }
  if (!isObj(raw.standings) || !Array.isArray(raw.standings.rows) || raw.standings.rows.length < 1) {
    throw new Error("state: standings.rows required");
  }
  return Object.freeze({
    players: raw.players,
    teams: raw.teams,
    films: raw.films,
    draw: raw.draw,
    standings: raw.standings,
    recent: Array.isArray(raw.recent) ? raw.recent : [],
    last_updated: raw.last_updated ?? null,
  });
}

function fmtPtsFull(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

function initialsOf(name) {
  return String(name)
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function resolvePlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    avatar: p.avatar,
    avatarPosition: p.avatarPosition,
    initials: initialsOf(p.name),
  };
}

function resolveTeam(t) {
  return { code: t.code, name: t.name, flag: t.flag, pot: t.pot };
}

function resolveFilm(title, year, rtScore, multiplier) {
  return { title, year: year ?? 0, rtScore, multiplier };
}

/** Highlight parse — builder only. Mirrors public/app.js. */
export function parseHighlight(raw) {
  const m = String(raw).match(/^(\S+) vs (\S+) (\d+)-(\d+): ([\d.]+)pt \((.*)\)$/);
  if (!m) return null;
  return {
    date: m[1],
    oppCode: m[2],
    goalsFor: Number(m[3]),
    goalsAgainst: Number(m[4]),
    points: Number(m[5]),
    notes: m[6],
    isUpset: m[6].includes("upset"),
  };
}

export function computeContext(snap) {
  const playersById = new Map(snap.players.map((p) => [p.id, resolvePlayer(p)]));
  const teamsByCode = new Map(snap.teams.map((t) => [t.code, resolveTeam(t)]));
  const filmsByTitle = new Map(snap.films.map((f) => [f.title, f]));
  const ownerByTeam = new Map();
  const filmByTeam = new Map();
  const pickByTeam = new Map();

  for (const pick of snap.draw.picks) {
    const owner = playersById.get(pick.player);
    if (owner) ownerByTeam.set(pick.team, owner);
    pickByTeam.set(pick.team, pick);
    const catalog = filmsByTitle.get(pick.film);
    filmByTeam.set(
      pick.team,
      resolveFilm(pick.film, catalog?.year, pick.rtScore, pick.multiplier),
    );
  }

  const breakdownByCode = new Map();
  for (const row of snap.standings.rows) {
    for (const tb of row.teams ?? []) breakdownByCode.set(tb.code, { row, tb });
  }

  const teamLines = [];
  for (const [code, pick] of pickByTeam) {
    const team = teamsByCode.get(code);
    const film = filmByTeam.get(code);
    const owner = ownerByTeam.get(code);
    if (!team || !film || !owner) continue;
    const hit = breakdownByCode.get(code);
    const tb = hit?.tb;
    const matchPoints = tb?.matchPoints ?? 0;
    const progressionPoints = tb?.progressionPoints ?? 0;
    teamLines.push({
      team,
      film,
      owner,
      points: matchPoints + progressionPoints,
      matchPoints,
      progressionPoints,
      goals: tb?.goalsScored ?? 0,
      highlights: tb?.highlight ?? [],
    });
  }
  teamLines.sort((a, b) => b.points - a.points);

  const ranked = snap.standings.rows.map((row, i) => {
    const player = playersById.get(row.playerId);
    const owned = teamLines
      .filter((tl) => tl.owner.id === row.playerId)
      .sort((a, b) => b.points - a.points);
    return {
      player,
      rank: i + 1,
      standing: row,
      teamLines: owned,
    };
  });

  return {
    snapshot: snap,
    playersById,
    teamsByCode,
    ownerByTeam,
    filmByTeam,
    ranked,
    teamLines,
    hasResults: ranked.length > 0 && Boolean(snap.draw),
  };
}

function base(id, chapter, accent, dwellMs = DEFAULT_DWELL) {
  return { id, chapter, accent, dwellMs };
}

function coverSegment(ctx) {
  return [
    {
      ...base("cover", "opening", "#ffcb5c", COVER_DWELL),
      kind: "cover",
      brand: "Cageathon",
      title: "Closing Ceremony",
      tagline: "Five friends. Forty-eight teams. One Cage.",
      heroImage: HERO_IMAGE,
      cta: "Tap to begin",
    },
  ];
}

function bignumSegment(ctx) {
  const champ = ctx.ranked[0];
  if (!champ) return [];
  return [
    {
      ...base("bignum-champ", "numbers", champ.player.color),
      kind: "bignum",
      eyebrow: `${champ.player.name} · final total`,
      value: fmtPtsFull(champ.standing.total),
      rawValue: Number(champ.standing.total),
      unit: "points",
      caption: "Everyone else was playing catch-up.",
    },
  ];
}

function uniquenessSegment(_ctx) {
  return [
    {
      ...base("uniqueness", "films", "#ffcb5c"),
      kind: "uniqueness",
      eyebrow: "Not normal fantasy",
      headline: "Snake draft + inverse-pot Cage multipliers",
      beats: [
        {
          label: "Snake",
          body: "Pot by pot. Last pick in pot 1 goes first in pot 2.",
        },
        {
          label: "Inverse pots",
          body: "Strong teams get bad films (low ×). Weak teams get bangers (high ×).",
        },
        {
          label: "Match only",
          body: "The multiplier hits match points. Progression bonuses stay raw.",
        },
      ],
    },
  ];
}

function filmReelSegment(ctx) {
  const lines = ctx.teamLines;
  if (!lines.length) return [];

  const byRt = [...lines].sort((a, b) => b.film.rtScore - a.film.rtScore);
  const byMult = [...lines].sort((a, b) => b.film.multiplier - a.film.multiplier);
  const byPts = [...lines].sort((a, b) => b.points - a.points);

  const picked = [];
  const seen = new Set();
  const take = (line, label) => {
    if (!line || seen.has(line.team.code)) return;
    seen.add(line.team.code);
    picked.push({
      label,
      film: line.film,
      team: line.team,
      owner: line.owner,
      pointsContributed: line.points,
    });
  };

  take(byRt[0], "Highest RT");
  take(byRt[byRt.length - 1], "Lowest RT");
  take(byMult[0], "Wildest ×");
  take(
    lines.find((l) => l.progressionPoints === Math.max(...lines.map((x) => x.progressionPoints))),
    "Cup run",
  );
  take(byPts[0], "Most points");

  const hi = byRt[0]?.film;
  const lo = byRt[byRt.length - 1]?.film;
  const headline =
    hi && lo
      ? `From ${hi.title} (${hi.rtScore}%) to ${lo.title} (${lo.rtScore}%)`
      : "Forty-eight films bolted to forty-eight teams";

  return [
    {
      ...base("film-reel", "films", "#ffcb5c"),
      kind: "filmReel",
      eyebrow: "48 films. One career.",
      headline,
      entries: picked,
      note: "Each film's Tomatometer locked a permanent match-point multiplier at the draw.",
    },
  ];
}

function epithetFor(rp) {
  const top = rp.teamLines[0];
  const eliteFilms = rp.teamLines.filter((tl) => tl.film.rtScore >= 95);
  const cursedCarry = rp.teamLines.find(
    (tl) => tl.film.multiplier <= 0.8 && tl.progressionPoints >= 15,
  );
  if (rp.rank === 1) return "Took the Cup. Kept the receipts.";
  if (rp.rank === 2) return "Silver. Loud footsteps.";
  if (rp.rank === 3) return "Podium. No footnotes.";
  if (eliteFilms.length >= 2) {
    return `Owned the ${eliteFilms[0].film.rtScore}% club. The scoreboard shrugged.`;
  }
  if (cursedCarry) {
    return `${cursedCarry.team.name} on ${cursedCarry.film.title}. Bad reviews, deep run.`;
  }
  if (rp.rank === 5) return "Somebody had to finish the story.";
  if (top && top.film.rtScore <= 30) {
    return `${top.team.name} on ${top.film.title}. Bold.`;
  }
  if (rp.standing.progressionPoints >= 50) return "Deep run energy.";
  if (rp.standing.goalsScored >= 70) return "Goals for days.";
  return `Top earner: ${top ? top.team.name : "the void"}.`;
}

/** Top-earner payload with film multiplier math for the player card. */
function topEarnerPayload(tl) {
  if (!tl) return null;
  const mult = Number(tl.film.multiplier);
  const matchBase = mult > 0 ? tl.matchPoints / mult : tl.matchPoints;
  return {
    team: tl.team,
    film: tl.film,
    points: tl.points,
    matchPoints: tl.matchPoints,
    progressionPoints: tl.progressionPoints,
    goals: tl.goals,
    matchBase,
    multiplier: mult,
    equation: `${fmtPtsFull(matchBase)} × ${mult.toFixed(2)} = ${fmtPtsFull(tl.matchPoints)}`,
  };
}

function playersSegment(ctx) {
  // Last place first for Wrapped suspense.
  const order = [...ctx.ranked].sort((a, b) => b.rank - a.rank);
  return order.map((rp, i) => ({
    ...base(`player-${rp.player.id}`, "players", rp.player.color),
    kind: "playerCard",
    player: rp.player,
    rank: rp.rank,
    revealOrder: i,
    total: rp.standing.total,
    totalLabel: fmtPtsFull(rp.standing.total),
    matchPoints: rp.standing.matchPoints,
    progressionPoints: rp.standing.progressionPoints,
    goals: rp.standing.goalsScored,
    squadSize: rp.teamLines.length,
    topTeam: topEarnerPayload(rp.teamLines[0] ?? null),
    epithet: epithetFor(rp),
  }));
}

function standingsSegment(ctx) {
  return [
    {
      ...base("standings", "table", "#ffcb5c"),
      kind: "standings",
      eyebrow: "The final table",
      rows: ctx.ranked.map((rp) => ({
        rank: rp.rank,
        player: rp.player,
        total: rp.standing.total,
        totalLabel: fmtPtsFull(rp.standing.total),
        matchPoints: rp.standing.matchPoints,
        progressionPoints: rp.standing.progressionPoints,
        goals: rp.standing.goalsScored,
        isChampion: rp.rank === 1,
      })),
    },
  ];
}

function findFinalMatch(recent) {
  // Prefer the chronologically latest FINAL. football-data has labeled some
  // knockout fixtures as FINAL before the cup final itself.
  const finals = (recent ?? []).filter(
    (m) => m && m.stage === "FINAL" && m.status === "FINISHED",
  );
  if (!finals.length) return null;
  return finals.slice().sort((a, b) => String(b.utcDate).localeCompare(String(a.utcDate)))[0];
}

function winnerCodeFromMatch(m) {
  if (!m) return null;
  if (m.winner === "HOME_TEAM") return m.homeCode;
  if (m.winner === "AWAY_TEAM") return m.awayCode;
  return null;
}

function carrySegment(ctx) {
  const final = findFinalMatch(ctx.snapshot.recent);
  let line = null;
  let scoreText = null;
  let opponent = null;

  if (final) {
    const code = winnerCodeFromMatch(final);
    line = ctx.teamLines.find((tl) => tl.team.code === code) ?? null;
    if (
      line &&
      Number.isFinite(final.homeGoals) &&
      Number.isFinite(final.awayGoals)
    ) {
      const oppCode = code === final.homeCode ? final.awayCode : final.homeCode;
      opponent = ctx.teamsByCode.get(oppCode) ?? null;
      const forGoals = code === final.homeCode ? final.homeGoals : final.awayGoals;
      const againstGoals = code === final.homeCode ? final.awayGoals : final.homeGoals;
      scoreText = `${forGoals}–${againstGoals}`;
    }
  }

  if (!line) {
    // No FINAL in recent — still tell the carry via max progression, omit score.
    line = [...ctx.teamLines].sort((a, b) => b.progressionPoints - a.progressionPoints)[0] ?? null;
  }
  if (!line) return [];

  return [
    {
      ...base("carry", "awards", line.owner.color),
      kind: "carry",
      eyebrow: "The carry",
      headline: `${line.team.flag} ${line.team.name} × ${line.film.title}`,
      team: line.team,
      film: line.film,
      owner: line.owner,
      multiplierLabel: `×${Number(line.film.multiplier).toFixed(2)}`,
      matchPtsLabel: fmtPtsFull(line.matchPoints),
      progressionPtsLabel: String(line.progressionPoints),
      scoreText,
      opponent,
      blurb: scoreText && opponent
        ? `${scoreText} vs ${opponent.name}. ${line.owner.name} cashed the Cup.`
        : `${line.owner.name} rode ${line.team.name} through the knockouts.`,
    },
  ];
}

/** Sum upset bonuses per player (raw +3s × that team's Cage multiplier). */
function upsetTallies(ctx) {
  return ctx.ranked
    .map((rp) => {
      let raw = 0;
      let after = 0;
      let count = 0;
      const samples = [];
      for (const tl of rp.teamLines) {
        for (const h of tl.highlights) {
          const p = parseHighlight(h);
          if (!p?.isUpset) continue;
          const m = String(p.notes).match(/upset vs pot \d+ \+(\d+)/);
          const bonus = m ? Number(m[1]) : 3;
          const bonusAfter = bonus * Number(tl.film.multiplier);
          raw += bonus;
          after += bonusAfter;
          count += 1;
          samples.push({
            team: tl.team,
            film: tl.film,
            bonusAfter,
            score: `${p.goalsFor}–${p.goalsAgainst}`,
            oppCode: p.oppCode,
          });
        }
      }
      samples.sort((a, b) => b.bonusAfter - a.bonusAfter);
      return { player: rp.player, rank: rp.rank, raw, after, count, samples };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => b.after - a.after || b.count - a.count);
}

function underdogSegment(ctx) {
  const tallies = upsetTallies(ctx);
  const top = tallies[0];
  if (!top) return [];
  const sample = top.samples[0];
  const opp = sample ? ctx.teamsByCode.get(sample.oppCode) : null;
  return [
    {
      ...base("underdog", "awards", top.player.color),
      kind: "underdog",
      eyebrow: "Biggest underdog",
      player: top.player,
      rank: top.rank,
      upsetCount: top.count,
      upsetPtsLabel: fmtPtsFull(top.after),
      rawBonusLabel: `+${top.raw} raw`,
      headline: top.player.name,
      blurb:
        top.count === 1
          ? "One giant-killing. Multiplied."
          : `${top.count} upsets · lower pots punching up.`,
      sample: sample
        ? {
            label: `${sample.team.flag} ${sample.team.name} ${sample.score} ${opp ? opp.name : sample.oppCode}`,
            film: sample.film.title,
            pts: `+${fmtPtsFull(sample.bonusAfter)} from the upset bonus`,
          }
        : null,
    },
  ];
}

/** Spotlight 2nd + 3rd so the ceremony is not only Roman. */
function chaseSegment(ctx) {
  const pack = ctx.ranked.slice(1, 3);
  if (!pack.length) return [];
  return [
    {
      ...base("chase", "awards", pack[0].player.color),
      kind: "chase",
      eyebrow: "The chase",
      headline: pack.length === 1 ? "Runner-up" : "Silver and bronze",
      rows: pack.map((rp) => {
        const top = topEarnerPayload(rp.teamLines[0] ?? null);
        return {
          rank: rp.rank,
          player: rp.player,
          totalLabel: fmtPtsFull(rp.standing.total),
          matchLabel: fmtPtsFull(rp.standing.matchPoints),
          progLabel: String(rp.standing.progressionPoints),
          topTeam: top,
          line: top
            ? `${top.team.flag} ${top.team.name} · ${top.film.title} · ${top.equation}`
            : null,
        };
      }),
    },
  ];
}

/** Hook line for a lower-table player — critic films, cursed deep run, or top earner. */
function floorHook(rp) {
  const elite = rp.teamLines
    .filter((tl) => tl.film.rtScore >= 95)
    .sort((a, b) => b.film.rtScore - a.film.rtScore);
  if (elite.length >= 2) {
    const titles = elite.map((e) => e.film.title).join(" + ");
    return {
      badge: "Critic bait",
      line: `Drew ${titles} (${elite[0].film.rtScore}% RT, ×${Number(elite[0].film.multiplier).toFixed(2)}). The teams whispered.`,
    };
  }
  const cursed = rp.teamLines.find(
    (tl) => tl.film.multiplier <= 0.8 && tl.progressionPoints >= 15,
  );
  if (cursed) {
    return {
      badge: "Bad film, deep run",
      line: `${cursed.team.flag} ${cursed.team.name} on ${cursed.film.title} (×${Number(cursed.film.multiplier).toFixed(2)}) still banked +${cursed.progressionPoints} progression.`,
    };
  }
  const top = topEarnerPayload(rp.teamLines[0] ?? null);
  if (top) {
    return {
      badge: "Top earner",
      line: `${top.team.flag} ${top.team.name} · ${top.film.title} · ${top.equation}`,
    };
  }
  return { badge: "Also ran", line: "Showed up. Left receipts." };
}

/** 4th vs 5th — Tom/Ed photo finish and their Cageathon hooks. */
function floorSegment(ctx) {
  const a = ctx.ranked[3];
  const b = ctx.ranked[4];
  if (!a || !b) return [];
  const gap = Math.abs(a.standing.total - b.standing.total);
  return [
    {
      ...base("floor", "awards", a.player.color),
      kind: "floor",
      eyebrow: "Photo finish",
      headline: `${a.player.name} · ${b.player.name}`,
      gapLabel: `${fmtPtsFull(gap)} pts apart`,
      blurb: gap < 1
        ? "Fourth and fifth separated by less than a clean sheet."
        : "The basement had a subplot.",
      rows: [a, b].map((rp) => {
        const hook = floorHook(rp);
        return {
          rank: rp.rank,
          player: rp.player,
          totalLabel: fmtPtsFull(rp.standing.total),
          badge: hook.badge,
          line: hook.line,
        };
      }),
    },
  ];
}

function superlativesSegment(ctx) {
  const slides = [];
  const champId = ctx.ranked[0]?.player.id;

  // Prefer awards that land on someone other than the champion when possible.
  const byGoalsPlayer = [...ctx.ranked].sort(
    (a, b) => b.standing.goalsScored - a.standing.goalsScored,
  );
  const goalsPick =
    byGoalsPlayer.find((rp) => rp.player.id !== champId && rp.standing.goalsScored > 0) ??
    byGoalsPlayer[0];
  if (goalsPick && goalsPick.standing.goalsScored > 0) {
    slides.push({
      ...base("sup-goals", "awards", goalsPick.player.color),
      kind: "superlative",
      award: "Goals factory",
      winnerLabel: goalsPick.player.name,
      detail: `${goalsPick.standing.goalsScored} goals across the squad`,
      value: `${goalsPick.standing.goalsScored} GF`,
      owner: goalsPick.player,
    });
  }

  // Cursed film that still paid: lowest multiplier among each player's top earner,
  // but only if that player isn't already the underdog slide's star and finished well.
  const cursed = ctx.ranked
    .map((rp) => {
      const top = rp.teamLines[0];
      if (!top) return null;
      return { rp, top, mult: Number(top.film.multiplier) };
    })
    .filter(Boolean)
    .sort((a, b) => a.mult - b.mult);
  const cursePick = cursed.find((c) => c.rp.rank <= 3);
  if (cursePick) {
    const { rp, top, mult } = cursePick;
    slides.push({
      ...base("sup-curse", "awards", rp.player.color),
      kind: "superlative",
      award: "Cage curse, still climbing",
      winnerLabel: `${top.team.flag} ${top.team.name} · ${top.film.title}`,
      detail: `${rp.player.name} finished #${rp.rank} on a ×${mult.toFixed(2)} film`,
      value: `×${mult.toFixed(2)}`,
      owner: rp.player,
    });
  }

  const byProg = [...ctx.teamLines].sort((a, b) => b.progressionPoints - a.progressionPoints);
  if (byProg[0] && byProg[0].progressionPoints > 0) {
    const tl = byProg[0];
    slides.push({
      ...base("sup-prog", "awards", tl.owner.color),
      kind: "superlative",
      award: "Deepest run",
      winnerLabel: `${tl.team.flag} ${tl.team.name}`,
      detail: `${tl.progressionPoints} progression pts · ${tl.owner.name}`,
      value: `+${tl.progressionPoints}`,
      owner: tl.owner,
    });
  }

  return slides.slice(0, 3);
}

function championSegment(ctx) {
  const champ = ctx.ranked[0];
  const second = ctx.ranked[1];
  if (!champ) return [];
  const margin = second ? champ.standing.total - second.standing.total : 0;
  return [
    {
      ...base("champion", "champion", champ.player.color, 9000),
      kind: "champion",
      player: champ.player,
      total: champ.standing.total,
      totalLabel: fmtPtsFull(champ.standing.total),
      marginLabel: fmtPtsFull(margin),
      crown: "Cageathon World Champion",
      blurb: second
        ? `${fmtPtsFull(margin)} pts clear of ${second.player.name}.`
        : "No contest.",
      heroImage: HERO_IMAGE,
    },
  ];
}

function outroSegment(ctx) {
  const champ = ctx.ranked[0];
  const name = champ?.player.name ?? "the champion";
  const total = champ ? fmtPtsFull(champ.standing.total) : "";
  return [
    {
      ...base("outro", "closing", "#ffcb5c", 11000),
      kind: "outro",
      message: `${name} won Cageathon 2026.`,
      shareText: champ
        ? `${name} won Cageathon World Cup 2026 with ${total} points.`
        : "Cageathon World Cup 2026 is over.",
      ogImage: OG_IMAGE,
      backHref: "/",
      backLabel: "Back to the Cup",
    },
  ];
}

/** Pure. Same snapshot → same deck. */
export function buildCeremonyDeck(snap) {
  const ctx = computeContext(snap);
  const slides = [
    ...coverSegment(ctx),
    ...bignumSegment(ctx),
    ...uniquenessSegment(ctx),
    ...filmReelSegment(ctx),
    ...playersSegment(ctx),
    ...standingsSegment(ctx),
    ...underdogSegment(ctx),
    ...chaseSegment(ctx),
    ...floorSegment(ctx),
    ...carrySegment(ctx),
    ...superlativesSegment(ctx),
    ...championSegment(ctx),
    ...outroSegment(ctx),
  ];
  return {
    championId: ctx.ranked[0]?.player.id ?? null,
    slides,
  };
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "className") el.className = v;
    else if (k === "textContent") el.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

function avatarEl(player, sizeClass = "av") {
  const wrap = h("div", { className: sizeClass, style: { "--p": player.color } });
  const fallback = h("span", { className: "av-init" }, player.initials);
  wrap.append(fallback);
  const img = new Image();
  img.alt = "";
  if (player.avatarPosition) img.style.objectPosition = player.avatarPosition;
  img.onload = () => {
    wrap.innerHTML = "";
    wrap.append(img);
  };
  img.src = player.avatar;
  return wrap;
}

const renderers = {
  cover(s) {
    return h(
      "article",
      { className: "slide slide-cover", style: { "--accent": s.accent } },
      h("div", { className: "cover-bg", style: { backgroundImage: `url(${s.heroImage})` } }),
      h("div", { className: "cover-veil" }),
      h(
        "div",
        { className: "cover-copy" },
        h("p", { className: "brand" }, s.brand),
        h("h1", { className: "cover-title" }, s.title),
        h("p", { className: "cover-tag" }, s.tagline),
        h("p", { className: "cover-cta" }, s.cta),
      ),
    );
  },

  bignum(s) {
    return h(
      "article",
      { className: "slide slide-bignum", style: { "--accent": s.accent }, "data-raw": String(s.rawValue) },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h(
        "div",
        { className: "bignum-row" },
        h("span", { className: "bignum-value", "data-count": String(s.rawValue) }, "0"),
        s.unit ? h("span", { className: "bignum-unit" }, s.unit) : null,
      ),
      h("p", { className: "caption" }, s.caption),
    );
  },

  uniqueness(s) {
    return h(
      "article",
      { className: "slide slide-unique", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h("h2", { className: "headline" }, s.headline),
      h(
        "ul",
        { className: "beat-list" },
        ...s.beats.map((b) =>
          h("li", {}, h("strong", {}, b.label), h("span", {}, b.body)),
        ),
      ),
    );
  },

  filmReel(s) {
    return h(
      "article",
      { className: "slide slide-films", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h("h2", { className: "headline" }, s.headline),
      h(
        "ul",
        { className: "film-list" },
        ...s.entries.map((e) =>
          h(
            "li",
            {},
            h("span", { className: "film-label" }, e.label),
            h(
              "div",
              { className: "film-main" },
              h("strong", {}, e.film.title),
              h(
                "span",
                { className: "film-meta" },
                `${e.team.flag} ${e.team.name} · ×${Number(e.film.multiplier).toFixed(2)} · ${e.owner.name}`,
              ),
            ),
            h("span", { className: "film-rt" }, `${e.film.rtScore}%`),
          ),
        ),
      ),
      s.note ? h("p", { className: "note" }, s.note) : null,
    );
  },

  playerCard(s) {
    const top = s.topTeam;
    return h(
      "article",
      { className: "slide slide-player", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, `#${s.rank}`),
      h(
        "div",
        { className: "player-hero" },
        avatarEl(s.player, "av av-lg"),
        h("h2", { className: "player-name" }, s.player.name),
        h("p", { className: "player-pts" }, s.totalLabel),
      ),
      h("p", { className: "epithet" }, s.epithet),
      top
        ? h(
            "div",
            { className: "top-earner" },
            h("p", { className: "top-earner-label" }, "Top earner"),
            h(
              "p",
              { className: "top-team" },
              `${top.team.flag} ${top.team.name} · ${top.film.title}`,
            ),
            h("p", { className: "top-equation" }, top.equation),
            h(
              "p",
              { className: "top-prog" },
              `match ${fmtPtsFull(top.matchPoints)} · +${top.progressionPoints} progression`,
            ),
          )
        : null,
    );
  },

  underdog(s) {
    return h(
      "article",
      { className: "slide slide-underdog", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h(
        "div",
        { className: "underdog-hero" },
        avatarEl(s.player, "av av-lg"),
        h("h2", { className: "headline" }, s.headline),
      ),
      h("p", { className: "award-value" }, s.upsetPtsLabel),
      h(
        "p",
        { className: "caption" },
        `${s.upsetCount} upset${s.upsetCount === 1 ? "" : "s"} · ${s.rawBonusLabel} before the Cage ×`,
      ),
      h("p", { className: "epithet" }, s.blurb),
      s.sample
        ? h(
            "div",
            { className: "underdog-sample" },
            h("p", { className: "top-earner-label" }, "Biggest single bite"),
            h("p", { className: "top-team" }, s.sample.label),
            h("p", { className: "top-equation" }, s.sample.pts),
            h("p", { className: "note" }, s.sample.film),
          )
        : null,
    );
  },

  chase(s) {
    return h(
      "article",
      { className: "slide slide-chase", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h("h2", { className: "headline" }, s.headline),
      h(
        "ul",
        { className: "chase-list" },
        ...s.rows.map((r) =>
          h(
            "li",
            {},
            h(
              "div",
              { className: "chase-head" },
              h("span", { className: "ft-rank" }, `#${r.rank}`),
              avatarEl(r.player, "av av-sm"),
              h("span", { className: "ft-name" }, r.player.name),
              h("span", { className: "ft-pts" }, r.totalLabel),
            ),
            r.line ? h("p", { className: "chase-line" }, r.line) : null,
            h(
              "p",
              { className: "note" },
              `${r.matchLabel} match · +${r.progLabel} progression`,
            ),
          ),
        ),
      ),
    );
  },

  floor(s) {
    return h(
      "article",
      { className: "slide slide-floor", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h("h2", { className: "headline" }, s.headline),
      h("p", { className: "award-value" }, s.gapLabel),
      h("p", { className: "caption" }, s.blurb),
      h(
        "ul",
        { className: "chase-list" },
        ...s.rows.map((r) =>
          h(
            "li",
            {},
            h(
              "div",
              { className: "chase-head" },
              h("span", { className: "ft-rank" }, `#${r.rank}`),
              avatarEl(r.player, "av av-sm"),
              h("span", { className: "ft-name" }, r.player.name),
              h("span", { className: "ft-pts" }, r.totalLabel),
            ),
            h("p", { className: "top-earner-label" }, r.badge),
            h("p", { className: "chase-line" }, r.line),
          ),
        ),
      ),
    );
  },

  standings(s) {
    return h(
      "article",
      { className: "slide slide-table", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h(
        "ol",
        { className: "final-table" },
        ...s.rows.map((r) =>
          h(
            "li",
            { className: r.isChampion ? "champ-row" : "" },
            h("span", { className: "ft-rank" }, String(r.rank)),
            avatarEl(r.player, "av av-sm"),
            h("span", { className: "ft-name" }, r.player.name),
            h("span", { className: "ft-pts" }, r.totalLabel),
          ),
        ),
      ),
    );
  },

  carry(s) {
    return h(
      "article",
      { className: "slide slide-carry", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.eyebrow),
      h("h2", { className: "headline" }, s.headline),
      h("p", { className: "carry-mult" }, s.multiplierLabel),
      s.scoreText && s.opponent
        ? h(
            "p",
            { className: "carry-score" },
            `${s.scoreText} vs ${s.opponent.flag} ${s.opponent.name}`,
          )
        : null,
      h(
        "div",
        { className: "carry-owner" },
        avatarEl(s.owner, "av"),
        h("span", {}, s.owner.name),
      ),
      h("p", { className: "caption" }, s.blurb),
      h(
        "p",
        { className: "note" },
        `${s.matchPtsLabel} match · ${s.progressionPtsLabel} progression`,
      ),
    );
  },

  superlative(s) {
    return h(
      "article",
      { className: "slide slide-award", style: { "--accent": s.accent } },
      h("p", { className: "eyebrow" }, s.award),
      h("h2", { className: "headline" }, s.winnerLabel),
      s.value ? h("p", { className: "award-value" }, s.value) : null,
      h("p", { className: "caption" }, s.detail),
      s.owner ? h("div", { className: "carry-owner" }, avatarEl(s.owner, "av av-sm"), h("span", {}, s.owner.name)) : null,
    );
  },

  champion(s) {
    return h(
      "article",
      { className: "slide slide-champ", style: { "--accent": s.accent } },
      h("div", { className: "champ-bg", style: { backgroundImage: `url(${s.heroImage})` } }),
      h("div", { className: "cover-veil" }),
      h(
        "div",
        { className: "champ-copy" },
        h("p", { className: "eyebrow" }, s.crown),
        avatarEl(s.player, "av av-xl"),
        h("h2", { className: "player-name" }, s.player.name),
        h("p", { className: "player-pts" }, s.totalLabel),
        h("p", { className: "caption" }, s.blurb),
      ),
    );
  },

  outro(s) {
    return h(
      "article",
      { className: "slide slide-outro", style: { "--accent": s.accent } },
      h("h2", { className: "headline" }, s.message),
      h("p", { className: "caption" }, s.shareText),
      h("a", { className: "back-link", href: s.backHref }, s.backLabel),
    );
  },
};

export function renderSlide(slide) {
  const fn = renderers[slide.kind];
  if (!fn) assertNever(slide);
  return fn(slide);
}

export function initialDeckState() {
  return { index: 0, entered: false };
}

export function deckReducer(state, action, length) {
  const max = Math.max(0, length - 1);
  switch (action.type) {
    case "enter":
      return { index: Math.min(1, max), entered: true };
    case "next": {
      if (!state.entered && state.index === 0) {
        return { index: Math.min(1, max), entered: true };
      }
      return { ...state, index: Math.min(state.index + 1, max), entered: true };
    }
    case "prev":
      return { ...state, index: Math.max(state.index - 1, 0) };
    case "goto": {
      const i = Math.max(0, Math.min(action.index, max));
      return { index: i, entered: i > 0 || state.entered };
    }
    default:
      return assertNever(action);
  }
}

function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runCountUp(root) {
  if (prefersReducedMotion()) {
    root.querySelectorAll("[data-count]").forEach((el) => {
      el.textContent = fmtPtsFull(Number(el.getAttribute("data-count")));
    });
    return;
  }
  root.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.getAttribute("data-count"));
    const start = performance.now();
    const dur = 1100;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmtPtsFull(target * eased);
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = fmtPtsFull(target);
    };
    requestAnimationFrame(tick);
  });
}

export function mountCeremony(root, deck) {
  const slides = deck.slides;
  let state = initialDeckState();
  let dwellTimer = null;
  let destroyed = false;

  const chrome = h("div", { className: "ceremony-chrome" });
  const progress = h("div", { className: "progress", role: "navigation", "aria-label": "Ceremony progress" });
  const stage = h("div", { className: "stage", id: "slide-stage" });
  const zones = h(
    "div",
    { className: "tap-zones", "aria-hidden": "true" },
    h("button", { className: "zone zone-prev", type: "button", "aria-label": "Previous" }),
    h("button", { className: "zone zone-next", type: "button", "aria-label": "Next" }),
  );

  for (let i = 0; i < slides.length; i++) {
    progress.append(h("button", { className: "pip", type: "button", "data-i": String(i), "aria-label": `Slide ${i + 1}` }));
  }

  chrome.append(progress, stage, zones);
  root.replaceChildren(chrome);

  function clearDwell() {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  }

  function scheduleDwell() {
    clearDwell();
    const slide = slides[state.index];
    if (!slide || !slide.dwellMs || prefersReducedMotion()) return;
    dwellTimer = setTimeout(() => dispatch({ type: "next" }), slide.dwellMs);
  }

  function paint() {
    const slide = slides[state.index];
    if (!slide) return;
    const node = renderSlide(slide);
    node.classList.add("enter");
    stage.replaceChildren(node);
    progress.querySelectorAll(".pip").forEach((pip, i) => {
      pip.classList.toggle("on", i === state.index);
      pip.classList.toggle("done", i < state.index);
      if (i === state.index && slide.dwellMs > 0) {
        pip.style.setProperty("--dwell", `${slide.dwellMs}ms`);
      } else {
        pip.style.removeProperty("--dwell");
      }
    });
    root.style.setProperty("--accent", slide.accent || "#ffcb5c");
    runCountUp(node);
    scheduleDwell();
  }

  function dispatch(action) {
    if (destroyed) return;
    const next = deckReducer(state, action, slides.length);
    if (next.index === state.index && next.entered === state.entered) {
      if (action.type === "next" && state.index === slides.length - 1) return;
      if (action.type === "prev" && state.index === 0) return;
    }
    state = next;
    paint();
  }

  function onKey(e) {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      dispatch({ type: "next" });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      dispatch({ type: "prev" });
    }
  }

  zones.querySelector(".zone-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    dispatch({ type: "prev" });
  });
  zones.querySelector(".zone-next").addEventListener("click", (e) => {
    e.stopPropagation();
    dispatch({ type: "next" });
  });
  progress.addEventListener("click", (e) => {
    const btn = e.target.closest(".pip");
    if (!btn) return;
    dispatch({ type: "goto", index: Number(btn.dataset.i) });
  });
  window.addEventListener("keydown", onKey);

  // Optional swipe
  let touchX = null;
  stage.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0]?.clientX ?? null;
    },
    { passive: true },
  );
  stage.addEventListener(
    "touchend",
    (e) => {
      if (touchX == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
      touchX = null;
      if (Math.abs(dx) < 48) return;
      dispatch({ type: dx < 0 ? "next" : "prev" });
    },
    { passive: true },
  );

  paint();

  return {
    destroy() {
      destroyed = true;
      clearDwell();
      window.removeEventListener("keydown", onKey);
      root.replaceChildren();
    },
  };
}

export async function startCeremony(root) {
  root.replaceChildren(h("p", { className: "boot" }, "Loading ceremony…"));
  try {
    const raw = await fetch("/api/state", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`state ${r.status}`);
      return r.json();
    });
    const snap = freezeSnapshot(raw);
    const deck = buildCeremonyDeck(snap);
    return mountCeremony(root, deck);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    root.replaceChildren(
      h(
        "div",
        { className: "boot-err" },
        h("h1", {}, "Ceremony not ready"),
        h("p", {}, msg),
        h("a", { href: "/" }, "Back to the Cup"),
      ),
    );
    throw err;
  }
}
