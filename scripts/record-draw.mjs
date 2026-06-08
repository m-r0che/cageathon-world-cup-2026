#!/usr/bin/env node
// Record a WhatsApp-shareable mp4 of the draw animation.
//
// Usage:
//   npm run record:draw
//
// What it does:
//   1. Spawns `wrangler dev` if nothing is listening on :8787.
//   2. Ensures a draw exists in KV (creates one if not).
//   3. Launches headless Chromium via Playwright at 1280x720.
//   4. Loads http://localhost:8787/?record=1 — recording mode hides the daily
//      spotlight strip and desktop Cage scatter, and auto-opens The Draw tab,
//      which triggers the existing playDrawAnimation() auto-play branch.
//   5. Waits for the animation to complete (~18s), then finalises the video.
//   6. If ffmpeg is on PATH, transcodes the webm to mp4 (H.264, faststart) so
//      WhatsApp will preview it inline. Otherwise leaves the webm.
//
// Output: recordings/draw.mp4 (or recordings/draw.webm if ffmpeg is missing).

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "recordings");
const PORT = 8787;
const URL_RECORD = `http://localhost:${PORT}/?record=1`;
// Empirically ~17s for intro + 4 pots + dissolve. 19s gives a safety buffer.
const RECORDING_MS = 19_000;

async function isServerUp() {
  try {
    const res = await fetch(`http://localhost:${PORT}/api/state`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await isServerUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become ready on :${PORT} within ${timeoutMs / 1000}s`);
}

async function maybeStartWrangler() {
  if (await isServerUp()) {
    console.log(`▶︎ Server already running on :${PORT}`);
    return null;
  }
  console.log(`▶︎ Starting wrangler dev on :${PORT}…`);
  const child = spawn("npx", ["wrangler", "dev", "--port", String(PORT)], {
    cwd: PROJECT_ROOT,
    stdio: "ignore",
    detached: false,
  });
  await waitForServer();
  console.log(`▶︎ Server ready`);
  return child;
}

async function ensureDrawExists() {
  const res = await fetch(`http://localhost:${PORT}/api/state`);
  const state = await res.json();
  if (state.draw) return;
  console.log("▶︎ No draw yet — running POST /api/draw…");
  const r = await fetch(`http://localhost:${PORT}/api/draw`, {
    method: "POST",
    headers: { authorization: "Bearer local-dev-token" },
  });
  if (!r.ok) throw new Error(`/api/draw failed: ${r.status} ${await r.text()}`);
}

async function record() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log("▶︎ Launching headless Chromium…");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
    deviceScaleFactor: 2,   // sharper output
  });
  const page = await context.newPage();
  console.log(`▶︎ Loading ${URL_RECORD}`);
  await page.goto(URL_RECORD, { waitUntil: "networkidle" });
  // app.js auto-clicks the Draw tab once /api/state resolves.
  console.log(`▶︎ Recording for ${RECORDING_MS / 1000}s…`);
  await page.waitForTimeout(RECORDING_MS);
  const videoHandle = page.video();
  await context.close();        // <- finalises the webm
  await browser.close();

  const tmpPath = await videoHandle.path();
  const webmPath = join(OUT_DIR, "draw.webm");
  renameSync(tmpPath, webmPath);
  console.log(`▶︎ Saved ${webmPath}`);
  return webmPath;
}

function ffmpegToMp4(webmPath) {
  return new Promise((resolve) => {
    const mp4Path = webmPath.replace(/\.webm$/, ".mp4");
    console.log("▶︎ Transcoding to mp4 via ffmpeg…");
    const proc = spawn(
      "ffmpeg",
      [
        "-y", "-i", webmPath,
        "-c:v", "libx264", "-preset", "slow", "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        mp4Path,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    proc.on("error", () => {
      console.log("⚠︎ ffmpeg not found — leaving webm. Install with `brew install ffmpeg`.");
      resolve(null);
    });
    proc.on("exit", (code) => {
      if (code === 0) {
        console.log(`▶︎ Saved ${mp4Path}`);
        resolve(mp4Path);
      } else {
        console.log(`⚠︎ ffmpeg exited with code ${code} — webm kept.`);
        resolve(null);
      }
    });
  });
}

async function main() {
  const wrangler = await maybeStartWrangler();
  try {
    await ensureDrawExists();
    const webmPath = await record();
    if (existsSync("/dev/null")) await ffmpegToMp4(webmPath);
    console.log("✓ Done. Drop the file straight into WhatsApp.");
  } finally {
    if (wrangler) {
      console.log("▶︎ Stopping wrangler dev…");
      wrangler.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
