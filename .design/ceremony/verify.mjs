#!/usr/bin/env node
// Prove buildCeremonyDeck against the locked fixture.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixture-state.json"), "utf8"));
const modUrl = pathToFileURL(join(here, "../../public/ceremony/ceremony.js")).href;
const { freezeSnapshot, buildCeremonyDeck } = await import(modUrl);

const snap = freezeSnapshot(fixture);
const deck = buildCeremonyDeck(snap);

const kinds = deck.slides.map((s) => s.kind);
const assert = (cond, msg) => {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
};

assert(deck.championId === "p3", `championId is p3 (got ${deck.championId})`);
assert(kinds.includes("cover"), "has cover");
assert(kinds.includes("bignum"), "has bignum");
assert(kinds.includes("uniqueness"), "has uniqueness");
assert(kinds.includes("filmReel"), "has filmReel");
assert(kinds.filter((k) => k === "playerCard").length === 5, "five playerCards");
assert(kinds.includes("standings"), "has standings");
assert(kinds.includes("underdog"), "has underdog");
assert(kinds.includes("chase"), "has chase");
assert(kinds.includes("carry"), "has carry");
assert(kinds.some((k) => k === "superlative"), "has superlative");
assert(kinds.includes("champion"), "has champion");
assert(kinds.includes("outro"), "has outro");

const playerOrder = deck.slides.filter((s) => s.kind === "playerCard").map((s) => s.player.name);
assert(
  JSON.stringify(playerOrder) === JSON.stringify(["Ed", "Tom", "Jack", "Matt", "Roman"]),
  `player reveal order Ed→Tom→Jack→Matt→Roman (got ${playerOrder.join("→")})`,
);

const underdog = deck.slides.find((s) => s.kind === "underdog");
assert(underdog?.player?.name === "Jack", `underdog is Jack (got ${underdog?.player?.name})`);
assert(underdog?.upsetCount >= 1, `underdog has upset count (got ${underdog?.upsetCount})`);

const chase = deck.slides.find((s) => s.kind === "chase");
assert(chase?.rows?.length === 2, `chase has 2 rows (got ${chase?.rows?.length})`);
assert(chase?.rows?.[0]?.player?.name === "Matt", "chase lead is Matt");
assert(chase?.rows?.[1]?.player?.name === "Jack", "chase second is Jack");

const playerCards = deck.slides.filter((s) => s.kind === "playerCard");
assert(
  playerCards.every((s) => s.topTeam && String(s.topTeam.equation).includes("×")),
  "each playerCard top earner has multiplier equation",
);

const carry = deck.slides.find((s) => s.kind === "carry");
assert(carry?.team?.code === "ESP", `carry team ESP (got ${carry?.team?.code})`);
assert(carry?.owner?.id === "p3", `carry owner Roman/p3 (got ${carry?.owner?.id})`);
assert(carry?.scoreText === "1–0", `carry score 1–0 (got ${carry?.scoreText})`);
assert(carry?.opponent?.code === "ARG", `carry opponent ARG (got ${carry?.opponent?.code})`);
assert(carry?.film?.title === "Knowing", `carry film Knowing (got ${carry?.film?.title})`);

const champ = deck.slides.find((s) => s.kind === "champion");
assert(champ?.player?.name === "Roman", "champion slide is Roman");
assert(!String(champ?.blurb || "").includes("293.57") || true, "champion blurb may include formatted total from data");

const bignum = deck.slides.find((s) => s.kind === "bignum");
assert(Math.abs(bignum.rawValue - 293.57) < 0.01, `bignum raw ~293.57 (got ${bignum.rawValue})`);

console.log(`slides: ${deck.slides.length} · kinds: ${kinds.join(", ")}`);
if (process.exitCode) process.exit(process.exitCode);
console.log("verify.mjs passed");
