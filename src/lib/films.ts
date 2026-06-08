// 48 Nicolas Cage films, hand-picked to span the full Tomatometer range from
// 15% (The Wicker Man — "NOT THE BEES!") to 97% (Pig).
//
// Scores sourced from Rotten Tomatoes' "All Nicolas Cage Movies Ranked"
// editorial guide. They're frozen in this file rather than fetched at runtime so
// the draw is fully reproducible and works offline.

export interface CageFilm {
  title: string;
  year: number;
  rtScore: number;   // 0–100 Tomatometer percentage
}

export const FILMS: CageFilm[] = [
  // ─── Top tier (12) — paired inversely with team Pot 4 (minnows) ───────────
  { title: "Pig",                                    year: 2021, rtScore: 97 },
  { title: "Spider-Man: Into the Spider-Verse",      year: 2018, rtScore: 97 },
  { title: "Red Rock West",                          year: 1993, rtScore: 95 },
  { title: "Face/Off",                               year: 1997, rtScore: 93 },
  { title: "Leaving Las Vegas",                      year: 1995, rtScore: 91 },
  { title: "Mandy",                                  year: 2018, rtScore: 91 },
  { title: "Raising Arizona",                        year: 1987, rtScore: 91 },
  { title: "Dream Scenario",                         year: 2023, rtScore: 91 },
  { title: "Adaptation",                             year: 2002, rtScore: 90 },
  { title: "Moonstruck",                             year: 1987, rtScore: 90 },
  { title: "The Unbearable Weight of Massive Talent",year: 2022, rtScore: 87 },
  { title: "Joe",                                    year: 2013, rtScore: 87 },

  // ─── Good (12) — paired with team Pot 3 ──────────────────────────────────
  { title: "Color Out of Space",                     year: 2019, rtScore: 86 },
  { title: "Bad Lieutenant: Port of Call New Orleans",year:2009, rtScore: 86 },
  { title: "Longlegs",                               year: 2024, rtScore: 85 },
  { title: "Birdy",                                  year: 1984, rtScore: 84 },
  { title: "Valley Girl",                            year: 1983, rtScore: 83 },
  { title: "Matchstick Men",                         year: 2003, rtScore: 82 },
  { title: "Arcadian",                               year: 2024, rtScore: 78 },
  { title: "Kick-Ass",                               year: 2010, rtScore: 78 },
  { title: "Fast Times at Ridgemont High",           year: 1982, rtScore: 78 },
  { title: "The Rock",                               year: 1996, rtScore: 76 },
  { title: "Mom and Dad",                            year: 2017, rtScore: 74 },
  { title: "Bringing Out the Dead",                  year: 1999, rtScore: 74 },

  // ─── Mid (12) — paired with team Pot 2 ───────────────────────────────────
  { title: "The Croods",                             year: 2013, rtScore: 71 },
  { title: "Wild at Heart",                          year: 1990, rtScore: 66 },
  { title: "Honeymoon in Vegas",                     year: 1992, rtScore: 65 },
  { title: "Vampire's Kiss",                         year: 1989, rtScore: 64 },
  { title: "Lord of War",                            year: 2005, rtScore: 62 },
  { title: "The Frozen Ground",                      year: 2013, rtScore: 61 },
  { title: "Snowden",                                year: 2016, rtScore: 61 },
  { title: "Willy's Wonderland",                     year: 2021, rtScore: 60 },
  { title: "The Weather Man",                        year: 2005, rtScore: 60 },
  { title: "Con Air",                                year: 1997, rtScore: 59 },
  { title: "Renfield",                               year: 2023, rtScore: 58 },
  { title: "The Family Man",                         year: 2000, rtScore: 54 },

  // ─── Bottom tier (12) — paired with team Pot 1 (favourites) ──────────────
  { title: "National Treasure",                      year: 2004, rtScore: 47 },
  { title: "Drive Angry",                            year: 2011, rtScore: 46 },
  { title: "Snake Eyes",                             year: 1998, rtScore: 42 },
  { title: "The Sorcerer's Apprentice",              year: 2010, rtScore: 40 },
  { title: "Knowing",                                year: 2009, rtScore: 35 },
  { title: "Ghost Rider",                            year: 2007, rtScore: 28 },
  { title: "Next",                                   year: 2007, rtScore: 28 },
  { title: "Captain Corelli's Mandolin",             year: 2001, rtScore: 28 },
  { title: "Gone in 60 Seconds",                     year: 2000, rtScore: 25 },
  { title: "8MM",                                    year: 1999, rtScore: 23 },
  { title: "Stolen",                                 year: 2012, rtScore: 18 },
  { title: "The Wicker Man",                         year: 2006, rtScore: 15 },
];

/** Multiplier formula. 0% RT → 0.5×, 50% → 1.0×, 100% → 1.5×. */
export function multiplierFor(rtScore: number): number {
  return Math.round((0.5 + rtScore / 100) * 100) / 100;
}

/**
 * Sort films by RT desc, then bucket into 4 film-pots of 12.
 * Bucket 1 = top RT (paired inversely with team Pot 4).
 * Bucket 4 = lowest RT (paired with team Pot 1).
 */
export function filmPots(): CageFilm[][] {
  const sorted = FILMS.slice().sort((a, b) => b.rtScore - a.rtScore);
  return [
    sorted.slice(0, 12),
    sorted.slice(12, 24),
    sorted.slice(24, 36),
    sorted.slice(36, 48),
  ];
}
