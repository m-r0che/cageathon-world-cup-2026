#!/usr/bin/env node
// Render the Open Graph image (1200×630) via Playwright. Output: public/og.jpg.
// Run: node scripts/generate-og.mjs

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const b64 = (rel) => {
  const buf = readFileSync(resolve(root, rel));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
};

const cage = b64("public/cage.jpg");
const players = [
  { name: "Jack",  src: b64("public/players/p1.jpg"), pos: "82% 76%", color: "#ff5e3a" },
  { name: "Tom",   src: b64("public/players/p2.jpg"), pos: "46% 22%", color: "#ffcc00" },
  { name: "Roman", src: b64("public/players/p3.jpg"), pos: "68% 42%", color: "#34c759" },
  { name: "Matt",  src: b64("public/players/p4.jpg"), pos: "42% 20%", color: "#5ac8fa" },
  { name: "Ed",    src: b64("public/players/p5.jpg"), pos: "58% 32%", color: "#af52de" },
];

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,700;1,500&family=Inter:wght@500;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "Inter", system-ui, sans-serif;
    color: #f4f3ee;
    background: #0a0a0c;
    position: relative;
  }
  .bg {
    position: absolute; inset: 0;
    background-image: url('${cage}');
    background-size: cover;
    background-position: 60% 30%;
    filter: blur(2px) saturate(1.1);
    opacity: 0.55;
  }
  .vignette {
    position: absolute; inset: 0;
    background:
      radial-gradient(1200px 700px at 25% 40%, transparent 0%, rgba(10,10,12,0.92) 70%),
      linear-gradient(90deg, rgba(10,10,12,0.95) 0%, rgba(10,10,12,0.55) 45%, rgba(10,10,12,0.15) 100%);
  }
  .grain {
    position: absolute; inset: 0;
    background:
      repeating-linear-gradient(0deg, rgba(255,203,92,0.025) 0 2px, transparent 2px 4px);
    mix-blend-mode: overlay;
  }
  .frame {
    position: absolute; inset: 24px;
    border: 1.5px solid rgba(255,203,92,0.35);
    border-radius: 10px;
    pointer-events: none;
  }
  .content {
    position: relative; z-index: 2;
    padding: 70px 80px 56px;
    height: 100%;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .top { display: flex; flex-direction: column; gap: 14px; }
  .kicker {
    font-family: "Inter", sans-serif;
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: #ffcb5c;
    display: flex; align-items: center; gap: 14px;
  }
  .kicker::before, .kicker::after {
    content: ""; flex: 0 0 28px; height: 1.5px;
    background: linear-gradient(90deg, transparent, #ffcb5c, transparent);
  }
  .kicker::before { background: linear-gradient(90deg, #ffcb5c, transparent); flex-basis: 40px; }
  .kicker::after { display: none; }
  h1 {
    font-family: "Fraunces", serif;
    font-weight: 700;
    font-size: 124px;
    line-height: 0.92;
    letter-spacing: -0.035em;
    color: #f4f3ee;
    text-shadow: 0 4px 24px rgba(0,0,0,0.6);
  }
  h1 em {
    font-style: italic;
    color: #ffcb5c;
    font-weight: 500;
  }
  .sub {
    font-family: "Fraunces", serif;
    font-style: italic;
    font-size: 32px;
    color: #f4f3ee;
    opacity: 0.85;
    margin-top: 6px;
  }
  .tagline {
    font-family: "Inter", sans-serif;
    font-weight: 500;
    font-size: 19px;
    color: #c8c7d0;
    letter-spacing: 0.02em;
    margin-top: 4px;
  }
  .tagline strong { color: #ffcb5c; font-weight: 700; }
  .bottom {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 24px;
  }
  .players { display: flex; gap: 18px; }
  .player {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }
  .avatar {
    width: 72px; height: 72px; border-radius: 50%;
    background-size: cover;
    border: 2.5px solid var(--ring);
    box-shadow: 0 4px 16px rgba(0,0,0,0.6);
  }
  .pname {
    font-family: "Inter", sans-serif;
    font-weight: 700;
    font-size: 14px;
    color: #f4f3ee;
    letter-spacing: 0.04em;
  }
  .meta {
    text-align: right;
    font-family: "Fraunces", serif;
    font-style: italic;
    color: #ffcb5c;
    font-size: 22px;
    line-height: 1.2;
  }
  .meta .small {
    display: block;
    font-family: "Inter", sans-serif;
    font-style: normal;
    font-size: 12px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #9b9aa3;
    margin-top: 6px;
  }
</style></head><body>
  <div class="bg"></div>
  <div class="vignette"></div>
  <div class="grain"></div>
  <div class="frame"></div>
  <div class="content">
    <div class="top">
      <div class="kicker">A Nicolas Cage Sweepstake</div>
      <h1>Cage<em>athon</em></h1>
      <div class="sub">World Cup 2026</div>
      <div class="tagline"><strong>5 friends</strong> · <strong>48 teams</strong> · <strong>48 Cage films</strong> · <strong>one champion</strong></div>
    </div>
    <div class="bottom">
      <div class="players">
        ${players.map(p => `
          <div class="player">
            <div class="avatar" style="background-image:url('${p.src}'); background-position:${p.pos}; --ring:${p.color}"></div>
            <div class="pname">${p.name}</div>
          </div>`).join("")}
      </div>
      <div class="meta">June 11 – July 19<span class="small">USA · Canada · Mexico</span></div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle" });
// Give fonts a beat to render after networkidle (Google Fonts CSS triggers
// secondary font fetches that occasionally miss the networkidle window).
await page.waitForTimeout(500);
const png = await page.screenshot({ type: "png", omitBackground: false });
await browser.close();

// Convert PNG → JPG with sharp for smaller file size (WhatsApp prefers <300KB).
const sharp = (await import("sharp")).default;
const jpg = await sharp(png).resize(1200, 630).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
const out = resolve(root, "public/og.jpg");
writeFileSync(out, jpg);
console.log(`Wrote ${out} (${(jpg.length / 1024).toFixed(1)} KB)`);
