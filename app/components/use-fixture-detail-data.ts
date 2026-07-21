'use client';

import { useEffect, useState } from 'react';
import type {
  ContentTab, EventsData, H2HMeeting, PreMatchData, RecapData, SquadData, TournamentForm,
} from '@/app/components/playground-types';

/**
 * All the per-fixture data the detail panes render: pre-match context, head-to-head
 * history, tournament form, squad lineups, and the recap (stats + events).
 *
 * These used to be ten pieces of state and five fetch paths living directly in
 * Playground. Grouping them here makes the ownership obvious — every value is
 * derived from "which fixture is selected (and which tab is open)", nothing else
 * writes them — and it fixed two inconsistencies that came from the fetches being
 * scattered across effects *and* click handlers:
 *   - head-to-head was fetched twice when selecting a fixture from the feed (once
 *     in the click handler, once by the effect keyed on selectedFixtureId);
 *   - tournament form had no effect at all, so it only loaded when selection went
 *     through a handler that remembered to fetch it, and was stale/blank otherwise.
 * Both are now plain effects keyed on the selection, so every caller just sets
 * selectedFixtureId and the data follows.
 */
export interface FixtureDetailData {
  preMatchData: PreMatchData | null;
  headToHead: H2HMeeting[];
  h2hHome: string;
  h2hAway: string;
  teamForm: TournamentForm | null;
  squadData: SquadData | null;
  squadLoading: boolean;
  recapData: RecapData | null;
  recapLoading: boolean;
  eventsData: EventsData | null;
}

export function useFixtureDetailData(params: {
  selectedFixtureId: string | null;
  selectedMatchupId: string | null;
  contentTab: ContentTab;
  /** Selected fixture's status/kickoff — drive the live/pre-kickoff poll cadences. */
  fixtureStatus?: string | null;
  fixtureStartsAt?: string | null;
}): FixtureDetailData {
  const { selectedFixtureId, selectedMatchupId, contentTab, fixtureStatus, fixtureStartsAt } = params;

  const [preMatchData, setPreMatchData] = useState<PreMatchData | null>(null);
  const [headToHead, setHeadToHead] = useState<H2HMeeting[]>([]);
  const [h2hHome, setH2hHome] = useState<string>('');
  const [h2hAway, setH2hAway] = useState<string>('');
  const [teamForm, setTeamForm] = useState<TournamentForm | null>(null);
  const [squadData, setSquadData] = useState<SquadData | null>(null);
  const [squadLoading, setSquadLoading] = useState(false);
  const [recapData, setRecapData] = useState<RecapData | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [eventsData, setEventsData] = useState<EventsData | null>(null);

  // Pre-match context whenever a fixture is selected.
  useEffect(() => {
    if (!selectedFixtureId) { setPreMatchData(null); return; }
    let cancelled = false;
    fetch(`/api/fixtures/${selectedFixtureId}/pre-match`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled && d.ok) setPreMatchData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedFixtureId]);

  // Head-to-head history whenever a fixture is selected.
  useEffect(() => {
    if (!selectedFixtureId) { setHeadToHead([]); setH2hHome(''); setH2hAway(''); return; }
    let cancelled = false;
    setHeadToHead([]);
    fetch(`/api/fixtures/${selectedFixtureId}/head-to-head`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setHeadToHead(d.meetings ?? []); setH2hHome(d.home ?? ''); setH2hAway(d.away ?? '');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedFixtureId]);

  // Tournament form for both teams. Scoped to the matchup when there is one so the
  // cards can show each side's picks.
  useEffect(() => {
    if (!selectedFixtureId) { setTeamForm(null); return; }
    let cancelled = false;
    setTeamForm(null);
    const url = selectedMatchupId
      ? `/api/fixtures/${selectedFixtureId}/form?matchupId=${selectedMatchupId}`
      : `/api/fixtures/${selectedFixtureId}/form`;
    fetch(url)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.ok) setTeamForm(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedFixtureId, selectedMatchupId]);

  // Squad lineups when the Squad tab is active. Official lineups publish ~20-40 min
  // before kickoff and can change late, so while the match is SCHEDULED and near
  // kickoff we poll every 60s — lineups appear (and late changes surface) without
  // the user having to reopen the tab. Silent refreshes don't flash the loading
  // state or blank existing data.
  useEffect(() => {
    if (contentTab !== 'squad' || !selectedFixtureId) { setSquadData(null); return; }

    let cancelled = false;

    const fetchSquad = async (silent: boolean) => {
      if (!silent) { setSquadLoading(true); setSquadData(null); }
      try {
        const d = await fetch(`/api/fixtures/${selectedFixtureId}/lineups`, { cache: 'no-store' }).then(r => r.json());
        if (!cancelled) setSquadData(d);
      } catch {
        if (!cancelled && !silent) setSquadData({ available: false, reason: 'api_error', home: null, away: null });
      } finally {
        if (!cancelled && !silent) setSquadLoading(false);
      }
    };

    fetchSquad(false);

    let interval: ReturnType<typeof setInterval> | null = null;
    const msToKickoff = fixtureStartsAt ? new Date(fixtureStartsAt).getTime() - Date.now() : Infinity;
    if (fixtureStatus === 'SCHEDULED' && msToKickoff < 90 * 60 * 1000) {
      interval = setInterval(() => fetchSquad(true), 60_000);
    }

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [contentTab, selectedFixtureId, fixtureStatus, fixtureStartsAt]);

  // Match statistics + events when the Recap tab is active. While the match is LIVE,
  // refresh on an interval so the timeline and stats keep up during play. Silent
  // refreshes don't flash the loading state or blank the existing data. Backend
  // caches LIVE stats/events for 2 min, so a 15s poll surfaces new data promptly
  // without extra API cost (faster just re-reads cache).
  useEffect(() => {
    if (contentTab !== 'recap' || !selectedFixtureId) { setRecapData(null); setEventsData(null); return; }

    let cancelled = false;

    const fetchRecap = async (silent: boolean) => {
      if (!silent) { setRecapLoading(true); setRecapData(null); setEventsData(null); }
      try {
        const [stats, events] = await Promise.all([
          fetch(`/api/fixtures/${selectedFixtureId}/statistics`, { cache: 'no-store' }).then(r => r.json()),
          fetch(`/api/fixtures/${selectedFixtureId}/events`,    { cache: 'no-store' }).then(r => r.json()),
        ]);
        if (cancelled) return;
        setRecapData(stats);
        setEventsData(events);
      } catch {
        // On a silent refresh, keep the last good data rather than wiping it to an error
        if (!cancelled && !silent) {
          setRecapData({ available: false, reason: 'api_error', homeTeam: null, awayTeam: null, stats: [] });
        }
      } finally {
        if (!cancelled && !silent) setRecapLoading(false);
      }
    };

    fetchRecap(false);

    let interval: ReturnType<typeof setInterval> | null = null;
    if (fixtureStatus === 'LIVE') {
      interval = setInterval(() => fetchRecap(true), 15_000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [contentTab, selectedFixtureId, fixtureStatus]);

  return {
    preMatchData, headToHead, h2hHome, h2hAway, teamForm,
    squadData, squadLoading, recapData, recapLoading, eventsData,
  };
}
