// Daily Cage Spotlight — purely informational, no scoring impact.
// Picks one film from the catalogue each UTC day for flavour. Replaces the old
// blessing/curse mechanic now that the score multiplier is permanent per team
// (see films.ts + draw.ts for the per-team coupling that actually drives scoring).

import { FILMS, type CageFilm } from "./films.ts";
import { rng } from "./rng.ts";

export interface DailySpotlight {
  date: string;     // YYYY-MM-DD (UTC)
  film: string;
  year: number;
  rtScore: number;
}

export function dailySpotlight(seed: string, isoDate: string): DailySpotlight {
  const day = isoDate.slice(0, 10);
  const r = rng(`${seed}:spotlight:${day}`);
  const idx = Math.floor(r() * FILMS.length);
  const f = FILMS[idx] as CageFilm;
  return { date: day, film: f.title, year: f.year, rtScore: f.rtScore };
}
