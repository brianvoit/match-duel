import { createServiceRoleClient } from '@/lib/supabase/service';
import { ScoringConfig, StageName } from '@/lib/domain/types';
import { WORLD_CUP_2026_SCORING } from '@/lib/domain/scoring';

interface ScoringConfigRow {
  stage: string;
  win_points: number;
  draw_points: number;
}

export async function getScoringConfigForTournament(tournamentId: string): Promise<ScoringConfig> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from('scoring_config')
    .select('stage, win_points, draw_points')
    .eq('tournament_id', tournamentId);

  if (error) {
    throw new Error(`Failed to load scoring config: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return WORLD_CUP_2026_SCORING;
  }

  const rows = data as ScoringConfigRow[];
  const stagePoints = {} as Record<StageName, number>;
  let drawPoint = 1;

  for (const row of rows) {
    stagePoints[row.stage as StageName] = row.win_points;
    drawPoint = row.draw_points;
  }

  return { stagePoints, drawPoint };
}
