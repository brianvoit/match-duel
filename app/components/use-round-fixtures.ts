'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContentTab, Fixture, NoticeTone, Round } from '@/app/components/playground-types';
import { computePickPoints } from '@/app/components/playground-utils';

/**
 * The round + fixture + pick layer: the current round and the whole round list,
 * the fixtures in view (current round plus every other round loaded read-only for
 * the bracket), the user's picks and the pick-order for the selected matchup, and
 * which fixture is open.
 *
 * This is the core game state — it drives the feed, scoring, locking and the live
 * score poll — and it keys off the selected matchup (passed in from useMatchups).
 * It previously sat inline in Playground interleaved with matchup, profile and UI
 * state; grouping it here makes the one input obvious (which matchup is selected)
 * and keeps the live-poll / load / submit flow in one place.
 */
export interface UseRoundFixturesResult {
  currentRound: Round | null;
  allRounds: Round[];
  fixtures: Fixture[];
  /** Fixtures for every round other than the current one, keyed by round id. */
  completedRoundFixtures: Record<string, Fixture[]>;
  pickMap: Record<string, 'HOME' | 'AWAY'>;
  setPickMap: React.Dispatch<React.SetStateAction<Record<string, 'HOME' | 'AWAY'>>>;
  pickOrder: Record<string, string>;
  myParticipantId: string | null;
  selectedFixtureId: string | null;
  setSelectedFixtureId: React.Dispatch<React.SetStateAction<string | null>>;
  /** The selected fixture, looked up across the current and other-round lists. */
  selectedFixture: Fixture | null;
  /** True while any fixture in view is LIVE (drives the live dot + the poll). */
  hasLiveFixtures: boolean;
  /** Running points for the current round's FINAL fixtures, added on top of
   *  already-settled rounds in the H2H scorebug. */
  provisionalPoints: { mine: number; opp: number };
  loadCurrentRoundAndFixtures: (matchupId?: string | null) => Promise<void>;
  submitSinglePick: (fixtureId: string) => Promise<void>;
}

export function useRoundFixtures(params: {
  selectedMatchupId: string | null;
  contentTab: ContentTab;
  showNotice: (tone: NoticeTone, text: string) => void;
  setLoading: (v: boolean) => void;
  fetchNotifSummary: () => void;
}): UseRoundFixturesResult {
  const { selectedMatchupId, contentTab, showNotice, setLoading, fetchNotifSummary } = params;

  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [allRounds, setAllRounds] = useState<Round[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [pickMap, setPickMap] = useState<Record<string, 'HOME' | 'AWAY'>>({});
  const [pickOrder, setPickOrder] = useState<Record<string, string>>({});
  const [completedRoundFixtures, setCompletedRoundFixtures] = useState<Record<string, Fixture[]>>({});
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const hasLiveFixtures = useMemo(
    () => fixtures.some((f) => f.status === 'LIVE'),
    [fixtures]
  );

  // Live provisional points from the current round's FINAL fixtures. Official
  // tournament_points only settle once a whole round completes, so without this
  // the H2H scorebug would read 0–0 for the entire group stage. We add this
  // running tally on top of already-settled rounds; once the round settles its
  // fixtures leave `fixtures` (currentRound advances), so there's no double-count.
  const provisionalPoints = useMemo(() => {
    if (!currentRound) return { mine: 0, opp: 0 };
    let mine = 0;
    let opp = 0;
    for (const f of fixtures) {
      if (f.status !== 'FINAL') continue;
      mine += computePickPoints(f, pickMap[f.id] ?? f.myPickSide, currentRound.stage) ?? 0;
      opp  += computePickPoints(f, f.opponentPickSide, currentRound.stage) ?? 0;
    }
    return { mine, opp };
  }, [fixtures, pickMap, currentRound]);

  const selectedFixture = useMemo(() => {
    if (!selectedFixtureId) return null;
    const inCurrent = fixtures.find(f => f.id === selectedFixtureId);
    if (inCurrent) return inCurrent;
    for (const roundFix of Object.values(completedRoundFixtures)) {
      const found = roundFix.find(f => f.id === selectedFixtureId);
      if (found) return found;
    }
    return null;
  }, [fixtures, completedRoundFixtures, selectedFixtureId]);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  async function loadCurrentRoundAndFixtures(matchupId: string | null = selectedMatchupId) {
    if (!matchupId) return;
    setLoading(true);
    const roundRes = await fetch(`/api/rounds/current?matchupId=${matchupId}`, {
      cache: 'no-store'
    });
    const roundPayload = await roundRes.json();
    if (!roundRes.ok || !roundPayload.ok) {
      showNotice('error', roundPayload.error ?? 'Failed to load round.');
      setLoading(false);
      return;
    }
    const round = (roundPayload.currentRound as Round | null) ?? null;
    setCurrentRound(round);
    const rounds = (roundPayload.rounds as Round[] | null) ?? [];
    setAllRounds(rounds);

    // Background-fetch fixtures for every OTHER round so the whole bracket shows
    // in the feed read-only: earlier rounds (history, or rounds a late matchup
    // didn't play) and future rounds (the knockout bracket filling in as group /
    // knockout results land — visible to everyone, early or late).
    const otherRounds = rounds.filter(r => r.id !== round?.id);
    if (otherRounds.length > 0) {
      Promise.all(
        otherRounds.map(async (r) => {
          const url = matchupId
            ? `/api/rounds/${r.id}/fixtures?matchupId=${matchupId}`
            : `/api/rounds/${r.id}/fixtures`;
          const res = await fetch(url, { cache: 'no-store' });
          const payload = await res.json();
          return { roundId: r.id, fixtures: (payload.fixtures ?? []) as Fixture[] };
        })
      ).then((results) => {
        const map: Record<string, Fixture[]> = {};
        for (const { roundId, fixtures } of results) map[roundId] = fixtures;
        setCompletedRoundFixtures(map);
      }).catch(() => {});
    } else {
      setCompletedRoundFixtures({});
    }

    if (!round) {
      setFixtures([]);
      setPickMap({});
      setLoading(false);
      return;
    }
    const fixtureUrl = matchupId
      ? `/api/rounds/${round.id}/fixtures?matchupId=${matchupId}`
      : `/api/rounds/${round.id}/fixtures`;
    const pickOrderUrl = matchupId
      ? `/api/matchups/${matchupId}/rounds/${round.id}/pick-order`
      : null;
    const fetches: Promise<Response>[] = [fetch(fixtureUrl, { cache: 'no-store' })];
    if (pickOrderUrl) fetches.push(fetch(pickOrderUrl, { cache: 'no-store' }));
    const [fixtureRes, pickOrderRes] = await Promise.all(fetches);
    const fixturePayload = await fixtureRes.json();
    if (!fixtureRes.ok || !fixturePayload.ok) {
      showNotice('error', fixturePayload.error ?? 'Failed to load fixtures.');
      setLoading(false);
      return;
    }
    const rows = (fixturePayload.fixtures ?? []) as Fixture[];
    setFixtures(rows);
    const nextPickMap: Record<string, 'HOME' | 'AWAY'> = {};
    for (const f of rows) {
      if (f.myPickSide) nextPickMap[f.id] = f.myPickSide;
    }
    setPickMap(nextPickMap);
    if (pickOrderRes?.ok) {
      const pickOrderPayload = await pickOrderRes.json();
      if (pickOrderPayload.ok) {
        const order: Record<string, string> = {};
        for (const entry of pickOrderPayload.pickOrder ?? []) {
          order[entry.fixtureId] = entry.firstPickerParticipantId;
        }
        setPickOrder(order);
        setMyParticipantId(pickOrderPayload.myParticipantId ?? null);
      }
    }
    setLoading(false);
  }

  async function submitSinglePick(fixtureId: string) {
    if (!selectedMatchupId || !currentRound) {
      showNotice('error', 'Select a matchup first.');
      return;
    }
    const side = pickMap[fixtureId];
    if (!side) { showNotice('error', 'Choose a team first.'); return; }
    setLoading(true);
    const res = await fetch(
      `/api/matchups/${selectedMatchupId}/rounds/${currentRound.id}/picks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks: [{ fixtureId, side }] })
      }
    );
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to save pick.');
      setLoading(false);
      return;
    }
    showNotice('ok', 'Pick saved!');
    await loadCurrentRoundAndFixtures();
    setLoading(false);
    fetchNotifSummary();
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  // Mount: load the schedule immediately (no matchup needed) so users see the
  // fixtures right away, before a matchup is selected.
  useEffect(() => {
    loadCurrentRoundAndFixtures(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload fixtures with pick data overlaid whenever the selected matchup changes.
  // With no matchup, keep the fixtures visible but clear the pick data.
  useEffect(() => {
    if (!selectedMatchupId) {
      setPickMap({});
      setPickOrder({});
      setMyParticipantId(null);
      return;
    }
    loadCurrentRoundAndFixtures(selectedMatchupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchupId]);

  // Live score polling — 15s, only while a fixture in view is actually LIVE and
  // the details tab is open. Patches the changing live fields onto the fixtures
  // in place so picks/scroll position are preserved.
  useEffect(() => {
    if (contentTab !== 'details' || !selectedMatchupId || !hasLiveFixtures) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/matchups/${selectedMatchupId}/live`, { cache: 'no-store' });
      if (!res.ok) return;
      const payload = await res.json();
      if (!payload.ok) return;
      const liveFixtures = (payload.fixtures ?? []) as Fixture[];
      if (!liveFixtures.length) return;
      setFixtures((prev) =>
        prev.map((f) => {
          const u = liveFixtures.find((lf) => lf.id === f.id);
          if (!u) return f;
          return {
            ...f,
            homeScore: u.homeScore,
            awayScore: u.awayScore,
            homePenScore: u.homePenScore,
            awayPenScore: u.awayPenScore,
            status: u.status,
            elapsedMinute: u.elapsedMinute ?? null,
            period: u.period ?? null,
            lastSyncedAt: u.lastSyncedAt ?? f.lastSyncedAt,
            isLocked: u.isLocked,
            opponentPickSide: u.opponentPickSide ?? f.opponentPickSide
          };
        })
      );
    }, 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTab, selectedMatchupId, hasLiveFixtures]);

  return {
    currentRound, allRounds, fixtures, completedRoundFixtures,
    pickMap, setPickMap, pickOrder, myParticipantId,
    selectedFixtureId, setSelectedFixtureId, selectedFixture,
    hasLiveFixtures, provisionalPoints,
    loadCurrentRoundAndFixtures, submitSinglePick,
  };
}
