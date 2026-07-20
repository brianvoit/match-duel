import type { StageName } from '@/lib/domain/types';

/**
 * Tournament shapes we support. Each format is just an ordered stage list — the
 * provisioner turns it into `round` rows (order_index = position + 1), and the
 * rest of the pipeline keys off `round.stage`, so adding a format needs nothing
 * more than an entry here (plus a matching bracket in lib/domain/bracket.ts for
 * its knockout stages).
 *
 * The men's 2026 tournament is 48 teams (12 groups → 32-team Round of 32). The
 * women's 2027 tournament is 32 teams (8 groups → 16-team Round of 16, no Round
 * of 32, no best-third-place qualification).
 */
export type TournamentFormatId = 'MENS_48' | 'WOMENS_32';

export interface TournamentFormat {
  id: TournamentFormatId;
  label: string;
  /** Ordered from first to last; the provisioner assigns order_index 1..n. */
  stages: StageName[];
}

export const TOURNAMENT_FORMATS: Record<TournamentFormatId, TournamentFormat> = {
  MENS_48: {
    id: 'MENS_48',
    label: "Men's World Cup (48 teams)",
    stages: ['GROUP', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'],
  },
  WOMENS_32: {
    id: 'WOMENS_32',
    label: "Women's World Cup (32 teams)",
    stages: ['GROUP', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'],
  },
};

export function isTournamentFormatId(v: string): v is TournamentFormatId {
  return v === 'MENS_48' || v === 'WOMENS_32';
}
