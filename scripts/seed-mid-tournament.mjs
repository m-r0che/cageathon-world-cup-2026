#!/usr/bin/env node
// Generate a plausible mid-tournament match list and POST it via PUT /api/matches.
//
// Usage:
//   ADMIN_TOKEN=local-dev-token node scripts/seed-mid-tournament.mjs [base-url]
//
// Default base-url: http://localhost:8787
//
// Produces ~36 matches covering group stage → quarter-finals, with a mix of finished
// and scheduled matches so the UI shows live standings, recent results, upcoming
// fixtures, progression bonuses, and at least one big upset.

const base = process.argv[2] ?? "http://localhost:8787";
const token = process.env.ADMIN_TOKEN ?? "local-dev-token";

let id = 1000;
const M = (utcDate, status, stage, home, away, hg, ag, group) => {
  const winner = status !== "FINISHED" || hg == null || ag == null
    ? null
    : hg > ag ? "HOME_TEAM" : ag > hg ? "AWAY_TEAM" : "DRAW";
  return {
    id: id++,
    utcDate,
    status,
    stage,
    group,
    homeCode: home,
    awayCode: away,
    homeGoals: hg,
    awayGoals: ag,
    winner,
  };
};

const matches = [
  // ─── Group stage — selective results showing each surviving team played ──────
  // (Only the matches needed to give a flavour; not all 72 group games.)
  M("2026-06-11T20:00:00Z","FINISHED","GROUP_STAGE","MEX","CPV",3,1,"A"),
  M("2026-06-12T18:00:00Z","FINISHED","GROUP_STAGE","ARG","SAU",2,1,"B"),
  M("2026-06-12T21:00:00Z","FINISHED","GROUP_STAGE","FRA","JPN",1,1,"C"),
  M("2026-06-13T16:00:00Z","FINISHED","GROUP_STAGE","CMR","ENG",2,1,"D"),  // big upset
  M("2026-06-13T19:00:00Z","FINISHED","GROUP_STAGE","ESP","TUR",3,0,"E"),
  M("2026-06-14T15:00:00Z","FINISHED","GROUP_STAGE","POR","GHA",2,0,"F"),
  M("2026-06-14T18:00:00Z","FINISHED","GROUP_STAGE","NED","SEN",2,1,"G"),
  M("2026-06-14T21:00:00Z","FINISHED","GROUP_STAGE","GER","NOR",1,2,"H"),  // upset
  M("2026-06-15T18:00:00Z","FINISHED","GROUP_STAGE","BRA","SRB",2,0,"I"),
  M("2026-06-16T18:00:00Z","FINISHED","GROUP_STAGE","CRO","CAN",2,2,"J"),
  M("2026-06-17T20:00:00Z","FINISHED","GROUP_STAGE","COL","AUT",1,0,"K"),
  M("2026-06-18T19:00:00Z","FINISHED","GROUP_STAGE","MAR","CIV",1,0,"L"),
  // Round 2 — handful more
  M("2026-06-19T18:00:00Z","FINISHED","GROUP_STAGE","ARG","NGA",3,0,"B"),
  M("2026-06-20T20:00:00Z","FINISHED","GROUP_STAGE","ENG","JAM",4,0,"D"),
  M("2026-06-21T18:00:00Z","FINISHED","GROUP_STAGE","FRA","CRC",2,0,"C"),
  M("2026-06-22T21:00:00Z","FINISHED","GROUP_STAGE","BRA","KOR",3,1,"I"),
  M("2026-06-23T19:00:00Z","FINISHED","GROUP_STAGE","JPN","TUN",2,0,"C"),  // Japan into knockouts
  M("2026-06-24T18:00:00Z","FINISHED","GROUP_STAGE","SAU","PAR",1,0,"L"),  // Saudi cinderella
  M("2026-06-25T20:00:00Z","FINISHED","GROUP_STAGE","POR","URU",1,1,"F"),
  M("2026-06-26T19:00:00Z","FINISHED","GROUP_STAGE","NED","ECU",3,1,"G"),

  // ─── Round of 16 — all 8 played ─────────────────────────────────────────────
  // Surviving teams: ARG, FRA, BRA, ESP, POR, NED, GER, ENG, MAR, JPN, NOR, CRO, SAU, COL, MEX, CMR
  M("2026-06-29T18:00:00Z","FINISHED","LAST_16",null,null,null,null,null) // placeholder, will be overwritten below
];
matches.pop(); // drop placeholder

const r16 = [
  ["2026-06-29T18:00:00Z","ARG","CRO",2,1],
  ["2026-06-29T22:00:00Z","FRA","SAU",3,1],           // Saudi run ends
  ["2026-06-30T18:00:00Z","ESP","MAR",1,2],           // Morocco shocks Spain (upset, pot 2 vs pot 1)
  ["2026-06-30T22:00:00Z","BRA","COL",2,0],
  ["2026-07-01T18:00:00Z","NED","MEX",3,2],
  ["2026-07-01T22:00:00Z","POR","JPN",1,2],           // Japan upsets Portugal (pot 2 over pot 1)
  ["2026-07-02T18:00:00Z","GER","NOR",2,1],
  ["2026-07-02T22:00:00Z","ENG","CMR",3,0],           // England get revenge on group-stage upset
];
for (const [d, h, a, hg, ag] of r16) matches.push(M(d,"FINISHED","LAST_16",h,a,hg,ag));

// ─── Quarter-finals — 2 finished, 2 scheduled (mid-tournament feel) ──────────
matches.push(M("2026-07-04T18:00:00Z","FINISHED","QUARTER_FINALS","ARG","FRA",1,1));      // Argentina won on pens — treat as draw for scoring
matches.push(M("2026-07-04T22:00:00Z","FINISHED","QUARTER_FINALS","BRA","MAR",2,1));
// patch winners on the finished QFs (knockout penalty result handling — assume HOME won)
matches[matches.length - 2].winner = "HOME_TEAM";
matches[matches.length - 2].homeGoals = 2;  // pretend AET goal so it scores cleanly
matches[matches.length - 2].awayGoals = 1;
matches.push(M("2026-07-05T18:00:00Z","SCHEDULED","QUARTER_FINALS","NED","JPN",null,null));
matches.push(M("2026-07-05T22:00:00Z","SCHEDULED","QUARTER_FINALS","GER","ENG",null,null));

// ─── Semi-finals + Final — placeholders (scheduled, no teams set yet) ────────
// We omit semis because we don't know who advances; the UI will only show them
// once the QFs feed into them. Keeping the seed honest avoids ghost progression.

const res = await fetch(`${base}/api/matches`, {
  method: "PUT",
  headers: {
    "authorization": `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(matches),
});
const out = await res.json();
console.log(`PUT /api/matches → ${res.status}`, out);
console.log(`Seeded ${matches.length} matches:`);
console.log(`  ${matches.filter(m => m.status === "FINISHED").length} finished`);
console.log(`  ${matches.filter(m => m.status === "SCHEDULED").length} scheduled`);
console.log(`  Stages: ${[...new Set(matches.map(m => m.stage))].join(", ")}`);
