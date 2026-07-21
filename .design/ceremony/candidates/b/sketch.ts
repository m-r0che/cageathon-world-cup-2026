/**
 * Candidate B sketch for /ceremony/.
 *
 * Intent: keep the ceremony as data. /api/state is validated once, transformed
 * into an ordered deck by a pure builder, then rendered by a thin DOM shell.
 */

declare const brand: unique symbol;

type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type PlayerId = Brand<string, "PlayerId">;
export type TeamCode = Brand<string, "TeamCode">;
export type IsoDateString = Brand<string, "IsoDateString">;
export type HexColor = Brand<string, "HexColor">;
export type AssetPath = Brand<string, "AssetPath">;

export type PotIndex = 1 | 2 | 3 | 4;

export interface ApiPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly avatar: AssetPath;
  readonly color: HexColor;
  readonly avatarPosition?: string;
}

export interface ApiTeam {
  readonly code: TeamCode;
  readonly name: string;
  readonly pot: PotIndex;
  readonly flag: string;
}

export interface ApiCageFilm {
  readonly title: string;
  readonly year: number;
  readonly rtScore: number;
}

export interface ApiDrawPick {
  readonly player: PlayerId;
  readonly team: TeamCode;
  readonly pot: PotIndex;
  readonly film: string;
  readonly rtScore: number;
  readonly multiplier: number;
  readonly order: number;
}

export interface ApiDraw {
  readonly seed: string;
  readonly createdAt: IsoDateString;
  readonly players: readonly ApiPlayer[];
  readonly picks: readonly ApiDrawPick[];
}

export interface ApiTeamBreakdown {
  readonly code: TeamCode;
  readonly matchPoints: number;
  readonly progressionPoints: number;
  readonly goalsScored: number;
  readonly multiplier: number;
  readonly film: string;
  readonly rtScore: number;
  readonly highlight: readonly string[];
}

export interface ApiPlayerStanding {
  readonly playerId: PlayerId;
  readonly total: number;
  readonly matchPoints: number;
  readonly progressionPoints: number;
  readonly goalsScored: number;
  readonly teams: readonly ApiTeamBreakdown[];
}

export interface ApiStandings {
  readonly asOf: IsoDateString;
  readonly rows: readonly ApiPlayerStanding[];
}

export type MatchStage =
  | "GROUP_STAGE"
  | "LAST_32"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "POSTPONED"
  | "SUSPENDED"
  | "CANCELLED";

export interface ApiMatch {
  readonly id: number;
  readonly utcDate: IsoDateString;
  readonly status: MatchStatus;
  readonly stage: MatchStage;
  readonly group?: string;
  readonly homeCode: TeamCode | null;
  readonly awayCode: TeamCode | null;
  readonly homeGoals: number | null;
  readonly awayGoals: number | null;
  readonly winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  readonly duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
  readonly penalties?: { readonly home: number; readonly away: number } | null;
}

export interface CeremonyStateSnapshot {
  /** Validated /api/state payload captured once when /ceremony/ loads. */
  readonly players: readonly ApiPlayer[];
  readonly teams: readonly ApiTeam[];
  readonly films: readonly ApiCageFilm[];
  readonly draw: ApiDraw;
  readonly standings: ApiStandings;
  readonly recent: readonly ApiMatch[];
  readonly lastUpdated: IsoDateString | null;
  readonly tournamentStart: IsoDateString | null;
}

export interface CeremonyAssets {
  readonly heroImage: AssetPath;
  readonly ogImage: AssetPath;
}

export interface PlayerResult {
  readonly player: ApiPlayer;
  readonly standing: ApiPlayerStanding;
  readonly place: number;
}

export interface TeamStory {
  readonly team: ApiTeam;
  readonly owner: ApiPlayer;
  readonly breakdown: ApiTeamBreakdown;
  readonly film: ApiDrawPick;
}

export interface FilmStory {
  readonly title: string;
  readonly rtScore: number;
  readonly multiplier: number;
  readonly team: ApiTeam;
  readonly owner: ApiPlayer;
}

export interface ParsedScoringHighlight {
  readonly dateLabel: string;
  readonly opponentCode: TeamCode;
  readonly scoreLabel: string;
  readonly points: number;
  readonly notes: readonly string[];
}

export type SlideTone =
  | "champion"
  | "podium"
  | "team"
  | "film"
  | "chaos"
  | "closing";

export interface SlideBase {
  readonly id: string;
  readonly kind: CeremonySlideKind;
  readonly tone: SlideTone;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly accentPlayerId?: PlayerId;
}

export type CeremonySlideKind =
  | "winner-hero"
  | "podium"
  | "champion-team"
  | "player-wrapped"
  | "team-gallery"
  | "cage-film"
  | "cageathon-rules"
  | "closing";

export interface WinnerHeroSlide extends SlideBase {
  readonly kind: "winner-hero";
  readonly tone: "champion";
  readonly heroImage: AssetPath;
  readonly winner: PlayerResult;
  readonly winningTeam?: TeamStory;
}

export interface PodiumSlide extends SlideBase {
  readonly kind: "podium";
  readonly tone: "podium";
  readonly standings: readonly PlayerResult[];
}

export interface ChampionTeamSlide extends SlideBase {
  readonly kind: "champion-team";
  readonly tone: "team";
  readonly championTeam: TeamStory;
  readonly finalMatch?: ApiMatch;
}

export interface PlayerWrappedSlide extends SlideBase {
  readonly kind: "player-wrapped";
  readonly tone: "team";
  readonly player: PlayerResult;
  readonly topTeam: TeamStory | null;
  readonly statLines: readonly string[];
}

export interface TeamGallerySlide extends SlideBase {
  readonly kind: "team-gallery";
  readonly tone: "team";
  readonly owner: PlayerResult;
  readonly teams: readonly TeamStory[];
}

export interface CageFilmSlide extends SlideBase {
  readonly kind: "cage-film";
  readonly tone: "film";
  readonly films: readonly FilmStory[];
  readonly caption: string;
}

export interface CageathonRulesSlide extends SlideBase {
  readonly kind: "cageathon-rules";
  readonly tone: "chaos";
  readonly rules: readonly CeremonyRule[];
}

export interface ClosingSlide extends SlideBase {
  readonly kind: "closing";
  readonly tone: "closing";
  readonly heroImage: AssetPath;
  readonly winner: PlayerResult;
}

export type CeremonySlide =
  | WinnerHeroSlide
  | PodiumSlide
  | ChampionTeamSlide
  | PlayerWrappedSlide
  | TeamGallerySlide
  | CageFilmSlide
  | CageathonRulesSlide
  | ClosingSlide;

export interface CeremonyRule {
  readonly label: string;
  readonly explanation: string;
}

export interface CeremonyDeck {
  readonly generatedAt: IsoDateString;
  readonly sourceAsOf: IsoDateString | null;
  readonly assets: CeremonyAssets;
  readonly champion: PlayerResult;
  readonly slides: readonly CeremonySlide[];
}

export interface LoadCeremonySnapshotOptions {
  readonly endpoint: string;
  readonly fetchImpl?: typeof fetch;
}

export interface CeremonyAssetInput {
  readonly heroImage: string;
  readonly ogImage: string;
}

export interface RenderCeremonyOptions {
  readonly host: HTMLElement;
  readonly deck: CeremonyDeck;
  readonly initialSlideId?: string;
}

export interface CeremonyRenderHandle {
  readonly currentSlideId: string;
  readonly destroy: () => void;
  readonly next: () => void;
  readonly previous: () => void;
  readonly goTo: (slideId: string) => void;
}

/** Fetch once. The ceremony should not poll or mutate under the viewer. */
export async function loadCeremonySnapshot(
  _options: LoadCeremonySnapshotOptions,
): Promise<CeremonyStateSnapshot> {
  throw new Error("not implemented");
}

/** Validates static ceremony asset paths before branded paths enter the deck. */
export function defineCeremonyAssets(_assets: CeremonyAssetInput): CeremonyAssets {
  throw new Error("not implemented");
}

/** Boundary parser for /api/state. Rejects missing draw or standings. */
export function parseCeremonyState(_raw: unknown): CeremonyStateSnapshot {
  throw new Error("not implemented");
}

/** Pure builder. All slide ordering and story selection live here, with no DOM access. */
export function buildCeremonyDeck(
  _snapshot: CeremonyStateSnapshot,
  _assets: CeremonyAssets,
): CeremonyDeck {
  throw new Error("not implemented");
}

/** Finds the winner from standings.rows[0] and joins it to player display data. */
export function selectChampion(_snapshot: CeremonyStateSnapshot): PlayerResult {
  throw new Error("not implemented");
}

/** Joins standings rows to players while preserving standings order. */
export function selectStandings(_snapshot: CeremonyStateSnapshot): readonly PlayerResult[] {
  throw new Error("not implemented");
}

/** Builds owner/team/film records so renderers never repeat draw lookups. */
export function selectTeamStories(_snapshot: CeremonyStateSnapshot): readonly TeamStory[] {
  throw new Error("not implemented");
}

/** Chooses the Cage film beats worth naming in the wrapped sequence. */
export function selectFilmStories(_snapshot: CeremonyStateSnapshot): readonly FilmStory[] {
  throw new Error("not implemented");
}

/** Parses scoring.ts highlight strings for optional match-beat chips. */
export function parseScoringHighlight(_raw: string): ParsedScoringHighlight | null {
  throw new Error("not implemented");
}

/** Thin DOM shell. It renders whatever deck it receives and owns keyboard/touch navigation. */
export function renderCeremony(_options: RenderCeremonyOptions): CeremonyRenderHandle {
  throw new Error("not implemented");
}

/** Exhaustive slide renderer dispatch for the no-build public/ceremony/app.js implementation. */
export function renderSlide(_slide: CeremonySlide): HTMLElement {
  throw new Error("not implemented");
}
