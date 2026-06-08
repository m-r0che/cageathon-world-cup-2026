#!/usr/bin/env node
// Local dry-run of the draw — prints the squads each player would get without touching KV.
// Use this to sanity-check a seed before locking the draw in via `POST /api/draw`.
//
// Usage:  node scripts/run-draw.mjs [seed]

import { runDraw } from "../src/lib/draw.ts";
import { TEAMS } from "../src/lib/teams.ts";

// node can't import .ts directly without a loader — this script is meant as a *reference*
// for running the draw. To actually execute it locally, run:
//
//   npx wrangler dev
//   curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:8787/api/draw
//
// and the worker will use the same logic.

console.log("Teams loaded:", TEAMS.length);
console.log("This script is a placeholder — run the draw via `POST /api/draw` on the worker.");
console.log("That guarantees draw seed parity with production.");
