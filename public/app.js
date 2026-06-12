// Cageathon World Cup 2026 frontend.
// Vanilla JS, no build step. Fetches /api/state, renders race + tabs.

const REFRESH_MS = 60_000;

// ?record=1 mode: scripts/record-draw.mjs uses this to capture a clean video of the
// draw animation. We hide the daily spotlight strip and the desktop scatter, then
// programmatically open The Draw tab once state has loaded — which kicks off the
// auto-play branch already in bindTabs.
const URL_PARAMS = new URLSearchParams(location.search);
const RECORD_MODE = URL_PARAMS.get("record") === "1";
// ?animate=1 → open the Draw tab and replay the animation (for sharing the
// reveal in a chat). ?record=1 implies it. Without either, the Draw tab just
// shows the finished squads grid; replay is one click away.
const ANIMATE_ON_LOAD = RECORD_MODE || URL_PARAMS.get("animate") === "1";
if (RECORD_MODE) document.body.classList.add("recording");

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let state = null;

async function fetchState() {
  const res = await fetch("/api/state", { cache: "no-store" });
  if (!res.ok) throw new Error("state fetch failed");
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function rtLink(movie) {
  // Rotten Tomatoes search — robust to year suffixes / punctuation that direct /m/ slugs would miss.
  const url = `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie)}`;
  // Light HTML escape so apostrophes etc. survive innerHTML interpolation.
  const safe = movie.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<a class="rt" href="${url}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
}

function fmtKickoff(iso) {
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  if (same) return "Today " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function teamMap(state) {
  const m = new Map();
  for (const t of state.teams) m.set(t.code, t);
  return m;
}

function ownerLookup(draw) {
  const m = new Map();
  if (!draw) return m;
  for (const pick of draw.picks) m.set(pick.team, pick.player);
  return m;
}

function renderCageStrip(state) {
  const today = state.today;
  if (!today) return;
  $("#spotlight-film").innerHTML = rtLink(today.film);
  // If the spotlighted film is also one of the 48 paired-to-team films, surface the team.
  const pick = state.draw?.picks?.find((pk) => pk.film === today.film);
  const team = pick ? state.teams.find((t) => t.code === pick.team) : null;
  const ownerById = new Map(state.players.map((p) => [p.id, p]));
  const ownerName = pick ? ownerById.get(pick.player)?.name : null;
  const tail = team
    ? ` · paired to ${team.flag} ${team.name}${ownerName ? ` (${ownerName})` : ""}`
    : "";
  $("#spotlight-meta").textContent = `${today.year} · ${today.rtScore}% RT${tail}`;
}

function renderRace(state) {
  const race = $("#race");
  race.innerHTML = "";
  const rows = state.standings?.rows ?? [];
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const leaderPts = rows[0]?.total ?? 0;
  // 10% headroom on the right so the leader avatar + pulse halo never clips the race container.
  const max = Math.max(60, leaderPts * 1.1);

  // Gridlines = point thresholds. Pick a stride so we get ~4-6 ticks below the leader.
  // Position uses the same (total/max) * 98 formula as the lanes so labels line up exactly.
  const stride = max <= 60 ? 10 : max <= 150 ? 25 : max <= 300 ? 50 : 100;
  for (let v = stride; v < leaderPts; v += stride) {
    const pct = (v / max) * 98;
    const g = document.createElement("span");
    g.className = "gridline";
    g.style.left = pct + "%";
    g.innerHTML = `<span class="tick">${v}</span>`;
    race.appendChild(g);
  }
  // Always pin a marker at the leader's score.
  if (leaderPts > 0) {
    const g = document.createElement("span");
    g.className = "gridline leader";
    g.style.left = ((leaderPts / max) * 98) + "%";
    g.innerHTML = `<span class="tick">${leaderPts.toFixed(2)}pt</span>`;
    race.appendChild(g);
  }

  // Show in player order (not standings order) so lanes are stable.
  for (const p of state.players) {
    const row = rows.find((r) => r.playerId === p.id);
    const total = row?.total ?? 0;
    const pct = (total / max) * 98;
    const isLeader = rows[0]?.playerId === p.id && total > 0;

    const lane = document.createElement("div");
    lane.className = "lane" + (isLeader ? " leader" : "");
    lane.style.setProperty("--lane-color", p.color);
    lane.style.setProperty("--pct", pct + "%");

    const initials = p.name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    // Trail width, avatar position, and points-pill position all read --pct via CSS,
    // including a min-clamp so the avatar never clips the container at score = 0.
    lane.innerHTML = `
      <span class="trail"></span>
      <span class="avatar-wrap">
        <span class="pulse"></span>
        <span class="avatar fallback">${initials}</span>
      </span>
      <span class="pts">${total.toFixed(2)}</span>
    `;
    // Try to load the real avatar; fall through to initials on error.
    const av = lane.querySelector(".avatar");
    const img = new Image();
    img.onload = () => {
      av.classList.remove("fallback");
      av.innerHTML = "";
      if (p.avatarPosition) img.style.objectPosition = p.avatarPosition;
      av.appendChild(img);
    };
    img.onerror = () => {};
    img.src = p.avatar;

    race.appendChild(lane);
  }

  // Header meta
  if (rows.length && rows[0].total > 0) {
    const leader = playersById.get(rows[0].playerId);
    $("#leader").textContent = `${leader.name} leads`;
  } else {
    $("#leader").textContent = "no winners yet";
  }
}

function renderStandings(state) {
  const podium = $("#podium");
  const rest = $("#standings-rest");
  podium.innerHTML = "";
  rest.innerHTML = "";

  const rows = state.standings?.rows ?? [];
  if (!rows.length) {
    podium.innerHTML = `<p class="lede" style="grid-column:1/-1">Draw not run yet.</p>`;
    return;
  }
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const MEDALS = ["🥇", "🥈", "🥉"];
  const PLACE_CLASS = ["first", "second", "third"];

  const attachAvatar = (host, p) => {
    const img = new Image();
    img.onload = () => {
      host.innerHTML = "";
      if (p.avatarPosition) img.style.objectPosition = p.avatarPosition;
      host.appendChild(img);
    };
    img.src = p.avatar;
  };

  // Top 3 → podium tiles.
  rows.slice(0, 3).forEach((r, i) => {
    const p = playersById.get(r.playerId);
    if (!p) return;
    const tile = document.createElement("div");
    tile.className = `place ${PLACE_CLASS[i]}`;
    tile.style.setProperty("--lane-color", p.color);
    const initials = p.name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    tile.innerHTML = `
      <span class="medal">${MEDALS[i]}</span>
      <div class="avatar"><span class="initials">${initials}</span></div>
      <div class="name">${p.name}</div>
      <div class="pts">${r.total.toFixed(2)}</div>
      <div class="sub">${r.matchPoints.toFixed(2)} match · ${r.progressionPoints} prog · ${r.goalsScored} goals</div>
    `;
    attachAvatar(tile.querySelector(".avatar"), p);
    podium.appendChild(tile);
  });

  // Positions 4+ → compact rows.
  rows.slice(3).forEach((r, idx) => {
    const p = playersById.get(r.playerId);
    if (!p) return;
    const place = idx + 4;
    const li = document.createElement("li");
    li.style.setProperty("--lane-color", p.color);
    const initials = p.name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    li.innerHTML = `
      <span class="rank">${place}</span>
      <div class="avatar"><span class="initials">${initials}</span></div>
      <div class="who">
        <strong>${p.name}</strong>
        <span class="sub">${r.matchPoints.toFixed(2)} match · ${r.progressionPoints} prog · ${r.goalsScored} goals</span>
      </div>
      <span class="pts">${r.total.toFixed(2)}</span>
    `;
    attachAvatar(li.querySelector(".avatar"), p);
    rest.appendChild(li);
  });
}

function renderMatches(state) {
  const teams = teamMap(state);
  const owners = ownerLookup(state.draw);
  const playersById = new Map(state.players.map((p) => [p.id, p]));

  const renderRow = (m) => {
    const home = teams.get(m.homeCode);
    const away = teams.get(m.awayCode);
    // Owner tag: a color dot + the owning player's name, so you can read who
    // has each team straight from the Matches tab without opening the Draw.
    // Rendered on its own full-width row (below the score) so the player names
    // never squeeze the team names into truncation on mobile. Always emits a
    // span (empty when the team is unowned, e.g. knockout TBD) so the home /
    // away tags keep their left / right alignment.
    const ownerTag = (code) => {
      const owner = owners.get(code);
      const p = owner ? playersById.get(owner) : null;
      if (!p) return `<span class="owner empty"></span>`;
      return `<span class="owner"><span class="owner-dot" style="background:${p.color}"></span><span class="owner-name">${p.name}</span></span>`;
    };
    const finished = m.status === "FINISHED";
    const live = m.status === "IN_PLAY" || m.status === "PAUSED";
    // Live & finished matches show the running score; football-data populates
    // fullTime goals during play, so a live game reads e.g. "1–0" with a LIVE pill.
    const score = finished
      ? `<span class="score">${m.homeGoals}–${m.awayGoals}</span>`
      : live
      ? `<span class="score live">${m.homeGoals ?? 0}–${m.awayGoals ?? 0}<span class="live-pill"><span class="live-dot"></span>LIVE</span></span>`
      : `<span class="score scheduled">${fmtKickoff(m.utcDate)}</span>`;
    const nameMarkup = (t, code) => {
      // Full name on wide screens, 3-letter code on narrow — keeps cards
      // single-line on phones without ever ellipsing the name.
      const full = t?.name ?? code ?? "TBD";
      const short = t?.code ?? code ?? "TBD";
      return `<span class="tla"><span class="long">${full}</span><span class="short">${short}</span></span>`;
    };
    return `
      <li>
        <span class="when">${m.utcDate.slice(5, 10)}</span>
        <span class="side home">
          <span class="flag">${home?.flag ?? "🏳️"}</span>
          ${nameMarkup(home, m.homeCode)}
        </span>
        ${score}
        <span class="side away">
          ${nameMarkup(away, m.awayCode)}
          <span class="flag">${away?.flag ?? "🏳️"}</span>
        </span>
        <span class="owners">
          ${ownerTag(m.homeCode)}
          ${ownerTag(m.awayCode)}
        </span>
        <span class="stage">${m.stage.replace(/_/g, " ")}${m.group ? " · " + m.group : ""}</span>
      </li>
    `;
  };

  // Live section: only shown when something is actually in play.
  const liveMatches = state.live ?? [];
  $("#live").innerHTML = liveMatches.map(renderRow).join("");
  $("#live-head").hidden = liveMatches.length === 0;

  $("#upcoming").innerHTML = state.upcoming?.length
    ? state.upcoming.map(renderRow).join("")
    : `<li style="grid-template-columns:1fr;color:var(--muted);justify-content:center">No upcoming matches loaded yet.</li>`;
  $("#recent").innerHTML = state.recent?.length
    ? state.recent.map(renderRow).join("")
    : `<li style="grid-template-columns:1fr;color:var(--muted);justify-content:center">No finished matches yet.</li>`;
}

function renderSquads(state) {
  const root = $("#squads");
  root.innerHTML = "";
  if (!state.draw) {
    root.innerHTML = `<p class="lede">Draw hasn't been run yet.</p>`;
    return;
  }
  const teams = teamMap(state);
  const rowsById = new Map((state.standings?.rows ?? []).map((r) => [r.playerId, r]));

  for (const p of state.players) {
    // Pull team + film coupling from the draw picks themselves so we have RT score + multiplier.
    const picks = state.draw.picks
      .filter((pk) => pk.player === p.id)
      .map((pk) => ({ ...pk, team: teams.get(pk.team) }))
      .filter((x) => x.team)
      .sort((a, b) => a.pot - b.pot || a.team.name.localeCompare(b.team.name));

    const row = rowsById.get(p.id);
    const total = row?.total ?? 0;
    const initials = p.name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
    const card = document.createElement("section");
    card.className = "squad";
    card.style.setProperty("--lane-color", p.color);
    card.innerHTML = `
      <header>
        <span class="av">${initials}</span>
        <strong>${p.name}</strong>
        <span class="total">${total.toFixed(2)}</span>
      </header>
      <ul>
        ${picks.map((pk) => {
          const mClass = pk.multiplier >= 1.3 ? "boon" : pk.multiplier <= 0.8 ? "curse" : "";
          return `
            <li class="${mClass}">
              <span class="pot">P${pk.pot}</span>
              <span class="flag">${pk.team.flag}</span>
              <span class="who">
                <span class="team-name">${pk.team.name}</span>
                <span class="mov">${rtLink(pk.film)} <span class="rt-pill">${pk.rtScore}%</span></span>
              </span>
              <span class="mult">×${pk.multiplier.toFixed(2)}</span>
            </li>
          `;
        }).join("")}
      </ul>
    `;
    const av = card.querySelector(".av");
    const img = new Image();
    img.onload = () => {
      av.innerHTML = "";
      if (p.avatarPosition) img.style.objectPosition = p.avatarPosition;
      av.appendChild(img);
    };
    img.src = p.avatar;
    root.appendChild(card);
  }
}

function renderAll(s) {
  state = s;
  renderCageStrip(s);
  renderRace(s);
  renderStandings(s);
  renderMatches(s);
  renderSquads(s);
  $("#updated").textContent = s.last_updated ? `Last update ${fmtDate(s.last_updated)}` : "Awaiting first sync";
  $("#updated-foot").textContent = s.last_updated ? fmtDate(s.last_updated) : "—";
  const seedEl = $("#seed-disp");
  if (seedEl && s.draw) seedEl.textContent = s.draw.seed;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Default to "already played" so opening the Draw tab shows the static
// squads grid. Auto-play is opt-in via ?animate=1 (or ?record=1), wired up
// after first state load below.
let drawAutoPlayed = true;
let drawAnimRunning = false;

function initials(name) {
  return name.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}

function attachAvatarTo(host, p) {
  const img = new Image();
  img.onload = () => {
    host.innerHTML = "";
    if (p.avatarPosition) img.style.objectPosition = p.avatarPosition;
    host.appendChild(img);
  };
  img.src = p.avatar;
}

async function playDrawAnimation() {
  if (!state?.draw || drawAnimRunning) return;
  drawAnimRunning = true;
  const stage = $("#draw-stage");
  const squads = $("#squads");
  const replay = $("#replay-draw");
  if (replay) { replay.disabled = true; replay.classList.add("disabled"); }
  squads.style.display = "none";
  stage.classList.remove("hidden");
  stage.innerHTML = "";

  // ── Phase 1: introduce the players ───────────────────────────────────────
  const intro = document.createElement("div");
  intro.className = "draw-intro";
  intro.innerHTML = `
    <h2 class="draw-bigtitle">The Players</h2>
    <p class="draw-subtitle">Five souls. Forty-eight teams. One Cage.</p>
    <div class="intro-cards"></div>
  `;
  stage.appendChild(intro);
  await sleep(40);
  intro.classList.add("show");

  const cardsHost = intro.querySelector(".intro-cards");
  for (const p of state.players) {
    const card = document.createElement("div");
    card.className = "intro-card";
    card.style.setProperty("--lane-color", p.color);
    card.innerHTML = `
      <div class="avatar"><span class="initials">${initials(p.name)}</span></div>
      <div class="who">${p.name}</div>
    `;
    attachAvatarTo(card.querySelector(".avatar"), p);
    cardsHost.appendChild(card);
    requestAnimationFrame(() => card.classList.add("show"));
    await sleep(260);
  }
  await sleep(1200);
  intro.classList.remove("show");
  await sleep(450);
  intro.remove();

  // ── Phase 2: draft board, pot-by-pot ─────────────────────────────────────
  const board = document.createElement("div");
  board.className = "draft-board";
  board.innerHTML = `
    <div class="pot-banner">
      <div class="pot-title" id="pot-title">POT 1</div>
      <div class="pot-sub"  id="pot-sub">12 teams · snake draft</div>
    </div>
    <div class="cols">
      ${state.players.map((p) => `
        <div class="col" data-player="${p.id}" style="--lane-color:${p.color}">
          <div class="col-head">
            <div class="avatar"><span class="initials">${initials(p.name)}</span></div>
            <div class="name">${p.name}</div>
            <div class="count" data-count>0</div>
          </div>
          <div class="picks"></div>
        </div>
      `).join("")}
    </div>
  `;
  stage.appendChild(board);
  await sleep(40);
  board.classList.add("show");
  state.players.forEach((p) => {
    const av = board.querySelector(`.col[data-player="${p.id}"] .avatar`);
    if (av) attachAvatarTo(av, p);
  });

  const teams = teamMap(state);
  const potTitle = board.querySelector("#pot-title");
  const potSub = board.querySelector("#pot-sub");

  for (const pot of [1, 2, 3, 4]) {
    potTitle.classList.remove("show");
    potSub.classList.remove("show");
    potTitle.textContent = `POT ${pot}`;
    potSub.textContent = pot === 1 ? "Top seeds & hosts"
      : pot === 2 ? "Strong sides"
      : pot === 3 ? "Mid-tier & dark horses"
      : "Minnows & debutants";
    await sleep(80);
    potTitle.classList.add("show");
    potSub.classList.add("show");
    await sleep(750);

    const potPicks = state.draw.picks.filter((pk) => pk.pot === pot);
    for (const pick of potPicks) {
      const col = board.querySelector(`.col[data-player="${pick.player}"]`);
      if (!col) continue;
      const team = teams.get(pick.team);
      if (!team) continue;
      // Briefly highlight the receiving column.
      col.classList.add("active");
      const chip = document.createElement("div");
      const mClass = pick.multiplier >= 1.3 ? " boon" : pick.multiplier <= 0.8 ? " curse" : "";
      chip.className = "pick-chip" + mClass;
      chip.innerHTML = `
        <span class="flag">${team.flag}</span>
        <span class="meta">
          <span class="code">${team.code}</span>
          <span class="film">${pick.film}</span>
        </span>
        <span class="mult">×${pick.multiplier.toFixed(2)}</span>
      `;
      col.querySelector(".picks").appendChild(chip);
      const countEl = col.querySelector("[data-count]");
      countEl.textContent = String(parseInt(countEl.textContent, 10) + 1);
      requestAnimationFrame(() => chip.classList.add("show"));
      await sleep(155);
      col.classList.remove("active");
    }
    await sleep(550);
  }

  // ── Phase 3: fade the board, restore the static squads grid ──────────────
  await sleep(500);
  board.classList.add("dissolve");
  await sleep(550);
  stage.innerHTML = "";
  stage.classList.add("hidden");
  squads.style.display = "";

  if (replay) { replay.disabled = false; replay.classList.remove("disabled"); }
  drawAnimRunning = false;
}

function bindTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".panel").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== target));
      // Spotlight strip is decorative for The Cup view only — keep the other
      // tabs (Matches, Draw, Rules) focused on their own content.
      $("#cage-strip")?.classList.toggle("hidden", target !== "race");
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Auto-play the draw animation the first time the user opens The Draw this session.
      if (target === "draw" && !drawAutoPlayed && state?.draw) {
        drawAutoPlayed = true;
        playDrawAnimation();
      }
    });
  });
  $("#replay-draw")?.addEventListener("click", () => playDrawAnimation());
}

async function tick() {
  try {
    const s = await fetchState();
    renderAll(s);
  } catch (e) {
    console.warn("refresh failed", e);
  }
}

bindTabs();
tick().then(() => {
  // Once the first state is in, animate-on-load (via ?animate=1 or
  // ?record=1) flips the auto-play latch back off and clicks into the Draw
  // tab — the tab handler then triggers playDrawAnimation().
  if (ANIMATE_ON_LOAD) {
    drawAutoPlayed = false;
    const drawTab = document.querySelector('[data-tab="draw"]');
    if (drawTab) drawTab.click();
  }
});
setInterval(tick, REFRESH_MS);
// also tick on visibility regain so phone users see fresh data immediately
document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
