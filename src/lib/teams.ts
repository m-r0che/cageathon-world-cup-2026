// The 48 confirmed qualifiers for the 2026 FIFA World Cup, grouped into 4 quality pots.
// Confederation breakdown (per Wikipedia, post-Dec-2025 draw):
//   UEFA 16, CONMEBOL 6, CONCACAF 6, CAF 10, AFC 9, OFC 1 = 48
//
// Pot assignment uses FIFA-ranking tier + hosting status. Hosts (USA/MEX/CAN) sit in Pot 1.

export type PotIndex = 1 | 2 | 3 | 4;

export interface Team {
  code: string;     // 3-letter FIFA code (primary key)
  name: string;
  pot: PotIndex;
  flag: string;     // emoji flag
}

export const TEAMS: Team[] = [
  // ─── Pot 1 — hosts + top seeds (12) ─────────────────────────────────────────
  { code: "USA", name: "USA",         pot: 1, flag: "🇺🇸" },
  { code: "MEX", name: "Mexico",      pot: 1, flag: "🇲🇽" },
  { code: "CAN", name: "Canada",      pot: 1, flag: "🇨🇦" },
  { code: "ARG", name: "Argentina",   pot: 1, flag: "🇦🇷" },
  { code: "BRA", name: "Brazil",      pot: 1, flag: "🇧🇷" },
  { code: "FRA", name: "France",      pot: 1, flag: "🇫🇷" },
  { code: "ENG", name: "England",     pot: 1, flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "ESP", name: "Spain",       pot: 1, flag: "🇪🇸" },
  { code: "POR", name: "Portugal",    pot: 1, flag: "🇵🇹" },
  { code: "NED", name: "Netherlands", pot: 1, flag: "🇳🇱" },
  { code: "GER", name: "Germany",     pot: 1, flag: "🇩🇪" },
  { code: "BEL", name: "Belgium",     pot: 1, flag: "🇧🇪" },

  // ─── Pot 2 — strong sides (12) ──────────────────────────────────────────────
  { code: "CRO", name: "Croatia",     pot: 2, flag: "🇭🇷" },
  { code: "SUI", name: "Switzerland", pot: 2, flag: "🇨🇭" },
  { code: "NOR", name: "Norway",      pot: 2, flag: "🇳🇴" },
  { code: "TUR", name: "Türkiye",     pot: 2, flag: "🇹🇷" },
  { code: "URU", name: "Uruguay",     pot: 2, flag: "🇺🇾" },
  { code: "COL", name: "Colombia",    pot: 2, flag: "🇨🇴" },
  { code: "JPN", name: "Japan",       pot: 2, flag: "🇯🇵" },
  { code: "KOR", name: "South Korea", pot: 2, flag: "🇰🇷" },
  { code: "IRN", name: "Iran",        pot: 2, flag: "🇮🇷" },
  { code: "AUS", name: "Australia",   pot: 2, flag: "🇦🇺" },
  { code: "MAR", name: "Morocco",     pot: 2, flag: "🇲🇦" },
  { code: "SEN", name: "Senegal",     pot: 2, flag: "🇸🇳" },

  // ─── Pot 3 — mid-tier / dark horses (12) ────────────────────────────────────
  { code: "AUT", name: "Austria",       pot: 3, flag: "🇦🇹" },
  { code: "CZE", name: "Czech Republic",pot: 3, flag: "🇨🇿" },
  { code: "SCO", name: "Scotland",      pot: 3, flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  { code: "SWE", name: "Sweden",        pot: 3, flag: "🇸🇪" },
  { code: "ECU", name: "Ecuador",       pot: 3, flag: "🇪🇨" },
  { code: "PAR", name: "Paraguay",      pot: 3, flag: "🇵🇾" },
  { code: "EGY", name: "Egypt",         pot: 3, flag: "🇪🇬" },
  { code: "ALG", name: "Algeria",       pot: 3, flag: "🇩🇿" },
  { code: "TUN", name: "Tunisia",       pot: 3, flag: "🇹🇳" },
  { code: "GHA", name: "Ghana",         pot: 3, flag: "🇬🇭" },
  { code: "CIV", name: "Ivory Coast",   pot: 3, flag: "🇨🇮" },
  { code: "SAU", name: "Saudi Arabia",  pot: 3, flag: "🇸🇦" },

  // ─── Pot 4 — minnows & debutants (12) ───────────────────────────────────────
  { code: "BIH", name: "Bosnia & Herz.",pot: 4, flag: "🇧🇦" },
  { code: "NZL", name: "New Zealand",   pot: 4, flag: "🇳🇿" },
  { code: "PAN", name: "Panama",        pot: 4, flag: "🇵🇦" },
  { code: "CUW", name: "Curaçao",       pot: 4, flag: "🇨🇼" },
  { code: "HAI", name: "Haiti",         pot: 4, flag: "🇭🇹" },
  { code: "QAT", name: "Qatar",         pot: 4, flag: "🇶🇦" },
  { code: "IRQ", name: "Iraq",          pot: 4, flag: "🇮🇶" },
  { code: "UZB", name: "Uzbekistan",    pot: 4, flag: "🇺🇿" },
  { code: "JOR", name: "Jordan",        pot: 4, flag: "🇯🇴" },
  { code: "COD", name: "DR Congo",      pot: 4, flag: "🇨🇩" },
  { code: "RSA", name: "South Africa",  pot: 4, flag: "🇿🇦" },
  { code: "CPV", name: "Cape Verde",    pot: 4, flag: "🇨🇻" },
];

export const POTS: Record<PotIndex, Team[]> = {
  1: TEAMS.filter((t) => t.pot === 1),
  2: TEAMS.filter((t) => t.pot === 2),
  3: TEAMS.filter((t) => t.pot === 3),
  4: TEAMS.filter((t) => t.pot === 4),
};

export function byCode(code: string): Team | undefined {
  return TEAMS.find((t) => t.code === code);
}
