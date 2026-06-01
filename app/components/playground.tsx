'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TEAM_INFO, teamCode, teamFlag } from '@/lib/data/teamInfo';
import { ChatPanel } from '@/app/components/chat-panel';
import { ScoreChartModal } from '@/app/components/score-chart-modal';
import { ProfileSettings } from '@/app/components/profile-settings';
import { PickSummaryContent } from '@/app/components/pick-summary-content';
import {
  Tournament, Matchup, Round, Fixture,
  ParticipantStanding, RoundResultParticipant, RoundResultEntry,
  TournamentForm, TournamentFormFixture,
  ContentTab, DrawerTab, MobileView, NoticeTone,
} from '@/app/components/playground-types';
import {
  STAGE_POINTS, STAGE_LABELS, fmtStage, computePickPoints,
  computeMatchdays, initials, urlBase64ToUint8Array, StatusGlyph,
} from '@/app/components/playground-utils';

// Types are imported from playground-types.ts

interface PlaygroundProps {
  userEmail: string;
  userAvatarUrl?: string | null;
}

// Static tournament catalogue — shown in the top-bar dropdown.
// Active matchup determines which entry is highlighted; others are future/historical.
const TOURNAMENT_CATALOGUE = [
  { id: 'wc-mens-2026',   label: "World Cup '26",         active: true  },
  { id: 'wc-womens-2027', label: "Women's World Cup '27", active: false },
  { id: 'wc-mens-2022',   label: "World Cup '22",         active: false },
  { id: 'wc-womens-2023', label: "Women's World Cup '23", active: false },
  { id: 'wc-mens-2018',   label: "World Cup '18",         active: false },
  { id: 'wc-womens-2019', label: "Women's World Cup '19", active: false },
  { id: 'wc-mens-2014',   label: "World Cup '14",         active: false },
  { id: 'wc-womens-2015', label: "Women's World Cup '15", active: false },
];

// Utilities imported from playground-utils.tsx

// ── Component ─────────────────────────────────────────────────────────────────

export function Playground({ userEmail, userAvatarUrl }: PlaygroundProps) {
  // ── Layout state ───────────────────────────────────────────────────────────
  const [leftNavOpen, setLeftNavOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('chat');
  const [contentTab, setContentTab] = useState<ContentTab>('details');
  const [mobileView, setMobileView] = useState<MobileView>('feed');
  const [scoreChartOpen, setScoreChartOpen] = useState(false);

  // ── Menu state ─────────────────────────────────────────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [tournamentMenuOpen, setTournamentMenuOpen] = useState(false);
  const tournamentMenuRef = useRef<HTMLDivElement>(null);
  const hasAutoShownPickSummary = useRef(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [pickSummaryOpen, setPickSummaryOpen] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  const [cancelMatchupId, setCancelMatchupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterGroup, setFilterGroup] = useState<string | null>(null);
  const [filterNoPick, setFilterNoPick] = useState(false);
  const [filterPickable, setFilterPickable] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [allRounds, setAllRounds] = useState<Round[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [pickMap, setPickMap] = useState<Record<string, 'HOME' | 'AWAY'>>({});
  const [pickOrder, setPickOrder] = useState<Record<string, string>>({});
  const [completedRoundFixtures, setCompletedRoundFixtures] = useState<Record<string, Fixture[]>>({});
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [standing, setStanding] = useState<ParticipantStanding[]>([]);
  const [roundResults, setRoundResults] = useState<RoundResultEntry[]>([]);
  const [myAppUserId, setMyAppUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [defaultPickSide, setDefaultPickSide] = useState<'HOME' | 'AWAY'>('HOME');
  const [savingDefaultPick, setSavingDefaultPick] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const [headToHead, setHeadToHead] = useState<{ year: number; stage: string; home: string; away: string; homeGoals: number | null; awayGoals: number | null }[]>([]);
  const [h2hHome, setH2hHome] = useState<string>('');
  const [h2hAway, setH2hAway] = useState<string>('');
  const [teamForm, setTeamForm] = useState<TournamentForm | null>(null);

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

  const hasLiveFixtures = useMemo(
    () => fixtures.some((f) => f.status === 'LIVE'),
    [fixtures]
  );

  const canSubmit = useMemo(() => {
    const unlocked = fixtures.filter((f) => !f.isLocked);
    if (!unlocked.length) return false;
    return unlocked.every((f) => Boolean(pickMap[f.id]));
  }, [fixtures, pickMap]);

  const pickedCount = useMemo(
    () => fixtures.filter((f) => Boolean(pickMap[f.id])).length,
    [fixtures, pickMap]
  );

  const lockedCount = useMemo(() => fixtures.filter((f) => f.isLocked).length, [fixtures]);

  // Distinct groups present in the current fixture list, sorted
  const availableGroups = useMemo(
    () =>
      [...new Set(fixtures.map((f) => f.groupName).filter(Boolean) as string[])].sort(),
    [fixtures]
  );

  // Filtered view for the feed
  const visibleFixtures = useMemo(() => {
    return fixtures.filter((f) => {
      if (filterGroup && f.groupName !== filterGroup) return false;
      if (filterNoPick && (pickMap[f.id] ?? f.myPickSide)) return false;
      if (filterPickable) {
        // "Pickable only" = unlocked AND assigned to me
        const hasPickOrder = Object.keys(pickOrder).length > 0;
        const isMyFixture = !hasPickOrder || pickOrder[f.id] === myParticipantId;
        if (f.isLocked || !isMyFixture) return false;
      }
      return true;
    });
  }, [fixtures, filterGroup, filterNoPick, filterPickable, pickMap, pickOrder, myParticipantId]);

  const selectedMatchup = useMemo(
    () => matchups.find((m) => m.matchupId === selectedMatchupId) ?? null,
    [matchups, selectedMatchupId]
  );

  const oppAvatarUrl = selectedMatchup?.opponentAvatarUrl ?? null;

  const selectedFixture = useMemo(
    () => fixtures.find((f) => f.id === selectedFixtureId) ?? null,
    [fixtures, selectedFixtureId]
  );

  const pickSummaryStats = useMemo(() => {
    const hasPickOrder = Object.keys(pickOrder).length > 0;
    const unpicked = fixtures.filter((f) => {
      if (f.isLocked) return false;
      if (pickMap[f.id] ?? f.myPickSide) return false;
      return !hasPickOrder || pickOrder[f.id] === myParticipantId;
    });
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;
    const in3d = now + 3 * 24 * 60 * 60 * 1000;
    let urgent = 0, soon = 0, later = 0;
    for (const f of unpicked) {
      const t = new Date(f.startsAt).getTime();
      if (t <= in24h) urgent++;
      else if (t <= in3d) soon++;
      else later++;
    }
    return { total: unpicked.length, urgent, soon, later };
  }, [fixtures, pickMap, pickOrder, myParticipantId]);

  // ── Notice ─────────────────────────────────────────────────────────────────

  function showNotice(tone: NoticeTone, text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ tone, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  // ── Sign out ───────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.reload();
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userMenuOpen) return;
    function h(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!tournamentMenuOpen) return;
    function h(e: MouseEvent) {
      if (tournamentMenuRef.current && !tournamentMenuRef.current.contains(e.target as Node))
        setTournamentMenuOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [tournamentMenuOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function h(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [filterOpen]);

  useEffect(() => {
    // Load fixtures immediately (no matchup needed) so users see the schedule right away
    loadCurrentRoundAndFixtures(undefined);
    loadMatchups();
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedMatchupId) {
      // Keep fixtures visible but clear pick/standing data
      setPickMap({});
      setPickOrder({});
      setMyParticipantId(null);
      setStanding([]);
      setRoundResults([]);
      return;
    }
    // Reload fixtures with pick data overlaid + load standings for topbar H2H
    loadCurrentRoundAndFixtures(selectedMatchupId);
    loadStandings(selectedMatchupId);
    setMobileView('content');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchupId]);

  // Reset auto-show flag when active matchup changes so new matchup shows summary fresh
  useEffect(() => {
    hasAutoShownPickSummary.current = false;
  }, [selectedMatchupId]);

  // Auto-show pick summary once per matchup load when there are upcoming unpicked games
  useEffect(() => {
    if (loading) return;
    if (!selectedMatchupId) return;
    if (hasAutoShownPickSummary.current) return;
    if (pickSummaryStats.total === 0) return;
    hasAutoShownPickSummary.current = true;
    setPickSummaryOpen(true);
  }, [loading, selectedMatchupId, pickSummaryStats.total]);

  // 30s live polling
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
            status: u.status,
            isLocked: u.isLocked,
            opponentPickSide: u.opponentPickSide ?? f.opponentPickSide
          };
        })
      );
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTab, selectedMatchupId, hasLiveFixtures]);

  // Apply persisted theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('wc-theme') as 'system' | 'light' | 'dark' | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
      applyThemeClass(saved);
    }
  }, []);

  // Register service worker and check existing push subscription
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setPushSupported(true);
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      swRegistration.current = reg;
      return reg.pushManager.getSubscription();
    }).then((sub) => {
      setPushEnabled(!!sub);
    }).catch(() => {});
  }, []);

  // 30s activity ping
  useEffect(() => {
    const ping = () => fetch('/api/user/active', { method: 'PATCH' }).catch(() => {});
    ping();
    const id = setInterval(ping, 30_000);
    return () => clearInterval(id);
  }, []);

  // Load total unread count on mount
  useEffect(() => {
    fetch('/api/messages/unread-count', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTotalUnread(d.total ?? 0); })
      .catch(() => {});
  }, []);

  // Mark chat as read and reload unread count when chat drawer is opened
  useEffect(() => {
    if (drawerOpen && drawerTab === 'chat' && selectedMatchupId) {
      fetch('/api/messages/unread-count', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (d.ok) setTotalUnread(d.total ?? 0); })
        .catch(() => {});
    }
  }, [drawerOpen, drawerTab, selectedMatchupId]);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  async function loadProfile() {
    const res = await fetch('/api/user/profile', { cache: 'no-store' });
    if (!res.ok) return;
    const payload = await res.json();
    if (payload.ok) {
      setMyAppUserId(payload.id ?? null);
      const name = payload.displayName ?? '';
      setDisplayName(name);
      const parts = name.trim().split(/\s+/);
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
      setDefaultPickSide(payload.defaultPickSide ?? 'HOME');
    }
  }

  async function loadMatchups() {
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
    if (!selectedMatchupId && rows[0]?.matchupId) {
      setSelectedMatchupId(rows[0].matchupId);
    }
    setLoading(false);
  }

  async function loadStandings(matchupId: string) {
    const res = await fetch(`/api/matchups/${matchupId}/standings`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || !payload.ok) return;
    setStanding(payload.standing ?? []);
    setRoundResults(payload.roundResults ?? []);
  }

  async function loadCurrentRoundAndFixtures(matchupId = selectedMatchupId) {
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

    // Background-fetch fixtures for every completed round so they show in the feed
    const completedRounds = rounds.filter(r => r.is_complete);
    if (completedRounds.length > 0) {
      Promise.all(
        completedRounds.map(async (r) => {
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

  async function createMatchup() {
    setLoading(true);
    const res = await fetch('/api/matchups/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const payload = await res.json();
    setLoading(false);
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to create matchup.');
      return;
    }
    setCreatedInviteCode(payload.matchup.inviteCode);
    await loadMatchups();
  }

  async function copyInviteLink(code: string) {
    const link = `${window.location.origin}/join/${code}`;
    await navigator.clipboard.writeText(link);
    setCopyConfirmed(true);
    setTimeout(() => setCopyConfirmed(false), 2000);
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setCreatedInviteCode(null);
    setCopyConfirmed(false);
  }

  async function cancelMatchup() {
    if (!cancelMatchupId) return;
    setLoading(true);
    const res = await fetch(`/api/matchups/${cancelMatchupId}`, { method: 'DELETE' });
    const payload = await res.json();
    setLoading(false);
    setCancelMatchupId(null);
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to cancel matchup.');
      return;
    }
    if (selectedMatchupId === cancelMatchupId) setSelectedMatchupId(null);
    await loadMatchups();
  }

  async function joinMatchup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinCode.trim()) { showNotice('error', 'Enter an invite code.'); return; }
    setLoading(true);
    const code = joinCode.trim().toUpperCase();
    const res = await fetch(`/api/matchups/invite/${code}/accept`, { method: 'POST' });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to join matchup.');
      setLoading(false);
      return;
    }
    setJoinCode('');
    setJoinOpen(false);
    showNotice('ok', payload.alreadyJoined ? 'Already in this matchup.' : 'Joined matchup!');
    await loadMatchups();
    setLoading(false);
  }

  async function submitPicks() {
    if (!selectedMatchupId || !currentRound) {
      showNotice('error', 'Select a matchup first.');
      return;
    }
    const editableFixtures = fixtures.filter((f) => !f.isLocked);
    const picks = editableFixtures
      .map((f) => ({ fixtureId: f.id, side: pickMap[f.id] }))
      .filter((p): p is { fixtureId: string; side: 'HOME' | 'AWAY' } => Boolean(p.side));
    if (!picks.length) { showNotice('error', 'No unlocked picks selected.'); return; }
    setLoading(true);
    const res = await fetch(
      `/api/matchups/${selectedMatchupId}/rounds/${currentRound.id}/picks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks })
      }
    );
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to submit picks.');
      setLoading(false);
      return;
    }
    showNotice('ok', `${picks.length} picks saved!`);
    await loadCurrentRoundAndFixtures();
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
  }

  async function saveDisplayName() {
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    setSavingName(true);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: fullName })
    });
    const payload = await res.json();
    setSavingName(false);
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to save display name.');
      return;
    }
    setDisplayName(fullName);
    showNotice('ok', 'Name saved.');
  }

  function applyThemeClass(t: 'system' | 'light' | 'dark') {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (t === 'light') root.classList.add('theme-light');
    if (t === 'dark') root.classList.add('theme-dark');
  }

  function changeTheme(t: 'system' | 'light' | 'dark') {
    setTheme(t);
    applyThemeClass(t);
    localStorage.setItem('wc-theme', t);
  }

  function handleNameBlur() {
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    if (!fullName || fullName === displayName) return;
    saveDisplayName();
  }

  async function togglePush() {
    const reg = swRegistration.current;
    if (!reg) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/notifications/webpush/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          showNotice('error', 'Notification permission denied.');
          return;
        }
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        await fetch('/api/notifications/webpush/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub }),
        });
        setPushEnabled(true);
        showNotice('ok', 'Push notifications enabled.');
      }
    } catch (err) {
      showNotice('error', 'Failed to update push notifications.');
      console.error(err);
    } finally {
      setPushLoading(false);
    }
  }

  async function saveDefaultPickSide(side: 'HOME' | 'AWAY') {
    setSavingDefaultPick(true);
    setDefaultPickSide(side);
    const res = await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultPickSide: side })
    });
    const payload = await res.json();
    setSavingDefaultPick(false);
    if (!res.ok || !payload.ok) {
      showNotice('error', payload.error ?? 'Failed to save default pick.');
    }
  }

  // ── Render: Fixture detail (content panel) ─────────────────────────────────

  function renderFixtureDetail() {
    const stage = currentRound?.stage ?? '';

    if (!selectedMatchupId) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle">Select a matchup from the left to load fixtures.</p>
        </div>
      );
    }

    if (!selectedFixture) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle">Select a fixture from the feed to view its details.</p>
        </div>
      );
    }

    const f = selectedFixture;
    const myPoints = computePickPoints(f, pickMap[f.id] ?? f.myPickSide, stage);
    const firstPickerId = pickOrder[f.id];
    const iPickFirst =
      firstPickerId && myParticipantId ? firstPickerId === myParticipantId : null;

    const myPick = pickMap[f.id] ?? f.myPickSide ?? null;
    const pickState = !myPick ? null
      : f.status === 'FINAL'
        ? (myPoints !== null && myPoints > 0 ? 'correct' : 'wrong')
        : 'pending';

    return (
      <div className="wc-stack">
        {/* Large scorebug — matches feed card style */}
        <div className="wc-fd-scorebug">
          {/* Group / stage label */}
          <div className="wc-fd-scorebug-group">
            {f.groupName ? `Group ${f.groupName}` : currentRound ? fmtStage(currentRound.stage) : ''}
          </div>

          {/* Teams + score */}
          <div className="wc-fd-scorebug-body">
            {/* Home */}
            <div className="wc-fd-scorebug-team">
              <div className="wc-fd-scorebug-crest-wrap">
                <span className="wc-fd-scorebug-crest">{teamFlag(f.homeTeam)}</span>
                {myPick === 'HOME' && (
                  <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side${pickState === 'wrong' ? ' wc-pick-badge--wrong' : pickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                    {userAvatarUrl
                      ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" />
                      : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>
                    }
                  </span>
                )}
                {f.opponentPickSide === 'HOME' && (
                  <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side">
                    {oppAvatarUrl
                      ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" />
                      : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>
                    }
                  </span>
                )}
              </div>
              <div className="wc-fd-scorebug-name">{f.homeTeam}</div>
            </div>

            {/* Score center */}
            <div className="wc-fd-scorebug-center">
              <div className="wc-fd-scorebug-nums">
                <span>{f.homeScore !== null ? f.homeScore : '—'}</span>
                <span className="wc-fd-scorebug-sep">–</span>
                <span>{f.awayScore !== null ? f.awayScore : '—'}</span>
              </div>
              <div className="wc-fd-scorebug-status">
                <StatusGlyph status={f.status} isLocked={f.isLocked || iPickFirst === false} size={13} />
              </div>
              <div className="wc-fd-scorebug-kickoff">
                {new Date(f.startsAt).toLocaleString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit'
                })}
              </div>
              {(f.venue || f.city) && (
                <div className="wc-fd-scorebug-venue">
                  {[f.venue, f.city].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>

            {/* Away */}
            <div className="wc-fd-scorebug-team">
              <div className="wc-fd-scorebug-crest-wrap">
                <span className="wc-fd-scorebug-crest">{teamFlag(f.awayTeam)}</span>
                {myPick === 'AWAY' && (
                  <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side${pickState === 'wrong' ? ' wc-pick-badge--wrong' : pickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                    {userAvatarUrl
                      ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" />
                      : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>
                    }
                  </span>
                )}
                {f.opponentPickSide === 'AWAY' && (
                  <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side">
                    {oppAvatarUrl
                      ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" />
                      : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>
                    }
                  </span>
                )}
              </div>
              <div className="wc-fd-scorebug-name">{f.awayTeam}</div>
            </div>
          </div>
        </div>

        {/* Pick section */}
        {(() => {
          const hasPickOrder = Object.keys(pickOrder).length > 0;
          const iAmFirstPicker = !hasPickOrder || pickOrder[f.id] === myParticipantId;
          const myEffectivePick = pickMap[f.id] ?? f.myPickSide;
          const oppEffectivePick = f.opponentPickSide;

          return (
            <>
              {/* Pick action area */}
              <div className="wc-fd-section">
                <div className="wc-fd-section-label">Who will win?</div>

                {f.isLocked ? (
                  /* Post-kickoff: show assigned picks as plain text */
                  <div className="wc-fd-locked-picks">
                    <div className="wc-fd-locked-pick">
                      <span className="wc-fd-locked-pick-you">You</span>
                      <span className="wc-fd-locked-pick-team">
                        {myEffectivePick ? (myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam) : '—'}
                      </span>
                    </div>
                    <div className="wc-fd-locked-pick">
                      <span className="wc-fd-locked-pick-you">Opponent</span>
                      <span className="wc-fd-locked-pick-team">
                        {oppEffectivePick ? (oppEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam) : '—'}
                      </span>
                    </div>
                  </div>
                ) : iAmFirstPicker ? (
                  /* First picker: dropdown + save */
                  <>
                    <p className="wc-pick-hint" style={{ margin: '0 0 6px' }}>You pick first — opponent is assigned the other team.</p>
                    <select
                      className="wc-select"
                      value={pickMap[f.id] ?? ''}
                      disabled={loading}
                      onChange={(e) => {
                        const side = e.target.value as 'HOME' | 'AWAY' | '';
                        setPickMap((prev) => {
                          if (!side) { const next = { ...prev }; delete next[f.id]; return next; }
                          return { ...prev, [f.id]: side };
                        });
                      }}
                    >
                      <option value="" disabled hidden />
                      <option value="HOME">{f.homeTeam}</option>
                      <option value="AWAY">{f.awayTeam}</option>
                    </select>
                    <button
                      className="wc-btn wc-btn-primary"
                      type="button"
                      onClick={() => submitSinglePick(f.id)}
                      disabled={loading || !pickMap[f.id]}
                    >
                      Save Pick
                    </button>
                  </>
                ) : myEffectivePick ? (
                  /* Second picker — opponent has picked, you're auto-assigned */
                  <div className="wc-fd-assigned">
                    <span className="wc-fd-assigned-flag">{teamFlag(myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam)}</span>
                    <div>
                      <div className="wc-fd-assigned-label">You&apos;ve been assigned</div>
                      <div className="wc-fd-assigned-team">{myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam}</div>
                    </div>
                  </div>
                ) : (
                  /* Second picker — waiting for opponent to pick */
                  <p className="wc-pick-hint wc-pick-hint--opponent" style={{ margin: '0 0 6px' }}>
                    Waiting for opponent to pick — you&apos;ll be assigned the other team.
                  </p>
                )}
              </div>

              {/* Points outcome */}
              {f.status === 'FINAL' && myPoints !== null && (
                <div className={`wc-fd-outcome${myPoints > 0 ? ' wc-fd-outcome--scored' : ' wc-fd-outcome--missed'}`}>
                  {myPoints > 0 ? `+${myPoints} pts` : 'Missed — 0 pts'}
                </div>
              )}
            </>
          );
        })()}

        {/* ── Tournament form ───────────────────────────────────────── */}
        {teamForm && (teamForm.homeFixtures.length > 0 || teamForm.awayFixtures.length > 0) && (() => {

          function renderFormCard(fc: TournamentFormFixture) {
            const myPick  = fc.myPickSide;
            const oppPick = fc.opponentPickSide;
            const homePts = fc.status === 'FINAL' ? computePickPoints(fc as unknown as Fixture, 'HOME', fc.stage) : null;
            const awayPts = fc.status === 'FINAL' ? computePickPoints(fc as unknown as Fixture, 'AWAY', fc.stage) : null;
            const myPickState = !myPick ? null
              : fc.status === 'FINAL'
                ? ((myPick === 'HOME' ? homePts : awayPts) ?? 0) > 0 ? 'correct' : 'wrong'
                : 'pending';

            const kickoffLabel = new Date(fc.startsAt).toLocaleString('en-US', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
            });

            return (
              <div key={fc.id} className="wc-scorebug wc-scorebug--locked" style={{ cursor: 'default' }}>
                {fc.groupName && (
                  <div className="wc-scorebug-group">
                    <span>Group {fc.groupName}</span>
                    <span className="wc-scorebug-kickoff">{kickoffLabel}</span>
                  </div>
                )}
                <div className="wc-scorebug-body">
                  {/* Home pts */}
                  <div className="wc-scorebug-pts">
                    {fc.status === 'FINAL' && (myPick === 'HOME' || oppPick === 'HOME') && homePts !== null && homePts > 0 && (
                      <span className="wc-scorebug-pts-val">{homePts > 0 ? `+${homePts}` : ''}</span>
                    )}
                  </div>

                  {/* Home team */}
                  <div className="wc-scorebug-team">
                    <div className="wc-scorebug-crest-wrap">
                      <span className="wc-scorebug-crest">{teamFlag(fc.homeTeam)}</span>
                      {myPick === 'HOME' && (
                        <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side${myPickState === 'wrong' ? ' wc-pick-badge--wrong' : myPickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                          {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>}
                        </span>
                      )}
                      {oppPick === 'HOME' && (
                        <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side">
                          {oppAvatarUrl ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>}
                        </span>
                      )}
                    </div>
                    <div className="wc-scorebug-code">{teamCode(fc.homeTeam)}</div>
                  </div>

                  {/* Score */}
                  <div className="wc-scorebug-center">
                    <div className="wc-scorebug-nums">
                      <span>{fc.homeScore !== null ? fc.homeScore : '—'}</span>
                      <span className="wc-scorebug-sep">–</span>
                      <span>{fc.awayScore !== null ? fc.awayScore : '—'}</span>
                    </div>
                    <div className="wc-scorebug-status-row">
                      <StatusGlyph status={fc.status} isLocked={true} />
                    </div>
                  </div>

                  {/* Away team */}
                  <div className="wc-scorebug-team">
                    <div className="wc-scorebug-crest-wrap">
                      <span className="wc-scorebug-crest">{teamFlag(fc.awayTeam)}</span>
                      {myPick === 'AWAY' && (
                        <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side${myPickState === 'wrong' ? ' wc-pick-badge--wrong' : myPickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                          {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>}
                        </span>
                      )}
                      {oppPick === 'AWAY' && (
                        <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side">
                          {oppAvatarUrl ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>}
                        </span>
                      )}
                    </div>
                    <div className="wc-scorebug-code">{teamCode(fc.awayTeam)}</div>
                  </div>

                  {/* Away pts */}
                  <div className="wc-scorebug-pts">
                    {fc.status === 'FINAL' && (myPick === 'AWAY' || oppPick === 'AWAY') && awayPts !== null && awayPts > 0 && (
                      <span className="wc-scorebug-pts-val">{awayPts > 0 ? `+${awayPts}` : ''}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <>
              {teamForm.homeFixtures.length > 0 && (
                <div className="wc-fd-section">
                  <div className="wc-fd-section-label">{teamForm.homeTeam} this tournament</div>
                  <div className="wc-form-list">
                    {teamForm.homeFixtures.map(renderFormCard)}
                  </div>
                </div>
              )}
              {teamForm.awayFixtures.length > 0 && (
                <div className="wc-fd-section">
                  <div className="wc-fd-section-label">{teamForm.awayTeam} this tournament</div>
                  <div className="wc-form-list">
                    {teamForm.awayFixtures.map(renderFormCard)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Previous World Cup Meetings */}
        {headToHead.length > 0 && (
          <div className="wc-fd-section">
            <div className="wc-fd-section-label">Previous World Cup Meetings</div>
            <div className="wc-h2h-history">
              {headToHead.map((m, i) => {
                const isH2hHomeFixtureHome = m.home === h2hHome;
                const fixtureHomeGoals = isH2hHomeFixtureHome ? m.homeGoals : m.awayGoals;
                const fixtureAwayGoals = isH2hHomeFixtureHome ? m.awayGoals : m.homeGoals;
                const homeWon = (fixtureHomeGoals ?? 0) > (fixtureAwayGoals ?? 0);
                const awayWon = (fixtureAwayGoals ?? 0) > (fixtureHomeGoals ?? 0);
                return (
                  <div key={i} className="wc-h2h-row">
                    <span className={`wc-h2h-row-team${homeWon ? ' wc-h2h-row-team--winner' : ''}`}>{h2hHome}</span>
                    <span className={`wc-h2h-row-score wc-h2h-row-score--${homeWon ? 'home' : awayWon ? 'away' : 'draw'}`}>
                      {fixtureHomeGoals ?? '?'} – {fixtureAwayGoals ?? '?'}
                    </span>
                    <span className={`wc-h2h-row-team wc-h2h-row-team--right${awayWon ? ' wc-h2h-row-team--winner' : ''}`}>{h2hAway}</span>
                    <span className="wc-h2h-row-meta">{m.year} · {m.stage}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Standings ──────────────────────────────────────────────────────

  function renderStandings() {
    const myEntry = standing.find((s) => s.email === userEmail);
    const opponentEntry = standing.find((s) => s.email !== userEmail);
    const statusLabel = (() => {
      if (!myEntry || !opponentEntry) return null;
      if (myEntry.tournamentPoints > opponentEntry.tournamentPoints) return 'Leading';
      if (myEntry.tournamentPoints < opponentEntry.tournamentPoints) return 'Behind';
      return 'Tied';
    })();

    return (
      <div className="wc-stack">
        {standing.length > 0 ? (
          <>
            <div className="wc-standings-card">
              <div className="wc-standings-col">
                <div className="wc-standings-name">
                  {myEntry?.displayName ?? myEntry?.email ?? 'You'}
                </div>
                <div className="wc-standings-pts">{myEntry?.tournamentPoints ?? 0}</div>
                <div className="wc-standings-label">pts</div>
              </div>
              {statusLabel && <div className="wc-standings-status">{statusLabel}</div>}
              <div className="wc-standings-col wc-standings-col--right">
                <div className="wc-standings-name">
                  {opponentEntry?.displayName ?? opponentEntry?.email ?? 'Opponent'}
                </div>
                <div className="wc-standings-pts">{opponentEntry?.tournamentPoints ?? 0}</div>
                <div className="wc-standings-label">pts</div>
              </div>
            </div>

            {roundResults.length > 0 && (
              <table className="wc-round-table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>You</th>
                    <th>Opponent</th>
                    <th>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {roundResults.map((rr) => {
                    const me = rr.participants.find((p) => p.email === userEmail);
                    const opp = rr.participants.find((p) => p.email !== userEmail);
                    const delta = (me?.points ?? 0) - (opp?.points ?? 0);
                    return (
                      <tr key={rr.roundId}>
                        <td>{fmtStage(rr.stage)}</td>
                        <td>{me?.points ?? 0}</td>
                        <td>{opp?.points ?? 0}</td>
                        <td
                          style={{
                            color:
                              delta > 0
                                ? 'var(--ok)'
                                : delta < 0
                                  ? 'var(--danger)'
                                  : undefined
                          }}
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="wc-subtitle">
            {selectedMatchupId
              ? 'No results yet — standings appear after the first round settles.'
              : 'Select a matchup to see standings.'}
          </p>
        )}

        <div className="wc-pill-row" style={{ marginTop: 4 }}>
          <span className="wc-round-label">Fixtures: {fixtures.length}</span>
          <span className="wc-round-label">Picked: {pickedCount}</span>
          <span className="wc-round-label">Locked: {lockedCount}</span>
          <span className="wc-round-label">
            Open: {Math.max(fixtures.length - lockedCount, 0)}
          </span>
        </div>
      </div>
    );
  }

  // ── Render: Squad tab ─────────────────────────────────────────────────────

  function renderSquad() {
    if (!selectedFixture) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle">Select a fixture to view squad info.</p>
        </div>
      );
    }
    return (
      <div className="wc-content-empty">
        <p style={{ fontSize: '1.8rem' }}>🏃</p>
        <p style={{ fontWeight: 700, margin: 0 }}>
          {selectedFixture.homeTeam} vs {selectedFixture.awayTeam}
        </p>
        <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
          Squad lineups will appear here once confirmed — typically 1 hour before kickoff.
        </p>
      </div>
    );
  }

  // ── Render: Game Recap tab ─────────────────────────────────────────────────

  function renderRecap() {
    if (!selectedFixture) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle">Select a fixture to view the recap.</p>
        </div>
      );
    }
    if (selectedFixture.status !== 'FINAL') {
      return (
        <div className="wc-content-empty">
          <p style={{ fontSize: '1.8rem' }}>⏱</p>
          <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
            Game recap will be available after the match ends.
          </p>
        </div>
      );
    }
    return (
      <div className="wc-content-empty">
        <p style={{ fontSize: '1.8rem' }}>📰</p>
        <p style={{ fontWeight: 700, margin: 0 }}>
          {selectedFixture.homeTeam} {selectedFixture.homeScore} – {selectedFixture.awayScore} {selectedFixture.awayTeam}
        </p>
        <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
          Full match recap — coming soon.
        </p>
      </div>
    );
  }




  // ── Shell ──────────────────────────────────────────────────────────────────

  const tournamentLabel = activeTournament?.label ?? "FIFA World Cup '26";

  return (
    <div className="wc-shell">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="wc-topbar">
        {/* Tournament name — clickable, opens dropdown */}
        <div className="wc-tournament-menu" ref={tournamentMenuRef}>
          <button
            className="wc-topbar-brand wc-topbar-brand--btn"
            onClick={() => setTournamentMenuOpen((v) => !v)}
            aria-expanded={tournamentMenuOpen}
            aria-label="Switch tournament"
          >
            <span className="wc-topbar-brand-name">
              {tournamentLabel.split("'")[0].trim()}
            </span>
            <span className="wc-topbar-brand-year">
              &apos;{tournamentLabel.split("'")[1] ?? '26'}
            </span>
            <span className="wc-topbar-brand-chevron">▾</span>
          </button>

          {tournamentMenuOpen && (
            <div className="wc-dropdown wc-dropdown--left" role="menu">
              {TOURNAMENT_CATALOGUE.map((t) => (
                <button
                  key={t.id}
                  className={`wc-dropdown-item${!t.active ? ' wc-dropdown-item--muted' : ''}`}
                  role="menuitem"
                  disabled={!t.active}
                  onClick={() => setTournamentMenuOpen(false)}
                >
                  <span className="wc-dropdown-item-label">{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Centre: H2H scorebug ────────────────────────────────────────── */}
        <div className="wc-topbar-center">
          {selectedMatchup && (() => {
            const me = standing.find((s) => s.participantId === myParticipantId);
            const opp = standing.find((s) => s.participantId !== myParticipantId);
            const myPts = me?.tournamentPoints ?? 0;
            const oppPts = opp?.tournamentPoints ?? 0;
            const leading = myPts > oppPts;
            const trailing = myPts < oppPts;
            const myName = displayName || userEmail.split('@')[0];
            const myInit = initials(myName);
            const oppName =
              selectedMatchup.opponentDisplayName ??
              selectedMatchup.opponentEmail?.split('@')[0] ??
              'Opp';
            const oppInit = initials(oppName);
            return (
              <button
                className="wc-h2h"
                title="View score breakdown"
                onClick={() => setScoreChartOpen(true)}
              >
                {/* Home — current user: name LEFT, avatar RIGHT */}
                <div className="wc-h2h-player">
                  <span className="wc-h2h-name">{myName}</span>
                  {userAvatarUrl ? (
                    <img className="wc-h2h-avatar" src={userAvatarUrl} alt={myName} />
                  ) : (
                    <span className="wc-h2h-avatar wc-h2h-avatar--me">{myInit}</span>
                  )}
                </div>

                {/* Score */}
                <div className="wc-h2h-score">
                  <span className={myPts > oppPts ? 'wc-h2h-pts--leading' : myPts < oppPts ? 'wc-h2h-pts--trailing' : ''}>
                    {myPts}
                  </span>
                  <span className="wc-h2h-sep">–</span>
                  <span className={oppPts > myPts ? 'wc-h2h-pts--leading' : oppPts < myPts ? 'wc-h2h-pts--trailing' : ''}>
                    {oppPts}
                  </span>
                </div>

                {/* Away — opponent */}
                <div className="wc-h2h-player wc-h2h-player--right">
                  <span className="wc-h2h-name">{oppName}</span>
                  <div className="wc-avatar-presence-wrap">
                    {selectedMatchup?.opponentAvatarUrl ? (
                      <img className="wc-h2h-avatar" src={selectedMatchup.opponentAvatarUrl} alt={oppName} referrerPolicy="no-referrer" />
                    ) : (
                      <span className="wc-h2h-avatar wc-h2h-avatar--opp">{oppInit}</span>
                    )}
                    {opponentOnline && <span className="wc-presence-dot" />}
                  </div>
                </div>
              </button>
            );
          })()}
        </div>

        {/* Global actions + user */}
        <div className="wc-topbar-right">
          {/* Alerts bell */}
          <button
            className={`wc-alerts-btn${pickSummaryStats.urgent > 0 ? ' wc-alerts-btn--urgent' : pickSummaryStats.total > 0 ? ' wc-alerts-btn--active' : ''}`}
            aria-label={pickSummaryStats.total > 0 ? `${pickSummaryStats.total} picks pending` : 'Alerts'}
            title="Alerts"
            onClick={() => setPickSummaryOpen(true)}
            disabled={!selectedMatchupId}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 2a6 6 0 00-6 6c0 3.5-1.5 5-1.5 5h15s-1.5-1.5-1.5-5a6 6 0 00-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M8.5 17a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            {pickSummaryStats.total > 0 && selectedMatchupId && (
              <span className={`wc-alerts-badge${pickSummaryStats.urgent > 0 ? ' wc-alerts-badge--urgent' : ''}`} />
            )}
          </button>

          {/* User avatar + dropdown */}
          <div className="wc-user-menu" ref={userMenuRef}>
            <button
              className="wc-user-btn"
              aria-label="User menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatarUrl}
                  alt="Profile"
                  className="wc-user-avatar"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="wc-user-avatar wc-user-avatar--initials">
                  {(displayName || userEmail).charAt(0).toUpperCase()}
                </span>
              )}
            </button>

            {userMenuOpen && (
              <div className="wc-dropdown" role="menu">
                <button
                  className="wc-dropdown-item"
                  role="menuitem"
                  disabled={loading}
                  onClick={() => { setUserMenuOpen(false); setCreateOpen(true); }}
                >
                  New Matchup
                </button>
                <button
                  className="wc-dropdown-item"
                  role="menuitem"
                  disabled={loading}
                  onClick={() => { setUserMenuOpen(false); setJoinOpen(true); }}
                >
                  Join Matchup
                </button>
                <div className="wc-dropdown-divider" />
                <button
                  className="wc-dropdown-item"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); setProfileModalOpen(true); }}
                >
                  Settings
                </button>
                <a
                  className="wc-dropdown-item"
                  role="menuitem"
                  href="/admin"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Admin Tools
                </a>
                {selectedMatchupId && (
                  <>
                    <div className="wc-dropdown-divider" />
                    <a
                      className="wc-dropdown-item"
                      role="menuitem"
                      href={`/api/calendar/matchup/${selectedMatchupId}/all`}
                      download="world-cup-pickem-2026.ics"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Download All Fixtures
                    </a>
                  </>
                )}
                <div className="wc-dropdown-divider" />
                <button
                  className="wc-dropdown-item"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); signOut(); }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className={`wc-body wc-body--${mobileView}`}>

        {/* ── Left nav: Matchups ───────────────────────────────────────────── */}
        <nav
          className={`wc-leftnav${leftNavOpen ? '' : ' wc-leftnav--collapsed'}`}
          aria-label="Matchups"
        >
          <div className="wc-nav-scroll">
            {matchups.length === 0 && leftNavOpen && (
              <p className="wc-subtitle" style={{ padding: '8px 10px', fontSize: '0.82rem' }}>
                No matchups yet.
              </p>
            )}
            {matchups.map((m) => {
              const oppName =
                m.opponentDisplayName ?? m.opponentEmail?.split('@')[0] ?? null;
              const oppInit = initials(oppName, '?');
              const isActive = m.matchupId === selectedMatchupId;

              const isPending = !oppName && m.isCreator;

              return (
                <div key={m.matchupId} className="wc-nav-item-row">
                  <button
                    className="wc-nav-item"
                    aria-current={isActive ? 'true' : undefined}
                    title={oppName ? `vs ${oppName}` : 'Pending opponent'}
                    onClick={() => setSelectedMatchupId(m.matchupId)}
                  >
                    {leftNavOpen ? (
                      <span className="wc-nav-item-name">
                        vs {oppName ?? <em style={{ color: 'var(--text-1)' }}>Pending</em>}
                      </span>
                    ) : (
                      <span className="wc-nav-opp-avatar" aria-hidden="true">
                        {oppName ? oppInit : '?'}
                      </span>
                    )}
                  </button>
                  {isPending && leftNavOpen && (
                    <button
                      className="wc-nav-cancel-btn"
                      title="Cancel matchup"
                      aria-label="Cancel matchup"
                      onClick={(e) => { e.stopPropagation(); setCancelMatchupId(m.matchupId); }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Collapse toggle — pinned to bottom */}
          <div className="wc-nav-footer">
            <button
              className="wc-nav-collapse-btn"
              aria-label={leftNavOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              title={leftNavOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={() => setLeftNavOpen((v) => !v)}
            >
              {leftNavOpen ? '‹' : '›'}
            </button>
          </div>
        </nav>

        {/* ── Center feed: Fixtures ────────────────────────────────────────── */}
        <div className="wc-feed">
          <div className="wc-feed-header">
            <span className="wc-feed-title">Fixtures</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {hasLiveFixtures && <span className="wc-live-badge">🔴</span>}
              <span className="wc-feed-count">{visibleFixtures.length}</span>

              {/* Filter button + flyout */}
              {fixtures.length > 0 && (
                <div className="wc-filter-wrap" ref={filterRef}>
                  <button
                    className={`wc-filter-btn${(filterGroup || filterNoPick || filterPickable) ? ' wc-filter-btn--active' : ''}`}
                    onClick={() => setFilterOpen((v) => !v)}
                    aria-expanded={filterOpen}
                    aria-label="Filter fixtures"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Filter
                    {(filterGroup || filterNoPick || filterPickable) && (
                      <span className="wc-filter-badge">
                        {(filterGroup ? 1 : 0) + (filterNoPick ? 1 : 0) + (filterPickable ? 1 : 0)}
                      </span>
                    )}
                  </button>

                  {filterOpen && (
                    <div className="wc-filter-flyout">
                      <div className="wc-filter-section-label">Group</div>
                      <div className="wc-filter-options">
                        <button
                          className={`wc-filter-option${filterGroup === null ? ' wc-filter-option--selected' : ''}`}
                          onClick={() => setFilterGroup(null)}
                        >All groups</button>
                        {availableGroups.map((g) => (
                          <button
                            key={g}
                            className={`wc-filter-option${filterGroup === g ? ' wc-filter-option--selected' : ''}`}
                            onClick={() => { setFilterGroup(g); setFilterOpen(false); }}
                          >Group {g}</button>
                        ))}
                      </div>

                      <div className="wc-filter-divider" />

                      <button
                        className={`wc-filter-option${filterNoPick ? ' wc-filter-option--selected' : ''}`}
                        onClick={() => { setFilterNoPick((v) => !v); }}
                      >
                        {filterNoPick ? '✓ ' : ''}No pick yet
                      </button>

                      <button
                        className={`wc-filter-option${filterPickable ? ' wc-filter-option--selected' : ''}`}
                        onClick={() => { setFilterPickable((v) => !v); }}
                      >
                        {filterPickable ? '✓ ' : ''}Pickable only
                      </button>

                      {(filterGroup || filterNoPick || filterPickable) && (
                        <>
                          <div className="wc-filter-divider" />
                          <button
                            className="wc-filter-option wc-filter-option--clear"
                            onClick={() => { setFilterGroup(null); setFilterNoPick(false); setFilterPickable(false); setFilterOpen(false); }}
                          >Clear filters</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="wc-feed-scroll">
            {allRounds.length === 0 && !loading ? (
              <div className="wc-feed-empty">
                <p className="wc-subtitle">No fixtures for the current round.</p>
              </div>
            ) : (
              allRounds.map((round) => {
                const isCurrentRound = round.id === currentRound?.id;
                const isFutureRound = !round.is_complete && !isCurrentRound;
                // null = still fetching; [] = loaded but empty
                const roundFixtures: Fixture[] | null = isCurrentRound
                  ? visibleFixtures
                  : (completedRoundFixtures[round.id] ?? null);
                const hasFilters = !!(filterGroup || filterNoPick || filterPickable);
                if (hasFilters && filterGroup && round.stage !== 'GROUP') return null;

                return (
                  <div key={round.id} className="wc-round-section">
                    {/* Sticky round header */}
                    <div className="wc-round-section-header">
                      <span className="wc-round-section-title">{fmtStage(round.stage)}</span>
                      {round.starts_at && (
                        <span className="wc-round-section-date">
                          {new Date(round.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                          {round.ends_at && round.ends_at !== round.starts_at
                            ? ` – ${new Date(round.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                            : ''}
                        </span>
                      )}
                    </div>

                    {/* Fixtures, loading, or TBD placeholder */}
                    {isFutureRound ? (
                      <div className="wc-round-tbd">Fixtures TBD</div>
                    ) : roundFixtures === null ? (
                      <div className="wc-round-tbd" style={{ opacity: 0.5 }}>Loading…</div>
                    ) : roundFixtures.length === 0 ? (
                      <div className="wc-round-tbd">
                        {hasFilters && isCurrentRound ? 'No fixtures match the filter.' : 'No fixtures yet.'}
                      </div>
                    ) : (() => {
                        let lastMatchday = 0;
                        return roundFixtures.map((f) => {
                          const isSelected = f.id === selectedFixtureId;
                          const myPick = pickMap[f.id] ?? f.myPickSide ?? null;
                          const pts = computePickPoints(f, myPick, round.stage);
                          const hasPickOrder = Object.keys(pickOrder).length > 0;
                          // Completed-round fixtures are always "accessible" for display
                          const isMyFixture = !isCurrentRound || !hasPickOrder || pickOrder[f.id] === myParticipantId;
                          const thisMatchday = f.matchday ?? 1;
                          const showMatchdayHeader = thisMatchday !== lastMatchday;
                          if (showMatchdayHeader) lastMatchday = thisMatchday;

                          // Format kickoff time: "Jun 11 · 3:00 PM"
                          const kickoffDate = new Date(f.startsAt);
                          const kickoffLabel = kickoffDate.toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'UTC'
                          });

                          return (
                            <div key={f.id}>
                              {showMatchdayHeader && (
                                <div className="wc-matchday-header">Matchday {thisMatchday}</div>
                              )}
                              <button
                                className={`wc-scorebug${isSelected ? ' wc-scorebug--selected' : ''}${f.isLocked ? ' wc-scorebug--locked' : ''}${!f.isLocked && !isMyFixture ? ' wc-scorebug--not-mine' : ''}`}
                                aria-current={isSelected ? 'true' : undefined}
                                onClick={() => {
                                  setSelectedFixtureId(f.id);
                                  setContentTab('details');
                                  setMobileView('content');
                                  setHeadToHead([]);
                                  setTeamForm(null);
                                  fetch(`/api/fixtures/${f.id}/head-to-head`)
                                    .then((r) => r.json())
                                    .then((d) => { setHeadToHead(d.meetings ?? []); setH2hHome(d.home ?? ''); setH2hAway(d.away ?? ''); })
                                    .catch(() => {});
                                  const formUrl = selectedMatchupId
                                    ? `/api/fixtures/${f.id}/form?matchupId=${selectedMatchupId}`
                                    : `/api/fixtures/${f.id}/form`;
                                  fetch(formUrl)
                                    .then((r) => r.json())
                                    .then((d) => { if (d.ok) setTeamForm(d); })
                                    .catch(() => {});
                                }}
                              >
                              {/* Group label + kickoff */}
                              {f.groupName && (
                                <div className="wc-scorebug-group">
                                  <span>Group {f.groupName}</span>
                                  <span className="wc-scorebug-kickoff">{kickoffLabel}</span>
                                </div>
                              )}

                              {/* Teams + score row */}
                              {(() => {
                                const pickState = !myPick ? null
                                  : f.status === 'FINAL'
                                    ? (pts !== null && pts > 0 ? 'correct' : 'wrong')
                                    : 'pending';
                                const isFinal = f.status === 'FINAL';
                                const homePts = isFinal ? computePickPoints(f, 'HOME', round.stage) : null;
                                const awayPts = isFinal ? computePickPoints(f, 'AWAY', round.stage) : null;
                                const homePickExists = myPick === 'HOME' || f.opponentPickSide === 'HOME';
                                const awayPickExists = myPick === 'AWAY' || f.opponentPickSide === 'AWAY';
                                return (
                                  <div className="wc-scorebug-body">
                                    {/* Left pts — home side picker */}
                                    <div className="wc-scorebug-pts">
                                      {isFinal && homePickExists && homePts !== null && homePts > 0 && (
                                        <span className="wc-scorebug-pts-val">+{homePts}</span>
                                      )}
                                    </div>

                                    <div className="wc-scorebug-team">
                                      <div className="wc-scorebug-crest-wrap">
                                        <span className="wc-scorebug-crest">{teamFlag(f.homeTeam)}</span>
                                        {myPick === 'HOME' && (
                                          <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side${pickState === 'wrong' ? ' wc-pick-badge--wrong' : pickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                                            {userAvatarUrl
                                              ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" />
                                              : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>
                                            }
                                          </span>
                                        )}
                                        {f.opponentPickSide === 'HOME' && (
                                          <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side">
                                            {oppAvatarUrl
                                              ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" />
                                              : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>
                                            }
                                          </span>
                                        )}
                                      </div>
                                      <div className="wc-scorebug-code">{teamCode(f.homeTeam)}</div>
                                    </div>
                                    <div className="wc-scorebug-center">
                                      <div className="wc-scorebug-nums">
                                        <span>{f.homeScore !== null ? f.homeScore : '—'}</span>
                                        <span className="wc-scorebug-sep">–</span>
                                        <span>{f.awayScore !== null ? f.awayScore : '—'}</span>
                                      </div>
                                      <div className="wc-scorebug-status-row">
                                        <StatusGlyph status={f.status} isLocked={f.isLocked || !isMyFixture} />
                                      </div>
                                    </div>
                                    <div className="wc-scorebug-team">
                                      <div className="wc-scorebug-crest-wrap">
                                        <span className="wc-scorebug-crest">{teamFlag(f.awayTeam)}</span>
                                        {myPick === 'AWAY' && (
                                          <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side${pickState === 'wrong' ? ' wc-pick-badge--wrong' : pickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                                            {userAvatarUrl
                                              ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" />
                                              : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>
                                            }
                                          </span>
                                        )}
                                        {f.opponentPickSide === 'AWAY' && (
                                          <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side">
                                            {oppAvatarUrl
                                              ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" />
                                              : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>
                                            }
                                          </span>
                                        )}
                                      </div>
                                      <div className="wc-scorebug-code">{teamCode(f.awayTeam)}</div>
                                    </div>

                                    {/* Right pts — away side picker */}
                                    <div className="wc-scorebug-pts">
                                      {isFinal && awayPickExists && awayPts !== null && awayPts > 0 && (
                                        <span className="wc-scorebug-pts-val">+{awayPts}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              </button>
                            </div>
                          );
                        });
                      })()
                    }
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Content panel: Fixture Details ──────────────────────────────── */}
        <div className="wc-content">
          {/* Header: single row — mobile back pinned left, tabs centred */}
          <div className="wc-content-header">
            <button
              className="wc-topbar-icon-btn wc-mobile-back"
              aria-label="Back to feed"
              onClick={() => setMobileView('feed')}
            >
              ‹
            </button>
            <div className="wc-content-tabs">
              <button
                className="wc-content-tab"
                aria-pressed={contentTab === 'details'}
                onClick={() => setContentTab('details')}
              >
                {hasLiveFixtures ? '🔴 ' : ''}Match Details
              </button>
              <button
                className="wc-content-tab"
                aria-pressed={contentTab === 'squad'}
                onClick={() => setContentTab('squad')}
              >
                Squad
              </button>
              <button
                className="wc-content-tab"
                aria-pressed={contentTab === 'recap'}
                onClick={() => setContentTab('recap')}
              >
                Game Recap
              </button>
            </div>
          </div>

          {/* Notice */}
          {notice && (
            <div className={`wc-notice wc-notice--${notice.tone}`}>{notice.text}</div>
          )}

          {/* Body */}
          <div className="wc-content-body">
            {contentTab === 'details' && renderFixtureDetail()}
            {contentTab === 'squad' && renderSquad()}
            {contentTab === 'recap' && renderRecap()}
          </div>
        </div>

        {/* ── Right drawer ─────────────────────────────────────────────────── */}
        <aside
          className={`wc-drawer${drawerOpen ? ' wc-drawer--open' : ''}`}
          aria-label="Side panel"
        >
          {/* Icon strip — always visible */}
          <div className="wc-drawer-icons">
            {/* Chat — monochrome SVG with unread badge */}
            <button
              className={`wc-drawer-icon-btn${drawerTab === 'chat' && drawerOpen ? ' wc-drawer-icon-btn--active' : ''}`}
              style={{ position: 'relative' }}
              title="Chat"
              aria-label="Chat"
              onClick={() => {
                if (drawerOpen && drawerTab === 'chat') setDrawerOpen(false);
                else { setDrawerTab('chat'); setDrawerOpen(true); }
              }}
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H6.5L2 18V4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
              {totalUnread > 0 && (
                <span className="wc-chat-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
              )}
            </button>

            <button
              className={`wc-drawer-icon-btn${drawerTab === 'calendar' && drawerOpen ? ' wc-drawer-icon-btn--active' : ''}`}
              title="Calendar" aria-label="Calendar"
              onClick={() => { if (drawerOpen && drawerTab === 'calendar') setDrawerOpen(false); else { setDrawerTab('calendar'); setDrawerOpen(true); } }}
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2" y="3" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M2 8h16" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 2v2M14 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              className={`wc-drawer-icon-btn${drawerTab === 'tv' && drawerOpen ? ' wc-drawer-icon-btn--active' : ''}`}
              title="TV" aria-label="TV"
              onClick={() => { if (drawerOpen && drawerTab === 'tv') setDrawerOpen(false); else { setDrawerTab('tv'); setDrawerOpen(true); } }}
            >
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2" y="4" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 18h6M10 15v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Sliding content panel */}
          <div className="wc-drawer-panel">
            <div className="wc-drawer-panel-header">
              <span className="wc-drawer-panel-title">
                {{ chat: 'Chat', calendar: 'Calendar', tv: 'TV Schedule' }[drawerTab]}
              </span>
              <button
                className="wc-topbar-icon-btn"
                aria-label="Close panel"
                onClick={() => setDrawerOpen(false)}
                style={{ fontSize: '0.8rem' }}
              >
                ✕
              </button>
            </div>
            <div className={`wc-drawer-panel-body${drawerTab === 'chat' ? ' wc-drawer-panel-body--chat' : ''}`}>
              {drawerTab === 'chat' && (
                selectedMatchupId && myAppUserId && selectedMatchup?.opponentEmail ? (
                  <ChatPanel
                    matchupId={selectedMatchupId}
                    myAppUserId={myAppUserId}
                    myAvatarUrl={userAvatarUrl ?? null}
                    opponentDisplayName={selectedMatchup.opponentDisplayName ?? null}
                    opponentEmail={selectedMatchup.opponentEmail}
                    opponentAvatarUrl={selectedMatchup.opponentAvatarUrl ?? null}
                    onMarkRead={() => {
                      fetch('/api/messages/unread-count', { cache: 'no-store' })
                        .then(r => r.json()).then(d => { if (d.ok) setTotalUnread(d.total ?? 0); }).catch(() => {});
                    }}
                    onPresenceChange={(online) => setOpponentOnline(online)}
                  />
                ) : (
                  <div className="wc-content-empty">
                    <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
                      {!selectedMatchupId ? 'Select a matchup to open chat.' : 'Chat available once your opponent joins.'}
                    </p>
                  </div>
                )
              )}
              {drawerTab === 'calendar' && (
                <div className="wc-cal-panel">
                  {!selectedFixture ? (
                    <div className="wc-content-empty">
                      <p style={{ fontSize: '1.5rem' }}>📅</p>
                      <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
                        Select a match to add it to your calendar.
                      </p>
                    </div>
                  ) : (() => {
                    const f = selectedFixture;
                    const homeCode = teamCode(f.homeTeam);
                    const awayCode = teamCode(f.awayTeam);
                    const kickoff = new Date(f.startsAt).toLocaleString(undefined, {
                      weekday: 'short', month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit'
                    });
                    const url = `/api/calendar/matchup/${selectedMatchupId}/fixture/${f.id}`;
                    return (
                      <div className="wc-cal-single">
                        <div className="wc-cal-single-teams">
                          <span className="wc-cal-single-flag">{teamFlag(f.homeTeam)}</span>
                          <span className="wc-cal-single-code">{homeCode}</span>
                          <span className="wc-cal-single-vs">vs</span>
                          <span className="wc-cal-single-code">{awayCode}</span>
                          <span className="wc-cal-single-flag">{teamFlag(f.awayTeam)}</span>
                        </div>
                        <div className="wc-cal-single-meta">
                          <span>{kickoff}</span>
                          {(f.venue || f.city) && (
                            <span>{[f.venue, f.city].filter(Boolean).join(' · ')}</span>
                          )}
                        </div>
                        <a
                          href={url}
                          download={`${homeCode}-vs-${awayCode}.ics`}
                          className="wc-btn wc-btn-primary wc-cal-single-btn"
                        >
                          📅 Add to Calendar
                        </a>
                        <p className="wc-cal-hint">
                          Opens in Apple Calendar, Google Calendar, or Outlook.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              )}
              {drawerTab === 'tv' && (
                <div className="wc-content-empty">
                  <p style={{ fontSize: '1.5rem' }}>📺</p>
                  <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
                    Broadcast &amp; streaming info — coming soon
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile bottom nav */}
      <nav className="wc-mobile-nav" aria-label="Mobile navigation">
        <button
          className="wc-mobile-nav-btn"
          aria-pressed={mobileView === 'feed'}
          onClick={() => setMobileView('feed')}
        >
          <span>📋</span>
          <span>Fixtures</span>
        </button>
        <button
          className="wc-mobile-nav-btn"
          aria-pressed={mobileView === 'content'}
          disabled={!selectedMatchupId}
          onClick={() => setMobileView('content')}
        >
          <span>{hasLiveFixtures ? '🔴' : '🏟️'}</span>
          <span>Detail</span>
        </button>
      </nav>

      {/* Score chart modal */}
      {scoreChartOpen && selectedMatchup && (
        <ScoreChartModal
          standing={standing}
          roundResults={roundResults}
          allRounds={allRounds}
          fixtures={fixtures}
          pickMap={pickMap}
          myParticipantId={myParticipantId}
          currentRound={currentRound}
          selectedMatchup={selectedMatchup}
          userAvatarUrl={userAvatarUrl}
          oppAvatarUrl={oppAvatarUrl}
          userEmail={userEmail}
          displayName={displayName}
          onClose={() => setScoreChartOpen(false)}
        />
      )}

      {/* Pick summary modal */}
      {pickSummaryOpen && selectedMatchupId && (
        <div
          className="wc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Pick summary"
          onClick={(e) => { if (e.target === e.currentTarget) setPickSummaryOpen(false); }}
        >
          <div className="wc-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Your Picks</h3>
              <button
                className="wc-topbar-icon-btn"
                aria-label="Close"
                onClick={() => setPickSummaryOpen(false)}
              >
                ✕
              </button>
            </div>
            <PickSummaryContent
              stats={pickSummaryStats}
              onShowUnpicked={() => { setPickSummaryOpen(false); setFilterNoPick(true); }}
              onDismiss={() => setPickSummaryOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Profile / settings modal */}
      {profileModalOpen && (
        <div
          className="wc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onClick={(e) => { if (e.target === e.currentTarget) setProfileModalOpen(false); }}
        >
          <div className="wc-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Settings</h3>
              <button
                className="wc-topbar-icon-btn"
                aria-label="Close settings"
                onClick={() => setProfileModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <ProfileSettings
              userEmail={userEmail}
              userAvatarUrl={userAvatarUrl}
              displayName={displayName}
              firstName={firstName}
              lastName={lastName}
              savingName={savingName}
              defaultPickSide={defaultPickSide}
              savingDefaultPick={savingDefaultPick}
              pushSupported={pushSupported}
              pushEnabled={pushEnabled}
              pushLoading={pushLoading}
              theme={theme}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onNameBlur={handleNameBlur}
              onDefaultPickSide={saveDefaultPickSide}
              onTogglePush={togglePush}
              onThemeChange={changeTheme}
              onSignOut={signOut}
            />
          </div>
        </div>
      )}

      {/* Cancel matchup confirm modal */}
      {cancelMatchupId && (
        <div
          className="wc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Cancel matchup"
          onClick={(e) => { if (e.target === e.currentTarget) setCancelMatchupId(null); }}
        >
          <div className="wc-modal">
            <h3 style={{ margin: 0 }}>Cancel Matchup?</h3>
            <p className="wc-subtitle">This will delete the pending matchup and its invite link. This can&apos;t be undone.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="wc-btn wc-btn-danger"
                type="button"
                disabled={loading}
                onClick={cancelMatchup}
              >
                {loading ? 'Cancelling…' : 'Yes, Cancel It'}
              </button>
              <button className="wc-btn" type="button" onClick={() => setCancelMatchupId(null)}>
                Keep It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div
          className="wc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Create matchup"
          onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal(); }}
        >
          <div className="wc-modal">
            {createdInviteCode ? (
              <>
                <h3 style={{ margin: 0 }}>Matchup Created!</h3>
                <p className="wc-subtitle">Share this link with your opponent to start the duel.</p>
                <div className="wc-invite-link-box">
                  <span className="wc-invite-link-text">
                    {`${window.location.origin}/join/${createdInviteCode}`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="wc-btn wc-btn-primary"
                    type="button"
                    onClick={() => copyInviteLink(createdInviteCode)}
                  >
                    {copyConfirmed ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button className="wc-btn" type="button" onClick={closeCreateModal}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0 }}>Create a Matchup</h3>
                <p className="wc-subtitle">
                  A unique invite link will be generated for you to share with one opponent.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="wc-btn wc-btn-primary"
                    type="button"
                    disabled={loading}
                    onClick={createMatchup}
                  >
                    {loading ? 'Creating…' : 'Create'}
                  </button>
                  <button className="wc-btn" type="button" onClick={closeCreateModal}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Join modal */}
      {joinOpen && (
        <div
          className="wc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Join matchup"
        >
          <div className="wc-modal">
            <h3 style={{ margin: 0 }}>Join a Matchup</h3>
            <p className="wc-subtitle">Enter the invite code from your opponent.</p>
            <form className="wc-inline-form" onSubmit={joinMatchup}>
              <input
                className="wc-input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABC123XYZ"
                autoFocus
              />
              <button className="wc-btn wc-btn-primary" type="submit" disabled={loading}>
                Join
              </button>
              <button className="wc-btn" type="button" onClick={() => setJoinOpen(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
