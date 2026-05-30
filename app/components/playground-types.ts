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

export type ContentTab = 'details' | 'squad' | 'recap';
export type DrawerTab = 'chat' | 'calendar' | 'tv';
export type MobileView = 'feed' | 'content';
export type NoticeTone = 'ok' | 'error' | 'info';
