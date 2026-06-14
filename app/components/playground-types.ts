// Shared frontend types for the playground and extracted components.

export type Tournament = {
  id: string;
  label: string;
};

export type Matchup = {
  matchupId: string;
  inviteCode: string;
  status: string;
  tournamentId: string;
  createdAt: string;
  joinedAt: string;
  isCreator: boolean;
  opponentDisplayName: string | null;
  opponentEmail: string | null;
  opponentAvatarUrl: string | null;
};

export type Round = {
  id: string;
  stage: string;
  order_index: number;
  is_complete: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type Fixture = {
  id: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenScore: number | null;
  awayPenScore: number | null;
  status: string;
  isLocked: boolean;
  myPickSide: 'HOME' | 'AWAY' | null;
  opponentPickSide: 'HOME' | 'AWAY' | null;
  groupName: string | null;
  venue: string | null;
  city: string | null;
  matchday: number | null;
};

export type ParticipantStanding = {
  participantId: string;
  appUserId: string;
  displayName: string | null;
  email: string;
  tournamentPoints: number;
  totalGoalsTiebreak: number;
};

export type RoundResultParticipant = {
  participantId: string;
  displayName: string | null;
  email: string;
  points: number;
  tiebreakGoals: number;
};

export type RoundResultEntry = {
  roundId: string;
  stage: string;
  orderIndex: number;
  participants: RoundResultParticipant[];
};

export type TournamentFormFixture = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startsAt: string;
  stage: string;
  groupName: string | null;
  isLocked: boolean;
  myPickSide: 'HOME' | 'AWAY' | null;
  opponentPickSide: 'HOME' | 'AWAY' | null;
};

export type TournamentForm = {
  homeTeam: string;
  awayTeam: string;
  homeFixtures: TournamentFormFixture[];
  awayFixtures: TournamentFormFixture[];
};

// ── Pre-match contextual data ──────────────────────────────────────────────────

export type PreMatchPredictions = {
  homePercent: number;
  drawPercent: number;
  awayPercent: number;
  advice: string;
  homeForm: string; // e.g. "WWDLW"
  awayForm: string;
};

export type GroupStandingRow = {
  teamName: string;
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
  isHome: boolean; isAway: boolean;
};

export type TeamGoals = { avgFor: string; avgAgainst: string };

export type InjuryEntry = {
  playerName: string;
  type: string; // 'Injured' | 'Suspended' | 'Doubtful'
  reason: string;
};

export type MatchOdds = { home: string; draw: string; away: string; bookmaker: string };

export type TopScorer = {
  playerName: string; teamName: string; goals: number; assists: number;
};

export type StyleComparison = {
  form: { home: number; away: number };
  att:  { home: number; away: number };
  def:  { home: number; away: number };
};

export type PreMatchData = {
  homeTeam: string;
  awayTeam: string;
  predictions:  PreMatchPredictions | null;
  standings:    { group: string; rows: GroupStandingRow[] } | null;
  homeGoals:    TeamGoals | null;
  awayGoals:    TeamGoals | null;
  injuries:     { home: InjuryEntry[]; away: InjuryEntry[] } | null;
  odds:         MatchOdds | null;
  topScorers:   TopScorer[] | null;
  comparison:   StyleComparison | null;
};

// ── Match statistics (Recap tab) ───────────────────────────────────────────────

// ── Match events (timeline) ────────────────────────────────────────────────────

export type MatchEvent = {
  minute: number;
  extraMinute: number | null;
  team: string;
  player: string;
  assist: string | null;
  type: 'Goal' | 'Card' | 'Subst' | 'Var';
  detail: string;
};

export type EventsData = {
  available: boolean;
  reason?: string;
  homeTeam: string;
  awayTeam: string;
  events: MatchEvent[];
};

// ── Match statistics (Recap tab) ───────────────────────────────────────────────

export type StatRow = {
  type: string;
  home: number | string | null;
  away: number | string | null;
};

export type RecapData = {
  available: boolean;
  reason?: 'no_external_id' | 'no_api_key' | 'not_final' | 'no_stats' | 'api_error';
  homeTeam: string | null;
  awayTeam: string | null;
  stats: StatRow[];
};

export type LineupPlayer = {
  name: string;
  number: number;
  pos: string;    // 'G' | 'D' | 'M' | 'F'
  grid: string | null; // "row:col" e.g. "2:3"
};

export type TeamLineup = {
  teamName: string;
  formation: string;   // e.g. "4-3-3"
  coachName: string | null;
  starters: LineupPlayer[];
  substitutes: LineupPlayer[];
};

export type SquadData = {
  available: boolean;
  reason?: 'not_yet_available' | 'no_external_id' | 'no_api_key' | 'api_error';
  home: TeamLineup | null;
  away: TeamLineup | null;
};

export type ContentTab = 'details' | 'squad' | 'recap';
export type DrawerTab = 'chat' | 'calendar';
export type MobileView = 'home' | 'feed' | 'content' | 'chat' | 'profile';
export type NoticeTone = 'ok' | 'error' | 'info';

// GA4 gtag global — only present in production builds
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
