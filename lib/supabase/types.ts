export interface AppUserRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface TournamentRow {
  id: string;
  year: number;
  is_active: boolean;
}

export interface MatchupRow {
  id: string;
  tournament_id: string;
  invite_code: string;
  status: string;
  created_by: string;
  created_at: string;
}

export interface MatchupParticipantRow {
  id: string;
  matchup_id: string;
  user_id: string;
  joined_at: string;
}
