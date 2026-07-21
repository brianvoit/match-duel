'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Matchup, ParticipantStanding, RoundResultEntry, Tournament, NoticeTone,
} from '@/app/components/playground-types';

/**
 * The user's matchups: which duels they're in, the order they've arranged them
 * in, which one is selected, and the head-to-head standings for it.
 *
 * This is the layer *above* fixtures and picks — selection here is the input the
 * fixture/pick layer keys off, so it owns `selectedMatchupId` and every value
 * derived from the matchup list (ordering, the selected row, the opponent's
 * avatar, the tournament catalogue). Playground previously interleaved these
 * eight pieces of state with the fixture and profile state, and re-derived the
 * ordering in two places.
 */
export interface UseMatchupsResult {
  matchups: Matchup[];
  /** Matchups in the user's drag-chosen order; unordered ones fall to the end. */
  orderedMatchups: Matchup[];
  selectedMatchupId: string | null;
  setSelectedMatchupId: (id: string | null) => void;
  selectedMatchup: Matchup | null;
  /** Opponent avatar for the selected matchup, or null. */
  oppAvatarUrl: string | null;
  // Desktop drag-to-reorder
  dragMatchupId: string | null;
  setDragMatchupId: (id: string | null) => void;
  dragOverMatchupId: string | null;
  setDragOverMatchupId: (id: string | null) => void;
  reorderMatchups: (fromId: string, toId: string) => void;
  // Standings for the selected matchup (drives the topbar H2H scorebug)
  standing: ParticipantStanding[];
  roundResults: RoundResultEntry[];
  loadStandings: (matchupId: string) => Promise<void>;
  /** Per-matchup live duel tallies, keyed by matchup id. */
  matchupScores: Record<string, { mine: number; opp: number }>;
  // Tournament catalogue derived from the matchup rows
  tournaments: Tournament[];
  activeTournament: Tournament | null;
  loadMatchups: () => Promise<void>;
}

export function useMatchups(params: {
  showNotice: (tone: NoticeTone, text: string) => void;
  setLoading: (v: boolean) => void;
  /** Prefetches the bell badge once matchups land. */
  fetchNotifSummary: () => void;
  /** Live tallies are only fetched while the mobile matchup drawer is open. */
  matchupDrawerOpen: boolean;
}): UseMatchupsResult {
  const { showNotice, setLoading, fetchNotifSummary, matchupDrawerOpen } = params;

  const [matchups, setMatchups] = useState<Matchup[]>([]);
  // Desktop drag-to-reorder: a user-defined ordering of matchups, persisted locally.
  const [matchupOrder, setMatchupOrder] = useState<string[]>([]);
  const [dragMatchupId, setDragMatchupId] = useState<string | null>(null);
  const [dragOverMatchupId, setDragOverMatchupId] = useState<string | null>(null);
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [standing, setStanding] = useState<ParticipantStanding[]>([]);
  const [roundResults, setRoundResults] = useState<RoundResultEntry[]>([]);
  const [matchupScores, setMatchupScores] = useState<Record<string, { mine: number; opp: number }>>({});

  // ── Derived ────────────────────────────────────────────────────────────────

  // Unique tournaments derived from matchup data
  // TODO: replace with /api/tournaments fetch once endpoint exists
  const tournaments = useMemo<Tournament[]>(() => {
    const seen = new Set<string>();
    return matchups.reduce<Tournament[]>((acc, m) => {
      if (!seen.has(m.tournamentId)) {
        seen.add(m.tournamentId);
        acc.push({ id: m.tournamentId, label: "FIFA World Cup '26" });
      }
      return acc;
    }, []);
  }, [matchups]);

  const activeTournament = tournaments[0] ?? null;

  const selectedMatchup = useMemo(
    () => matchups.find((m) => m.matchupId === selectedMatchupId) ?? null,
    [matchups, selectedMatchupId]
  );

  const oppAvatarUrl = selectedMatchup?.opponentAvatarUrl ?? null;

  // Matchups in the user's chosen order; any not in the saved order fall to the end.
  const orderedMatchups = useMemo(() => {
    if (matchupOrder.length === 0) return matchups;
    const rank = new Map(matchupOrder.map((id, i) => [id, i]));
    return [...matchups].sort(
      (a, b) => (rank.get(a.matchupId) ?? Infinity) - (rank.get(b.matchupId) ?? Infinity)
    );
  }, [matchups, matchupOrder]);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const loadMatchups = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/matchups', { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to load matchups.');
      setLoading(false);
      return;
    }
    const rows = (payload.matchups ?? []) as Matchup[];
    setMatchups(rows);
    // Auto-select the first matchup when nothing is selected. This reads `prev`
    // rather than a captured `selectedMatchupId` so it stays correct however the
    // caller got here — notably after cancelling the selected matchup, where the
    // old captured-closure version saw the *cancelled* id and left the user on
    // no matchup at all.
    setSelectedMatchupId((prev) => prev ?? rows[0]?.matchupId ?? null);
    setLoading(false);
    // Silently prefetch notification counts so bell badge is ready
    fetchNotifSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStandings = useCallback(async (matchupId: string) => {
    const res = await fetch(`/api/matchups/${matchupId}/standings`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || !payload.ok) return;
    setStanding(payload.standing ?? []);
    setRoundResults(payload.roundResults ?? []);
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Load the saved matchup order after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('matchup-order') || '[]');
      if (Array.isArray(saved)) setMatchupOrder(saved.filter((x): x is string => typeof x === 'string'));
    } catch { /* ignore */ }
  }, []);

  // Standings for the topbar H2H follow the selection.
  useEffect(() => {
    if (!selectedMatchupId) {
      setStanding([]);
      setRoundResults([]);
      return;
    }
    loadStandings(selectedMatchupId);
  }, [selectedMatchupId, loadStandings]);

  // Per-matchup live duel tallies (mine vs opponent), shown next to each row in
  // the mobile matchup drawer. One call returns every matchup's live score
  // (settled + in-progress), matching the top scorebug.
  useEffect(() => {
    if (!matchupDrawerOpen) return;
    let cancelled = false;
    fetch('/api/matchups/tallies', { cache: 'no-store' })
      .then(r => r.json())
      .then(p => { if (!cancelled && p.ok) setMatchupScores(p.tallies ?? {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchupDrawerOpen]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function reorderMatchups(fromId: string, toId: string) {
    if (fromId === toId) return;
    const ids = orderedMatchups.map((m) => m.matchupId);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setMatchupOrder(ids);
    try { localStorage.setItem('matchup-order', JSON.stringify(ids)); } catch { /* ignore */ }
  }

  return {
    matchups, orderedMatchups,
    selectedMatchupId, setSelectedMatchupId, selectedMatchup, oppAvatarUrl,
    dragMatchupId, setDragMatchupId, dragOverMatchupId, setDragOverMatchupId, reorderMatchups,
    standing, roundResults, loadStandings, matchupScores,
    tournaments, activeTournament,
    loadMatchups,
  };
}
