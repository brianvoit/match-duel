'use client';

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TEAM_INFO, teamCode, teamFlag } from '@/lib/data/teamInfo';
import { ChatPanel } from '@/app/components/chat-panel';
import { PreMatchPanel } from '@/app/components/pre-match-panel';
import { ScoreChartModal } from '@/app/components/score-chart-modal';
import { ProfileSettings } from '@/app/components/profile-settings';
import { renderMatchShareCard, type ShareGoal } from '@/app/components/share-card';
import {
  Tournament, Matchup, Round, Fixture,
  ParticipantStanding, RoundResultParticipant, RoundResultEntry,
  TournamentForm, TournamentFormFixture,
  SquadData, RecapData, PreMatchData, EventsData, MatchEvent,
  ContentTab, DrawerTab, MobileView, NoticeTone,
} from '@/app/components/playground-types';
import {
  STAGE_POINTS, STAGE_LABELS, fmtStage, computePickPoints, penaltyWinner, isGenuineDraw,
  computeMatchdays, tournamentMatchday, initials, urlBase64ToUint8Array, StatusGlyph, liveMatchClock,
} from '@/app/components/playground-utils';
import { avatarColor } from '@/lib/avatar-color';
import { usePresence } from '@/lib/realtime/usePresence';

// Types are imported from playground-types.ts

/** Compact W/D/L pills shown inside the scorebug, under each team name.
 *  Oldest → newest left-to-right; dim → full opacity.
 *  Pads with 'X' (hollow circle) if fewer than 5 results.
 */
function ScoreBugForm({ form }: { form: string }) {
  const chars = form.split('').filter(c => 'WDL'.includes(c)).slice(-5);
  while (chars.length < 5) chars.unshift('X');
  return (
    <div className="wc-fd-scorebug-form">
      {chars.map((ch, i) => {
        const opacity = 0.35 + (i / 4) * 0.65;
        if (ch === 'X') {
          return <span key={i} className="wc-form-pill wc-form-pill--sm wc-form-pill--empty" style={{ opacity }}>X</span>;
        }
        const bg = ch === 'W' ? 'var(--ok)' : ch === 'D' ? 'var(--text-2)' : 'var(--danger)';
        return <span key={i} className="wc-form-pill wc-form-pill--sm" style={{ background: bg, opacity }}>{ch}</span>;
      })}
    </div>
  );
}

interface PlaygroundProps {
  userEmail: string;
  userAvatarUrl?: string | null;
}

// Static tournament catalogue — shown in the top-bar dropdown.
// Active matchup determines which entry is highlighted; others are future/historical.
const TOURNAMENT_CATALOGUE = [
  { id: 'wc-mens-2026',   label: "World Cup '26",         active: true  },
  { id: 'wc-womens-2027', label: "Women's World Cup '27", active: false },
];

// Utilities imported from playground-utils.tsx

// ── Component ─────────────────────────────────────────────────────────────────

export function Playground({ userEmail, userAvatarUrl: propAvatarUrl }: PlaygroundProps) {
  // Avatar: a fresh upload overrides the server-provided value for instant feedback.
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const userAvatarUrl = uploadedAvatar ?? propAvatarUrl;

  // ── Layout state ───────────────────────────────────────────────────────────
  const [leftNavOpen, setLeftNavOpen] = useState(true);
  const [matchupDrawerOpen, setMatchupDrawerOpen] = useState(false);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [notifSummary, setNotifSummary] = useState<Array<{
    matchupId: string;
    opponentName: string | null;
    opponentAvatarUrl: string | null;
    isPending: boolean;
    total: number;
    urgent: number;
  }>>([]);
  const [notifSummaryLoading, setNotifSummaryLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('chat');
  const [contentTab, setContentTab] = useState<ContentTab>('details');
  const [mobileView, setMobileView] = useState<MobileView>('feed');
  const [scoreChartOpen, setScoreChartOpen] = useState(false);
  const [scorebugHintVisible, setScorebugHintVisible] = useState(false);
  const scorebugHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Menu state ─────────────────────────────────────────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [tournamentMenuOpen, setTournamentMenuOpen] = useState(false);
  const tournamentMenuRef = useRef<HTMLDivElement>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const [cancelMatchupId, setCancelMatchupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const drawerRowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const drawerTouchStartX = useRef(0);
  const contentSwipeStartX = useRef<number | null>(null);
  const navRowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const navDragStart = useRef(0);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterStage, setFilterStage] = useState<string | null>(null);
  const [hideMyPicks, setHideMyPicks] = useState(false);
  const [hideOpponentPicks, setHideOpponentPicks] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  // "Today" jump button — shown only when today's fixtures are scrolled out of view.
  const [showTodayBtn, setShowTodayBtn] = useState(false);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  // Desktop drag-to-reorder: a user-defined ordering of matchups, persisted locally.
  const [matchupOrder, setMatchupOrder] = useState<string[]>([]);
  const [dragMatchupId, setDragMatchupId] = useState<string | null>(null);
  const [dragOverMatchupId, setDragOverMatchupId] = useState<string | null>(null);
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
  const [savingName, setSavingName] = useState(false);
  // Opponent presence on the selected matchup. "Online" means they currently
  // have the app open and focused — presence is tracked only while the tab is
  // visible and is keyed by app user id (see usePresence).
  const { anyOnline: opponentOnline } = usePresence(
    `presence-${selectedMatchupId ?? 'none'}`,
    myAppUserId ?? '',
    { enabled: Boolean(selectedMatchupId && myAppUserId) },
  );
  const [defaultPickSide, setDefaultPickSide] = useState<'HOME' | 'AWAY'>('HOME');
  const [savingDefaultPick, setSavingDefaultPick] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null); // null = hidden
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<import('@/app/components/profile-settings').NotificationPreferences | null>(null);
  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const autoScrolledMatchup = useRef<string | null>(null);
  // Pull-to-refresh (touch) on the fixture feed
  const pullStartY = useRef<number | null>(null);
  const pullDist = useRef(0);
  const [pullUI, setPullUI] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [headToHead, setHeadToHead] = useState<{ year: number; stage: string; home: string; away: string; homeGoals: number | null; awayGoals: number | null }[]>([]);
  const [h2hHome, setH2hHome] = useState<string>('');
  const [h2hAway, setH2hAway] = useState<string>('');
  const [teamForm, setTeamForm] = useState<TournamentForm | null>(null);
  const [squadData, setSquadData] = useState<SquadData | null>(null);
  const [squadLoading, setSquadLoading] = useState(false);
  const [recapData, setRecapData] = useState<RecapData | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [eventsData, setEventsData] = useState<EventsData | null>(null);
  const [preMatchData, setPreMatchData] = useState<PreMatchData | null>(null);

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

  // Filtered view for the feed
  const visibleFixtures = useMemo(() => {
    return fixtures.filter((f) => {
      // Hide fixtures where I've already made a pick
      if (hideMyPicks && (pickMap[f.id] ?? f.myPickSide)) return false;
      // Hide fixtures where opponent has already made a pick
      if (hideOpponentPicks && f.opponentPickSide) return false;
      return true;
    });
  }, [fixtures, hideMyPicks, hideOpponentPicks, pickMap]);

  // Total fixtures visible in the feed across ALL rounds (current + completed)
  const totalVisibleCount = useMemo(() => {
    const completedCount = Object.values(completedRoundFixtures)
      .reduce((sum, arr) => sum + arr.length, 0);
    return visibleFixtures.length + completedCount;
  }, [visibleFixtures.length, completedRoundFixtures]);

  const selectedMatchup = useMemo(
    () => matchups.find((m) => m.matchupId === selectedMatchupId) ?? null,
    [matchups, selectedMatchupId]
  );

  const oppAvatarUrl = selectedMatchup?.opponentAvatarUrl ?? null;

  // Load the saved matchup order after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('matchup-order') || '[]');
      if (Array.isArray(saved)) setMatchupOrder(saved.filter((x): x is string => typeof x === 'string'));
    } catch { /* ignore */ }
  }, []);

  // Matchups in the user's chosen order; any not in the saved order fall to the end.
  const orderedMatchups = useMemo(() => {
    if (matchupOrder.length === 0) return matchups;
    const rank = new Map(matchupOrder.map((id, i) => [id, i]));
    return [...matchups].sort(
      (a, b) => (rank.get(a.matchupId) ?? Infinity) - (rank.get(b.matchupId) ?? Infinity)
    );
  }, [matchups, matchupOrder]);

  // Per-matchup live duel tallies (mine vs opponent), shown next to each row in
  // the mobile matchup drawer. One call returns every matchup's live score
  // (settled + in-progress), matching the top scorebug.
  const [matchupScores, setMatchupScores] = useState<Record<string, { mine: number; opp: number }>>({});
  useEffect(() => {
    if (!matchupDrawerOpen) return;
    let cancelled = false;
    fetch('/api/matchups/tallies', { cache: 'no-store' })
      .then(r => r.json())
      .then(p => { if (!cancelled && p.ok) setMatchupScores(p.tallies ?? {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [matchupDrawerOpen]);

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

  // First unpicked fixture that is my turn to pick (used for mobile auto-scroll)
  // First fixture on (or after) today, in the viewer's local time — the anchor we
  // auto-scroll the feed to on open / when returning to the list.
  const todayAnchorFixtureId = useMemo(() => {
    if (!fixtures.length) return null;
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sorted = [...fixtures].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
    const localMid = (iso: string) => {
      const d = new Date(iso);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    // today's first match, else the next upcoming match, else the last fixture
    return (sorted.find((f) => localMid(f.startsAt) >= todayMid) ?? sorted[sorted.length - 1]).id;
  }, [fixtures]);

  // Combined height of the sticky stage header + matchday sub-header, so scrolls
  // land a fixture just below them instead of behind them.
  function feedStickyOffset(container: HTMLElement): number {
    const roundH = container.querySelector('.wc-round-section-header')?.getBoundingClientRect().height ?? 33;
    const mdH = container.querySelector('.wc-matchday-header')?.getBoundingClientRect().height ?? 28;
    return roundH + mdH + 6;
  }

  function scrollFeedToFixture(fixtureId: string, behavior: ScrollBehavior = 'smooth') {
    const container = feedScrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-fixture-id="${fixtureId}"]`);
    if (!el) return;
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top
      + container.scrollTop - feedStickyOffset(container);
    container.scrollTo({ top: Math.max(0, top), behavior });
  }

  function scrollFeedToToday() {
    if (todayAnchorFixtureId) scrollFeedToFixture(todayAnchorFixtureId);
    setShowTodayBtn(false);
  }

  // Boolean (not a narrowing comparison) so JSX guards using it don't narrow the
  // `mobileView` union away from 'chat' for sibling elements.
  const mobileChatOpen: boolean = mobileView === 'chat';

  // Show the "Today" jump button whenever today's anchor fixture is scrolled out
  // of the visible feed region (above the fold or below it).
  const updateTodayBtn = useCallback(() => {
    const c = feedScrollRef.current;
    if (!c || !todayAnchorFixtureId) { setShowTodayBtn(false); return; }
    const el = c.querySelector<HTMLElement>(`[data-fixture-id="${todayAnchorFixtureId}"]`);
    if (!el) { setShowTodayBtn(false); return; }
    const cRect = c.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const stickyTop = cRect.top + feedStickyOffset(c);
    const visible = eRect.bottom > stickyTop && eRect.top < cRect.bottom;
    setShowTodayBtn(!visible);
  }, [todayAnchorFixtureId]);

  // ── Mobile chat keyboard handling ───────────────────────────────────────────
  // When the on-screen keyboard opens, iOS shrinks the *visual* viewport but not
  // the layout viewport, and it scrolls the layout to reveal the focused input.
  // A `position: fixed; top: 0` overlay then ends up partly above the visible
  // area (blank space) with the composer behind the keyboard. We pin the chat
  // overlay exactly to the visual viewport by mirroring its height (--vvh) AND
  // its scroll offset (--vv-top, applied as a translateY), and we lock the body
  // so the page itself can't scroll underneath while chat is open.
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty('--vvh');
      root.style.removeProperty('--vv-top');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('width');
    };
    if (mobileView !== 'chat' || !vv) { clear(); return; }

    // Lock the body so focusing the input can't scroll the page behind the overlay.
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    const apply = () => {
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      clear();
    };
  }, [mobileView]);

  // ── Scorebug hint ──────────────────────────────────────────────────────────

  function dismissScorebugHint() {
    if (scorebugHintTimer.current) clearTimeout(scorebugHintTimer.current);
    setScorebugHintVisible(false);
    try { localStorage.setItem('scorebug-hint-seen', '1'); } catch { /* storage blocked */ }
  }

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

  // ── Notification summary ───────────────────────────────────────────────────

  const fetchNotifSummary = useCallback(async () => {
    setNotifSummaryLoading(true);
    try {
      const res = await fetch('/api/notifications/summary', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setNotifSummary(data.matchups ?? []);
      }
    } catch {
      // non-fatal
    } finally {
      setNotifSummaryLoading(false);
    }
  }, []);

  // Stable so ChatPanel's effects don't re-fire every render (an inline handler
  // here previously drove a /messages request loop).
  const handleChatMarkRead = useCallback(() => {
    fetch('/api/messages/unread-count', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTotalUnread(d.total ?? 0); })
      .catch(() => {});
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

  // GA4 virtual page views — fires whenever the mobile view changes so GA
  // sees distinct "pages" even though the URL stays at /play.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.gtag) return;

    let pagePath: string;
    let pageTitle: string;

    if (mobileView === 'feed') {
      // Include the current stage so GA shows "matches/group-stage" vs "matches/quarterfinal"
      const stage = currentRound?.stage?.toLowerCase().replace(/_/g, '-') ?? 'unknown';
      pagePath  = `/play/matches/${stage}`;
      pageTitle = `Matches – ${currentRound?.stage ?? 'unknown'}`;
    } else if (mobileView === 'content' && selectedFixture) {
      // Slug: "united-states-vs-mexico"
      const slug = [selectedFixture.homeTeam, selectedFixture.awayTeam]
        .map((t) => t.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
        .join('-vs-');
      pagePath  = `/play/fixture/${slug}`;
      pageTitle = `${selectedFixture.homeTeam} vs ${selectedFixture.awayTeam}`;
    } else {
      const fallbacks: Record<MobileView, string> = {
        home:    '/play',
        feed:    '/play/matches',
        content: '/play/fixture',
        chat:    '/play/chat',
        profile: '/play/profile',
      };
      pagePath  = fallbacks[mobileView];
      pageTitle = mobileView;
    }

    window.gtag('event', 'page_view', {
      page_path:  pagePath,
      page_title: pageTitle,
    });
  }, [mobileView, currentRound, selectedFixture]);

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

    // If the user tapped a "Pick Now" notification, activate the Pick Now filter
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('filter') === 'pick-now' || params.get('filter') === 'hide-my-picks') {
        setHideMyPicks(true);
        // Remove the param from the URL without a reload
        const clean = window.location.pathname;
        window.history.replaceState({}, '', clean);
      }
    }
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
    setMobileView('feed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchupId]);

  // Show scorebug hint once, after the first matchup with an opponent loads
  useEffect(() => {
    if (!selectedMatchup?.opponentDisplayName && !selectedMatchup?.opponentEmail) return;
    try { if (localStorage.getItem('scorebug-hint-seen')) return; } catch { return; }
    // Short delay so the page settles before the hint appears
    scorebugHintTimer.current = setTimeout(() => {
      setScorebugHintVisible(true);
      // Auto-dismiss after 5 s
      scorebugHintTimer.current = setTimeout(dismissScorebugHint, 5000);
    }, 1200);
    return () => { if (scorebugHintTimer.current) clearTimeout(scorebugHintTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchup?.matchupId]);

  // Live score polling — 15s, only while a fixture in view is actually LIVE.
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

  // Show onboarding for new users arriving from invite link or first sign-in
  useEffect(() => {
    const seen = localStorage.getItem('md_onboarding_v1');
    if (!seen) {
      const isOnboarding = new URLSearchParams(window.location.search).get('onboarding') === '1';
      if (isOnboarding) setOnboardingStep(1);
    }
  }, []);

  // Apply persisted theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('wc-theme') as 'system' | 'light' | 'dark' | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
      applyThemeClass(saved);
    }
  }, []);

  // Fetch pre-match context whenever a fixture is selected
  useEffect(() => {
    if (!selectedFixtureId) { setPreMatchData(null); return; }
    fetch(`/api/fixtures/${selectedFixtureId}/pre-match`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.ok) setPreMatchData(d); })
      .catch(() => {});
  }, [selectedFixtureId]);

  // Fetch head-to-head history whenever a fixture is selected
  useEffect(() => {
    if (!selectedFixtureId) { setHeadToHead([]); setH2hHome(''); setH2hAway(''); return; }
    fetch(`/api/fixtures/${selectedFixtureId}/head-to-head`)
      .then(r => r.json())
      .then(d => { setHeadToHead(d.meetings ?? []); setH2hHome(d.home ?? ''); setH2hAway(d.away ?? ''); })
      .catch(() => {});
  }, [selectedFixtureId]);

  // Fetch squad lineups when the Squad tab is active. Official lineups publish
  // ~20-40 min before kickoff and can change late, so while the match is
  // SCHEDULED and near kickoff we poll every 60s — lineups appear (and late
  // changes surface) without the user having to reopen the tab. Silent refreshes
  // don't flash the loading state or blank existing data.
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
    const msToKickoff = selectedFixture?.startsAt ? new Date(selectedFixture.startsAt).getTime() - Date.now() : Infinity;
    if (selectedFixture?.status === 'SCHEDULED' && msToKickoff < 90 * 60 * 1000) {
      interval = setInterval(() => fetchSquad(true), 60_000);
    }

    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [contentTab, selectedFixtureId, selectedFixture?.status, selectedFixture?.startsAt]);

  // Fetch match statistics + events when the Recap tab is active.
  // While the match is LIVE, refresh on an interval so the timeline and stats
  // keep up during play. Silent refreshes don't flash the loading state or blank
  // the existing data. Backend caches LIVE stats/events for 2 min, so a 60s poll
  // surfaces new data promptly without extra API cost (faster just re-reads cache).
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
    if (selectedFixture?.status === 'LIVE') {
      // 15s while live. Backend caches LIVE stats/events for ~2 min, so most of
      // these re-reads hit that cache rather than API-Football.
      interval = setInterval(() => fetchRecap(true), 15_000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [contentTab, selectedFixtureId, selectedFixture?.status]);

  // Scroll the fixture feed so the selected fixture sits just below the sticky
  // stage + matchday headers (not hidden behind them).
  useEffect(() => {
    if (!selectedFixtureId) return;
    scrollFeedToFixture(selectedFixtureId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFixtureId]);

  // Auto-scroll the fixture list to today's date once per matchup load (app open
  // / matchup switch). Delay lets React commit all fixture rows first.
  useEffect(() => {
    if (!todayAnchorFixtureId || !visibleFixtures.length) return;
    if (autoScrolledMatchup.current === selectedMatchupId) return;
    autoScrolledMatchup.current = selectedMatchupId ?? null;
    const timer = setTimeout(scrollFeedToToday, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAnchorFixtureId, visibleFixtures.length, selectedMatchupId]);

  // Re-scroll to today whenever the user returns to the fixture list (mobile back).
  useEffect(() => {
    if (mobileView !== 'feed') return;
    const timer = setTimeout(scrollFeedToToday, 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileView]);

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
      if (payload.notificationPreferences) {
        setNotificationPreferences(payload.notificationPreferences);
      }
    }
  }

  async function saveNotificationPreferences(prefs: import('@/app/components/profile-settings').NotificationPreferences) {
    setNotificationPreferences(prefs);
    await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationPreferences: prefs }),
    }).catch(() => {});
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
    // Silently prefetch notification counts so bell badge is ready
    fetchNotifSummary();
  }

  async function loadStandings(matchupId: string) {
    const res = await fetch(`/api/matchups/${matchupId}/standings`, { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || !payload.ok) return;
    setStanding(payload.standing ?? []);
    setRoundResults(payload.roundResults ?? []);
  }

  // Pull-to-refresh: re-read the latest fixtures/standings from the server (the
  // background cron keeps the DB current within ~1 min, including settling any
  // match that just finished). No full re-sync needed.
  async function refreshFixtures() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (selectedMatchupId) {
        await Promise.all([loadCurrentRoundAndFixtures(selectedMatchupId), loadStandings(selectedMatchupId)]);
      }
    } finally {
      setRefreshing(false);
    }
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
    fetchNotifSummary();
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

  /**
   * Render the fixture as a shareable PNG and put it on the clipboard so it can
   * be pasted straight into a messaging app. Falls back to the native share
   * sheet (mobile) and then to a download if the clipboard image API is absent.
   */
  async function shareMatchCard(f: Fixture, stage: string) {
    if (sharingCard) return;
    setSharingCard(true);

    const buildCard = async (): Promise<Blob> => {
      // Goals for the timeline. Non-fatal: a card without scorers still reads fine.
      const ev = await fetch(`/api/fixtures/${f.id}/events`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null);
      const goals: ShareGoal[] = ((ev?.events ?? []) as MatchEvent[])
        // API-Football reports a missed penalty as type 'Goal' too — exclude it,
        // or the running score overshoots the real result.
        .filter((e) => e.type === 'Goal' && !/missed/i.test(e.detail ?? ''))
        .map((e) => {
          // Compare by code: the events feed uses its own team-name variants.
          const scoredBy: 'HOME' | 'AWAY' =
            teamCode(e.team) === teamCode(f.awayTeam) ? 'AWAY' : 'HOME';
          // An own goal counts for the opponent.
          const isOwn = /own/i.test(e.detail ?? '');
          const side: 'HOME' | 'AWAY' = isOwn ? (scoredBy === 'HOME' ? 'AWAY' : 'HOME') : scoredBy;
          return { side, player: e.player, minute: e.minute, extraMinute: e.extraMinute, detail: e.detail };
        });

      const myName = displayName || userEmail.split('@')[0];
      const oppName = selectedMatchup?.opponentDisplayName
        ?? selectedMatchup?.opponentEmail?.split('@')[0]
        ?? 'Opponent';

      // Live standing totals — same numbers as the header H2H scorebug
      // (settled tournament points + this round's provisional points). Resolve
      // by email: myParticipantId only gets populated from the current round's
      // pick-order fetch, which is skipped once the tournament is fully
      // complete for this matchup, silently zeroing my own total.
      const myEntry = standing.find((s) => s.email === userEmail);
      const oppEntry = standing.find((s) => s.email !== userEmail);
      const myTotal = (myEntry?.tournamentPoints ?? 0) + provisionalPoints.mine;
      const oppTotal = (oppEntry?.tournamentPoints ?? 0) + provisionalPoints.opp;

      return renderMatchShareCard({
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        homePenScore: f.homePenScore,
        awayPenScore: f.awayPenScore,
        status: f.status,
        kickoff: f.startsAt,
        stageLabel: fmtStage(stage),
        goals,
        pickers: [
          { name: myName, side: pickMap[f.id] ?? f.myPickSide ?? null, currentPoints: myTotal, avatarUrl: userAvatarUrl },
          { name: oppName, side: f.opponentPickSide ?? null, currentPoints: oppTotal, avatarUrl: oppAvatarUrl },
        ],
        pointsAtStake: STAGE_POINTS[stage] ?? 1,
      });
    };

    try {
      // Clipboard image first — that's the copy/paste flow. ClipboardItem is
      // handed the *promise*: awaiting the render before calling write() spends
      // the click's user activation, and the browser then rejects the write with
      // NotAllowedError. Constructing it synchronously keeps the gesture alive.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': buildCard() })]);
          showNotice('ok', 'Match card copied — paste it anywhere.');
          return;
        } catch (clipErr) {
          // Image clipboard isn't universal (Firefox, some iOS versions, denied
          // permission). Fall through to the share sheet / download instead of
          // reporting a failure the user can't act on.
          console.warn('[share-card] clipboard unavailable, falling back', clipErr);
        }
      }

      const blob = await buildCard();
      const file = new File([blob], `${teamCode(f.homeTeam)}-${teamCode(f.awayTeam)}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
      showNotice('ok', 'Match card downloaded.');
    } catch (err) {
      // A user cancelling the native share sheet isn't an error worth shouting about.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[share-card]', err);
      const why = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      showNotice('error', `Could not create the match card — ${why}`);
    } finally {
      setSharingCard(false);
    }
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
    // Picks for a later round stay locked until the current round is settled
    // (the server also enforces this — see picks.ts round-gating). Once the
    // current round settles, it advances and this fixture's round becomes current.
    // Fixture → round is resolved by membership: current-round fixtures live in
    // `fixtures`; other rounds in `completedRoundFixtures` (keyed by round id).
    const fRoundId = fixtures.some((x) => x.id === f.id)
      ? currentRound?.id
      : Object.keys(completedRoundFixtures).find((rid) => completedRoundFixtures[rid]?.some((x) => x.id === f.id));
    const fRound = allRounds.find((r) => r.id === fRoundId);
    const isFutureRoundPick = !!(fRound && currentRound && fRound.order_index > currentRound.order_index);
    // The pick unlocks when the round immediately BEFORE this fixture's round
    // settles (rounds complete in order). Name THAT round — not the matchup's
    // current round, which is wrong for any fixture more than one round ahead
    // (e.g. clicking the Final during the Round of 32 should point to the round
    // that actually gates it, the Third Place match).
    const gatingRound = fRound
      ? allRounds.find((r) => r.order_index === fRound.order_index - 1)
      : null;
    // Use the SELECTED fixture's own round for its stage label + points — not the
    // matchup's current round, which mislabels a fixture from a different round
    // (e.g. viewing the Final while Third Place is the current round showed
    // "Third Place", and scored it with the wrong stage multiplier).
    const stage = fRound?.stage ?? currentRound?.stage ?? '';
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
          {/* Share the match as an image (copy/paste into a chat) */}
          <button
            className="wc-fd-share-btn"
            type="button"
            disabled={sharingCard}
            aria-label="Share match card"
            title="Share match card"
            onClick={() => shareMatchCard(f, fRound?.stage ?? currentRound?.stage ?? 'GROUP')}
          >
            {sharingCard ? (
              <span className="wc-fd-share-spinner" aria-hidden="true" />
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
          </button>

          {/* Group / stage label */}
          <div className="wc-fd-scorebug-group">
            {f.groupName ? `Group ${f.groupName}` : stage ? fmtStage(stage) : ''}
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
              <h2 className="wc-fd-scorebug-name">{f.homeTeam}</h2>
              <ScoreBugForm form={preMatchData?.homeForm ?? ''} />
            </div>

            {/* Score center */}
            <div className="wc-fd-scorebug-center">
              <div className="wc-fd-scorebug-nums">
                <span>{f.homeScore !== null ? f.homeScore : '—'}</span>
                <span className="wc-fd-scorebug-sep">–</span>
                <span>{f.awayScore !== null ? f.awayScore : '—'}</span>
              </div>
              {penaltyWinner(f) && (
                <div className="wc-fd-scorebug-pens">{f.homePenScore}–{f.awayPenScore} pens</div>
              )}
              <div className="wc-fd-scorebug-status">
                <StatusGlyph status={f.status} isLocked={f.isLocked || iPickFirst === false} size={13} />
              </div>
              <div className="wc-fd-scorebug-kickoff">
                {liveMatchClock(f)
                  ? <span className="wc-fd-live-clock">{liveMatchClock(f)}</span>
                  : new Date(f.startsAt).toLocaleString(undefined, {
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
              <h2 className="wc-fd-scorebug-name">{f.awayTeam}</h2>
              <ScoreBugForm form={preMatchData?.awayForm ?? ''} />
            </div>
          </div>
        </div>


        {/* ── Detail body — centred 3/5 on desktop ─────────────────── */}
        <div className="wc-fd-detail-body">

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
                <h3 className="wc-fd-section-label">Who will win?</h3>

                {isFutureRoundPick ? (
                  /* Next round(s) stay locked until the current round is settled */
                  <p className="wc-pick-hint wc-pick-hint--locked" style={{ margin: '0 0 6px' }}>
                    Picks open once {(gatingRound ?? currentRound)?.stage ? fmtStage((gatingRound ?? currentRound)!.stage) : 'the current round'} is settled.
                  </p>
                ) : f.isLocked ? (
                  /* Post-kickoff: show picks with chose/assigned context */
                  <div className="wc-fd-locked-picks">
                    <div className="wc-fd-locked-pick">
                      <span className="wc-fd-locked-pick-you">
                        {iAmFirstPicker ? 'You Chose' : 'You Were Assigned'}
                      </span>
                      <span className="wc-fd-locked-pick-team">
                        {myEffectivePick ? (myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam) : '—'}
                      </span>
                    </div>
                    <div className="wc-fd-locked-pick">
                      <span className="wc-fd-locked-pick-you">
                        {iAmFirstPicker ? 'Opponent Was Assigned' : 'Opponent Chose'}
                      </span>
                      <span className="wc-fd-locked-pick-team">
                        {oppEffectivePick ? (oppEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam) : '—'}
                      </span>
                    </div>
                  </div>
                ) : iAmFirstPicker ? (
                  /* First picker: dropdown + save */
                  <>
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
                      <div className="wc-fd-assigned-label">You&apos;ve Been Assigned</div>
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
                <div className={`wc-fd-outcome${myPoints > 0 ? ' wc-fd-outcome--scored' : isGenuineDraw(f) ? ' wc-fd-outcome--draw' : ' wc-fd-outcome--missed'}`}>
                  {`${(displayName || userEmail.split('@')[0]).trim().split(/\s+/)[0]}: ${myPoints}`}
                </div>
              )}
            </>
          );
        })()}

        {/* ── Pre-match context ─────────────────────────────────────── */}
        {preMatchData && <PreMatchPanel data={preMatchData} isKnockout={!!stage && stage !== 'GROUP'} />}

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
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            });

            return (
              <button
                key={fc.id}
                className="wc-scorebug"
                onClick={() => {
                  setSelectedFixtureId(fc.id);
                  setHeadToHead([]);
                  setTeamForm(null);
                  fetch(`/api/fixtures/${fc.id}/head-to-head`)
                    .then(r => r.json())
                    .then(d => { setHeadToHead(d.meetings ?? []); setH2hHome(d.home ?? ''); setH2hAway(d.away ?? ''); })
                    .catch(() => {});
                  const url = selectedMatchupId
                    ? `/api/fixtures/${fc.id}/form?matchupId=${selectedMatchupId}`
                    : `/api/fixtures/${fc.id}/form`;
                  fetch(url).then(r => r.json()).then(d => { if (d.ok) setTeamForm(d); }).catch(() => {});
                }}
              >
                <div className="wc-scorebug-group">
                  <span>{fc.groupName ? `Group ${fc.groupName}` : ''}</span>
                  <span className="wc-scorebug-kickoff">{kickoffLabel}</span>
                </div>
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
              </button>
            );
          }

          return (
            <>
              {teamForm.homeFixtures.length > 0 && (
                <div className="wc-fd-section">
                  <h3 className="wc-fd-section-label">{teamForm.homeTeam}</h3>
                  <div className="wc-form-list">
                    {teamForm.homeFixtures.map(renderFormCard)}
                  </div>
                </div>
              )}
              {teamForm.awayFixtures.length > 0 && (
                <div className="wc-fd-section">
                  <h3 className="wc-fd-section-label">{teamForm.awayTeam}</h3>
                  <div className="wc-form-list">
                    {teamForm.awayFixtures.map(renderFormCard)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* Previous Meetings (competitive, non-friendly) */}
        {selectedFixtureId && (
          <div className="wc-fd-section">
            <h3 className="wc-fd-section-label">Previous Meetings</h3>
            {headToHead.length > 0 ? (
              <div className="wc-card wc-h2h-history">
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
            ) : (
              <p className="wc-h2h-none">These teams have never met in a competitive match.</p>
            )}
          </div>
        )}

        </div>{/* /wc-fd-detail-body */}
      </div>
    );
  }

  // ── Render: Standings ──────────────────────────────────────────────────────

  function renderStandings() {
    const myEntry = standing.find((s) => s.email === userEmail);
    const opponentEntry = standing.find((s) => s.email !== userEmail);
    // Include live provisional points so this panel matches the header scorebug.
    const myTotal  = (myEntry?.tournamentPoints ?? 0) + provisionalPoints.mine;
    const oppTotal = (opponentEntry?.tournamentPoints ?? 0) + provisionalPoints.opp;
    const statusLabel = (() => {
      if (!myEntry || !opponentEntry) return null;
      if (myTotal > oppTotal) return 'Leading';
      if (myTotal < oppTotal) return 'Behind';
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
                <div className="wc-standings-pts">{myTotal}</div>
                <div className="wc-standings-label">pts</div>
              </div>
              {statusLabel && <div className="wc-standings-status">{statusLabel}</div>}
              <div className="wc-standings-col wc-standings-col--right">
                <div className="wc-standings-name">
                  {opponentEntry?.displayName ?? opponentEntry?.email ?? 'Opponent'}
                </div>
                <div className="wc-standings-pts">{oppTotal}</div>
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

    if (squadLoading) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>Loading lineups…</p>
        </div>
      );
    }

    if (!squadData || !squadData.available) {
      const msg = !squadData || squadData.reason === 'not_yet_available'
        ? 'Lineups are confirmed approximately 1 hour before kickoff.'
        : squadData.reason === 'no_external_id'
          ? 'Lineup data will be available once fixtures are synced from API-Football.'
          : 'Lineup data unavailable for this fixture.';
      return (
        <div className="wc-content-empty">
          <p style={{ fontWeight: 700, margin: '0 0 6px' }}>
            {selectedFixture.homeTeam} vs {selectedFixture.awayTeam}
          </p>
          <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>{msg}</p>
        </div>
      );
    }

    const home = squadData.home;
    const away = squadData.away;

    // Build formation lines ordered own-goal -> attack (GK first). For the away
    // side we reverse so its attackers sit next to the home attackers at the
    // halfway line, forming one continuous, opposing field.
    function buildLines(lineup: NonNullable<SquadData['home']>, reverse: boolean) {
      const rows = new Map<number, typeof lineup.starters>();
      for (const p of lineup.starters) {
        const row = p.grid ? parseInt(p.grid.split(':')[0]) : 99;
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row)!.push(p);
      }
      for (const [, players] of rows) {
        players.sort((a, b) => {
          const ca = a.grid ? parseInt(a.grid.split(':')[1]) : 0;
          const cb = b.grid ? parseInt(b.grid.split(':')[1]) : 0;
          return ca - cb;
        });
      }
      const lines = [...rows.entries()].sort(([a], [b]) => a - b).map(([, players]) => players);
      return reverse ? lines.reverse() : lines;
    }

    const homeLines = home ? buildLines(home, false) : []; // GK → attack
    const awayLines = away ? buildLines(away, true) : [];  // attack → GK

    const renderHalf = (lines: ReturnType<typeof buildLines>, side: 'home' | 'away') => (
      <div className={`wc-squad-field-half wc-squad-field-half--${side}`}>
        {lines.map((line, i) => (
          <div key={i} className="wc-squad-line">
            {line.map(p => (
              <div key={p.number} className="wc-squad-player">
                <div className={`wc-squad-player-num wc-squad-player-num--${(p.pos ?? '').toLowerCase()}`}>{p.number}</div>
                <div className="wc-squad-player-name">{p.name.split(' ').pop()}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );

    // Coaches sit on the INNER edge of each header (toward the centre); team
    // identity (flag + name + formation) stays on the outer edge.
    const renderHead = (lineup: NonNullable<SquadData['home']>, side: 'home' | 'away') => (
      <div className={`wc-squad-head wc-squad-head--${side}`}>
        <div className="wc-squad-head-id">
          <span className="wc-squad-head-flag">{teamFlag(lineup.teamName)}</span>
          <div className="wc-squad-head-text">
            <span className="wc-squad-head-name">{lineup.teamName}</span>
            <span className="wc-squad-head-meta">{lineup.formation}</span>
          </div>
        </div>
        {lineup.coachName && (
          <div className="wc-squad-head-coach">
            <span className="wc-squad-head-coach-name">{lineup.coachName}</span>
          </div>
        )}
      </div>
    );

    const posLabel = (pos: string | null) => (
      pos ? ({ g: 'Goalkeeper', d: 'Defender', m: 'Midfielder', f: 'Forward' }[pos.toLowerCase()] ?? pos) : null
    );

    type PairItem = { key: string; num?: number; name: string; sub?: string | null };

    const renderPairCell = (item: PairItem | undefined, side: 'home' | 'away') => (
      <div className={`wc-squad-cell wc-squad-cell--${side}`}>
        {item && (
          <>
            {item.num != null && <span className="wc-squad-cell-num">{item.num}</span>}
            <div className="wc-squad-cell-info">
              <span className="wc-squad-cell-name">
                <span className="wc-name-full">{item.name}</span>
                <span className="wc-name-last">{item.name.split(' ').pop()}</span>
              </span>
              {item.sub && <span className="wc-squad-cell-sub">{item.sub}</span>}
            </div>
          </>
        )}
      </div>
    );

    // Combined table — one row per pair, home on the left, away on the right.
    const renderPairTable = (title: string, homeItems: PairItem[], awayItems: PairItem[]) => {
      const n = Math.max(homeItems.length, awayItems.length);
      if (n === 0) return null;
      return (
        <div className="wc-squad-table">
          <div className="wc-squad-table-title">{title}</div>
          <div className="wc-squad-table-rows">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className="wc-squad-pair-row">
                {renderPairCell(homeItems[i], 'home')}
                {renderPairCell(awayItems[i], 'away')}
              </div>
            ))}
          </div>
        </div>
      );
    };

    const homeUnavail = home?.unavailable ?? [];
    const awayUnavail = away?.unavailable ?? [];

    return (
      <div className="wc-squad">
        {/* Coaches / team identity on top */}
        <div className="wc-squad-heads">
          {home && renderHead(home, 'home')}
          {away && renderHead(away, 'away')}
        </div>

        {/* One combined, opposing field */}
        <div className="wc-squad-field">
          {home && renderHalf(homeLines, 'home')}
          <div className="wc-squad-halfway" aria-hidden="true" />
          {away && renderHalf(awayLines, 'away')}
        </div>

        {/* Combined substitutes (home left, away right) */}
        {renderPairTable(
          'Substitutes',
          (home?.substitutes ?? []).map(p => ({ key: `h${p.number}`, num: p.number, name: p.name, sub: posLabel(p.pos) })),
          (away?.substitutes ?? []).map(p => ({ key: `a${p.number}`, num: p.number, name: p.name, sub: posLabel(p.pos) })),
        )}

        {/* Unavailable players */}
        {renderPairTable(
          'Unavailable',
          homeUnavail.map((p, i) => ({ key: `hu${i}`, name: p.name, sub: p.reason })),
          awayUnavail.map((p, i) => ({ key: `au${i}`, name: p.name, sub: p.reason })),
        )}
      </div>
    );
  }

  // ── Render: Recap tab ─────────────────────────────────────────────────────

  function renderRecap() {
    if (!selectedFixture) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle">Select a fixture to view the recap.</p>
        </div>
      );
    }
    if (selectedFixture.status !== 'FINAL' && selectedFixture.status !== 'LIVE') {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
            Stats will be available once the match is underway.
          </p>
        </div>
      );
    }
    if (recapLoading) {
      return (
        <div className="wc-content-empty">
          <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>Loading stats…</p>
        </div>
      );
    }
    // Stats may not be ready early in a live match — that's fine, we still render
    // the timeline (which always carries a Kick Off marker) so the recap is never
    // blank for a match that's underway. Team names come from stats when present
    // (API spelling that matches the event feed), else from our fixture.
    const statsAvailable = recapData?.available === true;
    const homeTeam = recapData?.homeTeam ?? selectedFixture.homeTeam;
    const awayTeam = recapData?.awayTeam ?? selectedFixture.awayTeam;
    const stats = recapData?.stats ?? [];
    const isFinal = selectedFixture.status === 'FINAL';

    // ── Timeline ────────────────────────────────────────────────────────────
    const allEvents = eventsData?.available ? eventsData.events : [];
    const isShootoutKick = (e: typeof allEvents[number]) =>
      (e.comments ?? '').toLowerCase().includes('shootout');
    // Shootout kicks are pulled out of the minute-by-minute timeline and shown in
    // their own breakdown section.
    const shootoutKicks = allEvents.filter(isShootoutKick);
    const timeline = allEvents.filter(e => !isShootoutKick(e));
    const maxMinute = timeline.reduce((m, e) => Math.max(m, (e.minute ?? 0) + (e.extraMinute ?? 0)), 0);

    // ── Build enhanced timeline with period markers ────────────────
    type TLItem = (typeof timeline)[number] & { _periodLabel?: string };
    const enhancedTimeline: TLItem[] = [];
    const mkPeriod = (label: string, minute: number): TLItem =>
      ({ type: 'PERIOD' as unknown as 'Var', _periodLabel: label, player: '', assist: null, detail: label, team: '', minute, extraMinute: null, comments: null });

    let halfAdded = false, fullAdded = false, et1Added = false;

    // Match Start — always shown once a match is underway.
    enhancedTimeline.push(mkPeriod('Kick Off', 0));

    for (const ev of timeline) {
      if (!halfAdded && ev.minute > 45 && !ev.extraMinute) { enhancedTimeline.push(mkPeriod('Half Time', 45)); halfAdded = true; }
      if (!fullAdded && isFinal && ev.minute > 90 && !ev.extraMinute) { enhancedTimeline.push(mkPeriod('Full Time', 90)); fullAdded = true; }
      if (!et1Added && ev.minute > 105 && !ev.extraMinute) { enhancedTimeline.push(mkPeriod('End of Extra Time 1', 105)); et1Added = true; }
      enhancedTimeline.push(ev as TLItem);
    }
    // Only add markers the match has actually reached — never show Half Time or
    // Full Time on a match that hasn't got there yet.
    if (!halfAdded && (isFinal || maxMinute > 45)) enhancedTimeline.push(mkPeriod('Half Time', 45));
    // Match Ended — only once the match is final.
    if (isFinal && !fullAdded) enhancedTimeline.push(mkPeriod('Full Time', 90));

    function TimelineIcon({ type, detail }: { type: string; detail: string }) {
      const t = type.toLowerCase();
      if (t === 'period') {
        if (detail === 'Kick Off') return (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" stroke="var(--text-2)" strokeWidth="1.5"/>
            <path d="M5.5 5 L9 7 L5.5 9 Z" fill="var(--text-2)"/>
          </svg>
        );
        // Checkered flag for Full Time / End of Extra Time
        return (
          <svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-hidden="true">
            {/* Pole */}
            <line x1="1.5" y1="1" x2="1.5" y2="11" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round"/>
            {/* Flag background */}
            <rect x="2" y="1" width="13" height="6" rx="1" fill="var(--text-0)"/>
            {/* Checkered squares — 3 cols × 2 rows */}
            <rect x="2"    y="1" width="4.3" height="3" fill="white"/>
            <rect x="6.3"  y="1" width="4.3" height="3" fill="var(--text-0)"/>
            <rect x="10.6" y="1" width="4.4" height="3" fill="white"/>
            <rect x="2"    y="4" width="4.3" height="3" fill="var(--text-0)"/>
            <rect x="6.3"  y="4" width="4.3" height="3" fill="white"/>
            <rect x="10.6" y="4" width="4.4" height="3" fill="var(--text-0)"/>
          </svg>
        );
      }
      if (t === 'goal') {
        if (detail.includes('Missed')) return (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        );
        return <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚽</span>;
      }
      if (t === 'card') {
        const isRed = detail.includes('Red');
        return (
          <svg width="10" height="13" viewBox="0 0 10 13" fill="none" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="12" rx="1.5"
              fill={isRed ? 'var(--danger)' : 'var(--warn)'} stroke={isRed ? 'var(--danger)' : 'var(--warn)'}/>
          </svg>
        );
      }
      if (t === 'subst') {
        return (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {/* Top arc + arrowhead — green (coming on) */}
            <path d="M3 8 A5 5 0 0 1 13 8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round"/>
            <path d="M11 5.2 L13 8 L10.2 8.8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            {/* Bottom arc + arrowhead — red (going off) */}
            <path d="M13 8 A5 5 0 0 1 3 8" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"/>
            <path d="M5 10.8 L3 8 L5.8 7.2" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      }
      // Injury break — red cross
      if (detail.toLowerCase().includes('injury')) return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1.5 L6 10.5 M1.5 6 L10.5 6" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      );
      return <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-2)' }}>VAR</span>;
    }

    function parseNum(v: number | string | null): number {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'number') return v;
      return parseFloat(String(v).replace('%', '')) || 0;
    }

    // ── Penalty shootout breakdown ──────────────────────────────────────────
    type Kick = { player: string; team: string; scored: boolean };
    const shootout: Kick[] = shootoutKicks.map(e => ({
      player: e.player,
      team: e.team,
      scored: !/miss|saved/i.test(e.detail),
    }));

    const homeKicks = shootout.filter(k => k.team === homeTeam);
    const awayKicks = shootout.filter(k => k.team === awayTeam);
    const shootoutRounds = Math.max(homeKicks.length, awayKicks.length);
    const homePen = selectedFixture.homePenScore ?? homeKicks.filter(k => k.scored).length;
    const awayPen = selectedFixture.awayPenScore ?? awayKicks.filter(k => k.scored).length;
    const homePenWin = homePen > awayPen;

    const KickMark = ({ scored }: { scored: boolean }) =>
      scored ? (
        <span className="wc-pk-mark wc-pk-mark--scored" aria-label="scored">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6.5 L5 9 L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <span className="wc-pk-mark wc-pk-mark--missed" aria-label="missed">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      );

    return (
      <div className="wc-recap">

        {/* ── Match timeline ──────────────────────────────────────────── */}
        {enhancedTimeline.length > 0 && (() => {
          // Pre-calculate running score at each goal event (by position in enhancedTimeline)
          const runningScores = new Map<number, string>();
          let rHome = 0, rAway = 0;
          enhancedTimeline.forEach((ev, i) => {
            const t = ev.type.toLowerCase();
            if (t === 'goal' && !ev.detail.includes('Missed') && !ev.detail.toLowerCase().includes('saved')) {
              const isOG = ev.detail.includes('Own Goal');
              // Own goal: scored against the team that conceded it
              if (!isOG) { if (ev.team === homeTeam) rHome++; else rAway++; }
              else        { if (ev.team === homeTeam) rAway++; else rHome++; }
              runningScores.set(i, `${rHome}-${rAway}`);
            }
          });

          // Helper: render a single event row
          function EventRow({ ev, i }: { ev: TLItem; i: number }) {
            const t = ev.type.toLowerCase();
            const isHome      = ev.team === homeTeam;
            const min         = ev.extraMinute ? `${ev.minute}+${ev.extraMinute}'` : `${ev.minute}'`;
            const goalScore   = runningScores.get(i) ?? null;
            const isGoal      = t === 'goal';
            const isCard      = t === 'card';
            const isSub       = t === 'subst';
            const isVar       = t === 'var';
            const isPenalty   = ev.detail.toLowerCase().includes('penalty');
            const isInjury    = isVar && ev.detail.toLowerCase().includes('injury');
            const isMissedPen = (isGoal || isVar) && !isInjury && (ev.detail.includes('Missed') || ev.detail.toLowerCase().includes('saved'));
            const iconCls     = `wc-timeline-icon${
              isMissedPen ? ' wc-timeline-icon--red'
              : isGoal    ? ' wc-timeline-icon--goal'
              : isCard    ? (ev.detail.includes('Red') ? ' wc-timeline-icon--red' : ' wc-timeline-icon--yellow')
              : isSub     ? ' wc-timeline-icon--sub'
              : ''}`;
            const detail = (
              <div className="wc-timeline-detail">
                {isSub ? (
                  <>
                    {ev.assist && <span className="wc-timeline-player wc-timeline-player--in">↑ {ev.assist}</span>}
                    <span className="wc-timeline-player wc-timeline-player--out">↓ {ev.player}</span>
                  </>
                ) : (
                  <>
                    <span className={`wc-timeline-player${isGoal && !isMissedPen ? ' wc-timeline-player--goal' : isMissedPen ? ' wc-timeline-player--missed' : ''}`}>
                      {ev.player}
                      {ev.detail.includes('Own Goal') && <span className="wc-timeline-tag">OG</span>}
                    </span>
                    {isPenalty && !ev.detail.includes('Own') && (
                      <span className={`wc-timeline-event-type${isMissedPen ? ' wc-timeline-event-type--missed' : ''}`}>
                        {isMissedPen ? 'MISSED PENALTY' : 'PENALTY'}
                      </span>
                    )}
                    {isInjury && (
                      <span className="wc-timeline-event-type wc-timeline-event-type--missed">INJURY BREAK</span>
                    )}
                    {ev.assist && !isPenalty && !isInjury && <span className="wc-timeline-assist">⤴ {ev.assist}</span>}
                  </>
                )}
              </div>
            );
            return (
              <div key={i} className="wc-timeline-row">
                <div className="wc-timeline-side wc-timeline-side--home">
                  {isHome ? detail : (
                    goalScore
                      /* Away goal: score LEFT of minute (outer edge = left) */
                      ? <span className="wc-timeline-min-wrap wc-timeline-min-wrap--away">
                          <span className="wc-timeline-goal-score">{goalScore}</span>
                          <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                        </span>
                      : <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                  )}
                </div>
                <div className="wc-timeline-centre">
                  <div className={iconCls}><TimelineIcon type={ev.type} detail={ev.detail} /></div>
                </div>
                <div className="wc-timeline-side wc-timeline-side--away">
                  {!isHome ? detail : (
                    goalScore
                      /* Home goal: score RIGHT of minute (outer edge = right) */
                      ? <span className="wc-timeline-min-wrap wc-timeline-min-wrap--home">
                          <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                          <span className="wc-timeline-goal-score">{goalScore}</span>
                        </span>
                      : <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                  )}
                </div>
              </div>
            );
          }

          // Helper: render a period divider (with icon or text label)
          function PeriodRow({ ev, i }: { ev: TLItem; i: number }) {
            const label = ev._periodLabel ?? '';
            const hasIcon = label === 'Kick Off' || label === 'Full Time'
              || label === 'End of Extra Time 1' || label === 'End of Extra Time 2';
            return hasIcon ? (
              <div key={i} className="wc-timeline-period">
                <div className="wc-timeline-centre" style={{ gridColumn: 2 }}>
                  <div className="wc-timeline-icon"><TimelineIcon type="PERIOD" detail={label} /></div>
                </div>
              </div>
            ) : (
              <div key={i} className="wc-timeline-period">
                <span className="wc-timeline-period-label">{label}</span>
              </div>
            );
          }

          const first = enhancedTimeline[0];
          const last  = enhancedTimeline[enhancedTimeline.length - 1];
          const mid   = enhancedTimeline.slice(1, -1);

          return (
            <div className="wc-timeline">
              {/* Kick Off — no line above */}
              <PeriodRow ev={first} i={0} />
              {/* Body — dotted line only within this wrapper */}
              <div className="wc-timeline-body">
                {mid.map((ev, i) =>
                  ev.type.toLowerCase() === 'period'
                    ? <PeriodRow key={i} ev={ev} i={i + 1} />
                    : <EventRow  key={i} ev={ev} i={i + 1} />
                )}
              </div>
              {/* Full Time whistle — no line below */}
              {enhancedTimeline.length > 1 && <PeriodRow ev={last} i={enhancedTimeline.length - 1} />}
            </div>
          );
        })()}

        {/* ── Penalty shootout breakdown ───────────────────────────────── */}
        {shootout.length > 0 && (
          <div className="wc-pk">
            <div className="wc-pk-title">Penalty Shootout</div>
            <div className="wc-pk-score">
              <span className={`wc-pk-team${homePenWin ? ' wc-pk-team--win' : ''}`}>
                {teamFlag(homeTeam ?? '')} {homeTeam}
              </span>
              <span className="wc-pk-score-num">{homePen}–{awayPen}</span>
              <span className={`wc-pk-team wc-pk-team--right${!homePenWin ? ' wc-pk-team--win' : ''}`}>
                {awayTeam} {teamFlag(awayTeam ?? '')}
              </span>
            </div>
            <div className="wc-pk-rounds">
              {Array.from({ length: shootoutRounds }).map((_, i) => {
                const h = homeKicks[i];
                const a = awayKicks[i];
                return (
                  <div key={i} className="wc-pk-round">
                    <div className="wc-pk-kick wc-pk-kick--home">
                      {h && (
                        <>
                          <KickMark scored={h.scored} />
                          <span className="wc-pk-kick-name">{h.player.split(' ').pop()}</span>
                        </>
                      )}
                    </div>
                    <span className="wc-pk-round-num">{i + 1}</span>
                    <div className="wc-pk-kick wc-pk-kick--away">
                      {a && (
                        <>
                          <span className="wc-pk-kick-name">{a.player.split(' ').pop()}</span>
                          <KickMark scored={a.scored} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats may lag the timeline early in a match */}
        {!statsAvailable && (
          <p className="wc-subtitle" style={{ fontSize: '0.82rem', textAlign: 'center', margin: '8px 0' }}>
            {isFinal ? 'Match stats are not available for this fixture.' : 'Match stats will appear as the game progresses.'}
          </p>
        )}

        {/* ── Team header ──────────────────────────────────────────────── */}
        {statsAvailable && stats.length > 0 && (
        <div className="wc-recap-header">
          <h2 className="wc-recap-team wc-recap-team--home">
            {teamFlag(homeTeam ?? '')} {homeTeam}
          </h2>
          <h2 className="wc-recap-team wc-recap-team--away">
            {awayTeam} {teamFlag(awayTeam ?? '')}
          </h2>
        </div>
        )}

        {/* Stat rows */}
        {statsAvailable && stats.length > 0 && (
        <div className="wc-recap-stats">
          {stats.map(s => {
            const hVal = parseNum(s.home);
            const aVal = parseNum(s.away);
            const total = hVal + aVal || 1;
            const hPct = Math.round((hVal / total) * 100);
            const aPct = 100 - hPct;
            const displayHome = s.home === null ? '—' : String(s.home);
            const displayAway = s.away === null ? '—' : String(s.away);
            return (
              <div key={s.type} className="wc-recap-row">
                <div className="wc-recap-row-header">
                  <span className="wc-recap-val wc-recap-val--home">{displayHome}</span>
                  <span className="wc-recap-label">{s.type}</span>
                  <span className="wc-recap-val wc-recap-val--away">{displayAway}</span>
                </div>
                <div className="wc-recap-bars wc-recap-bars--tall">
                  <div className="wc-recap-bar-track wc-recap-bar-track--home">
                    <div className="wc-recap-bar wc-recap-bar--home" style={{ width: `${hPct}%` }} />
                  </div>
                  <div className="wc-recap-bar-track wc-recap-bar-track--away">
                    <div className="wc-recap-bar wc-recap-bar--away" style={{ width: `${aPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    );
  }




  // ── Shell ──────────────────────────────────────────────────────────────────

  const tournamentLabel = activeTournament?.label ?? "FIFA World Cup '26";

  return (
    <div className="wc-shell">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="wc-topbar">
        {/* Hamburger — mobile only, always visible */}
        <button
          className={`wc-hamburger${matchupDrawerOpen ? ' wc-hamburger--open' : ''}`}
          aria-label={matchupDrawerOpen ? 'Close menu' : 'Open menu'}
          onClick={() => { setMatchupDrawerOpen(v => !v); setNotifDrawerOpen(false); }}
        >
          <span /><span /><span />
        </button>

        {/* Tournament name — clickable, opens dropdown */}
        <div className="wc-tournament-menu" ref={tournamentMenuRef}>
          <button
            className="wc-topbar-brand wc-topbar-brand--btn"
            onClick={() => setTournamentMenuOpen((v) => !v)}
            aria-expanded={tournamentMenuOpen}
            aria-label="Switch tournament"
          >
            <span className="wc-topbar-brand-name wc-topbar-brand-name--full">
              {tournamentLabel.split("'")[0].trim()}
            </span>
            <span className="wc-topbar-brand-name wc-topbar-brand-name--short">
              {tournamentLabel.split(' ')[0]}
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
            // Resolve by email, not myParticipantId: that id only gets populated
            // from the CURRENT round's pick-order fetch, which is skipped once a
            // matchup's tournament is fully complete (no current round left) —
            // leaving it null and silently zeroing this player's total.
            const me = standing.find((s) => s.email === userEmail);
            const opp = standing.find((s) => s.email !== userEmail);
            const myPts = (me?.tournamentPoints ?? 0) + provisionalPoints.mine;
            const oppPts = (opp?.tournamentPoints ?? 0) + provisionalPoints.opp;
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
                onClick={() => { setScoreChartOpen(true); dismissScorebugHint(); }}
              >
                {/* Home — current user: name LEFT, avatar RIGHT */}
                <div className="wc-h2h-player">
                  <span className="wc-h2h-name">
                    <span className="wc-h2h-name--full">{myName}</span>
                    <span className="wc-h2h-name--first">{myName.split(' ')[0]}</span>
                  </span>
                  {userAvatarUrl ? (
                    <img className="wc-h2h-avatar" src={userAvatarUrl} alt={myName} />
                  ) : (
                    <span className="wc-h2h-avatar wc-h2h-avatar--me" style={{ background: avatarColor(userEmail) }}>{myInit}</span>
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
                  <span className="wc-h2h-name">
                    <span className="wc-h2h-name--full">{oppName}</span>
                    <span className="wc-h2h-name--first">{oppName.split(' ')[0]}</span>
                  </span>
                  <div className="wc-avatar-presence-wrap">
                    {selectedMatchup?.opponentAvatarUrl ? (
                      <img className="wc-h2h-avatar" src={selectedMatchup.opponentAvatarUrl} alt={oppName} referrerPolicy="no-referrer" />
                    ) : (
                      <span className="wc-h2h-avatar wc-h2h-avatar--opp" style={{ background: avatarColor(selectedMatchup?.opponentEmail) }}>{oppInit}</span>
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
          {(() => {
            const totalPending = notifSummary.filter(m => !m.isPending).reduce((s, m) => s + m.total, 0);
            const anyUrgent = notifSummary.some((m) => !m.isPending && m.urgent > 0);
            return (
              <button
                className={`wc-alerts-btn${anyUrgent ? ' wc-alerts-btn--urgent' : totalPending > 0 ? ' wc-alerts-btn--active' : ''}`}
                aria-label={totalPending > 0 ? `${totalPending} picks pending` : 'Alerts'}
                title="Alerts"
                onClick={() => {
                  setNotifDrawerOpen(v => !v);
                  setMatchupDrawerOpen(false);
                  if (!notifDrawerOpen) fetchNotifSummary();
                }}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 2a6 6 0 00-6 6c0 3.5-1.5 5-1.5 5h15s-1.5-1.5-1.5-5a6 6 0 00-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="M8.5 17a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                {totalPending > 0 && (
                  <span className={`wc-alerts-badge${anyUrgent ? ' wc-alerts-badge--urgent' : ''}`} />
                )}
              </button>
            );
          })()}

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
                <span className="wc-user-avatar wc-user-avatar--initials" style={{ background: avatarColor(userEmail) }}>
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
                      download="match-duel-2026.ics"
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

      {/* ── Scorebug hint tooltip ────────────────────────────────────────────── */}
      {scorebugHintVisible && (
        <div className="wc-scorebug-hint" role="tooltip" onClick={dismissScorebugHint}>
          Tap to see standings &amp; stats
        </div>
      )}

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
            {orderedMatchups.map((m) => {
              const oppName = m.opponentDisplayName ?? m.opponentEmail?.split('@')[0] ?? null;
              const oppInit = initials(oppName, '?');
              const isActive = m.matchupId === selectedMatchupId;

              return (
                <div
                  key={m.matchupId}
                  className={`wc-nav-swipe-row${dragOverMatchupId === m.matchupId && dragMatchupId !== m.matchupId ? ' wc-nav-swipe-row--dragover' : ''}${dragMatchupId === m.matchupId ? ' wc-nav-swipe-row--dragging' : ''}`}
                >
                  {/* Delete revealed on swipe (touch) or hover (desktop) */}
                  <button
                    className="wc-nav-swipe-delete"
                    aria-label="Delete matchup"
                    onClick={() => {
                      const el = navRowRefs.current.get(m.matchupId);
                      if (el) { el.style.transition = 'transform 0.2s ease'; el.style.transform = 'translateX(0)'; }
                      setCancelMatchupId(m.matchupId);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Nav button — touch: swipe to delete; desktop (mouse): drag to reorder */}
                  <button
                    ref={el => { if (el) navRowRefs.current.set(m.matchupId, el); else navRowRefs.current.delete(m.matchupId); }}
                    className={`wc-nav-item${isActive ? ' wc-nav-item--active' : ''}`}
                    aria-current={isActive ? 'true' : undefined}
                    title={oppName ? `vs ${oppName}` : 'Pending opponent'}
                    draggable
                    onDragStart={e => { setDragMatchupId(m.matchupId); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnter={() => setDragOverMatchupId(m.matchupId)}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={e => {
                      e.preventDefault();
                      if (dragMatchupId) reorderMatchups(dragMatchupId, m.matchupId);
                      setDragMatchupId(null);
                      setDragOverMatchupId(null);
                    }}
                    onDragEnd={() => { setDragMatchupId(null); setDragOverMatchupId(null); }}
                    onPointerDown={e => {
                      if (e.pointerType !== 'touch') return; // mouse is reserved for drag-reorder
                      navDragStart.current = e.clientX;
                      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={e => {
                      if (e.pointerType !== 'touch' || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                      const dx = Math.min(0, e.clientX - navDragStart.current);
                      if (Math.abs(dx) < 4) return;
                      const el = navRowRefs.current.get(m.matchupId);
                      if (el) { el.style.transition = 'none'; el.style.transform = `translateX(${Math.max(dx, -68)}px)`; }
                    }}
                    onPointerUp={e => {
                      if (e.pointerType !== 'touch' || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                      const dx = e.clientX - navDragStart.current;
                      const el = navRowRefs.current.get(m.matchupId);
                      if (el) { el.style.transition = 'transform 0.2s ease'; el.style.transform = dx < -34 ? 'translateX(-68px)' : 'translateX(0)'; }
                    }}
                    onClick={() => {
                      const el = navRowRefs.current.get(m.matchupId);
                      if (el && el.style.transform === 'translateX(-68px)') {
                        el.style.transition = 'transform 0.2s ease';
                        el.style.transform = 'translateX(0)';
                        return;
                      }
                      setSelectedMatchupId(m.matchupId);
                    }}
                  >
                    {/* Avatar — always visible */}
                    {m.opponentAvatarUrl ? (
                      <img
                        className={`wc-nav-opp-avatar${isActive ? ' wc-nav-opp-avatar--active' : ''}`}
                        src={m.opponentAvatarUrl}
                        alt={oppName ?? ''}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span
                        className={`wc-nav-opp-avatar${isActive ? ' wc-nav-opp-avatar--active' : ''}`}
                        aria-hidden="true"
                        style={{ background: avatarColor(m.opponentEmail) }}
                      >
                        {oppName ? oppInit : '?'}
                      </span>
                    )}
                    {/* Name — only when expanded */}
                    {leftNavOpen && (
                      <span className="wc-nav-item-name">
                        vs {oppName ?? <em style={{ opacity: 0.6 }}>Pending</em>}
                      </span>
                    )}
                  </button>

                  {/* Desktop delete — revealed on hover (mouse can't swipe) */}
                  {leftNavOpen && (
                    <button
                      className="wc-nav-hover-delete"
                      aria-label="Delete matchup"
                      title="Delete matchup"
                      onClick={() => setCancelMatchupId(m.matchupId)}
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
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
              {hasLiveFixtures && <span className="wc-live-dot" role="status" aria-label="Live matches in progress" />}
              {(filterStage || hideMyPicks || hideOpponentPicks) && (
                <span className="wc-feed-count">{totalVisibleCount}</span>
              )}

              {/* Jump-to-today — appears only when today is scrolled out of view */}
              {fixtures.length > 0 && showTodayBtn && (
                <button className="wc-today-btn" onClick={scrollFeedToToday} aria-label="Jump to today's fixtures">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="8" cy="8" r="1.8" fill="currentColor"/>
                  </svg>
                  Today
                </button>
              )}

              {/* Filter button + flyout */}
              {fixtures.length > 0 && (
                <div className="wc-filter-wrap" ref={filterRef}>
                  <button
                    className={`wc-filter-btn${(filterStage || hideMyPicks || hideOpponentPicks) ? ' wc-filter-btn--active' : ''}`}
                    onClick={() => setFilterOpen((v) => !v)}
                    aria-expanded={filterOpen}
                    aria-label="Filter fixtures"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Filter
                    {(filterStage || hideMyPicks || hideOpponentPicks) && (
                      <span className="wc-filter-badge">
                        {(filterStage ? 1 : 0) + (hideMyPicks ? 1 : 0) + (hideOpponentPicks ? 1 : 0)}
                      </span>
                    )}
                  </button>

                  {filterOpen && (
                    <div className="wc-filter-flyout">

                      <button
                        className={`wc-filter-option${hideMyPicks ? ' wc-filter-option--selected' : ''}`}
                        onClick={() => setHideMyPicks((v) => !v)}
                      >
                        {hideMyPicks ? '✓ ' : ''}Hide My Picks
                      </button>

                      <button
                        className={`wc-filter-option${hideOpponentPicks ? ' wc-filter-option--selected' : ''}`}
                        onClick={() => setHideOpponentPicks((v) => !v)}
                      >
                        {hideOpponentPicks ? '✓ ' : ''}Hide Opponent Picks
                      </button>

                      <div className="wc-filter-divider" />

                      <div className="wc-filter-section-label">Stage</div>
                      <div className="wc-filter-options">
                        {allRounds.map((r) => (
                          <button
                            key={r.id}
                            className={`wc-filter-option${filterStage === r.stage ? ' wc-filter-option--selected' : ''}`}
                            onClick={() => { setFilterStage(filterStage === r.stage ? null : r.stage); setFilterOpen(false); }}
                          >{fmtStage(r.stage)}</button>
                        ))}
                      </div>

                      {(filterStage || hideMyPicks || hideOpponentPicks) && (
                        <>
                          <div className="wc-filter-divider" />
                          <button
                            className="wc-filter-option wc-filter-option--clear"
                            onClick={() => { setFilterStage(null); setHideMyPicks(false); setHideOpponentPicks(false); setFilterOpen(false); }}
                          >Clear filters</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            className="wc-feed-scroll"
            ref={feedScrollRef}
            onScroll={updateTodayBtn}
            onTouchStart={(e) => {
              const c = feedScrollRef.current;
              pullStartY.current = c && c.scrollTop <= 0 ? e.touches[0].clientY : null;
              pullDist.current = 0;
            }}
            onTouchMove={(e) => {
              if (pullStartY.current === null || refreshing) return;
              const c = feedScrollRef.current;
              const dy = e.touches[0].clientY - pullStartY.current;
              if (dy > 0 && c && c.scrollTop <= 0) {
                pullDist.current = dy;
                setPullUI(Math.min(dy, 90));
              } else {
                pullDist.current = 0;
                setPullUI(0);
              }
            }}
            onTouchEnd={() => {
              const triggered = pullStartY.current !== null && pullDist.current > 60;
              pullStartY.current = null;
              pullDist.current = 0;
              setPullUI(0);
              if (triggered) refreshFixtures();
            }}
          >
            {(pullUI > 0 || refreshing) && (
              <div className="wc-feed-pull" style={{ height: refreshing ? 36 : Math.min(pullUI, 60) }}>
                {refreshing ? 'Refreshing…' : pullUI > 60 ? 'Release to refresh' : 'Pull to refresh'}
              </div>
            )}
            {allRounds.length === 0 && !loading ? (
              <div className="wc-feed-empty">
                <p className="wc-subtitle">No fixtures for the current round.</p>
              </div>
            ) : (
              allRounds.map((round) => {
                const isCurrentRound = round.id === currentRound?.id;
                const isEarlier = currentRound ? round.order_index < currentRound.order_index : false;
                const isFutureRound = currentRound
                  ? round.order_index > currentRound.order_index
                  : (!round.is_complete && !isCurrentRound);
                // Rounds a late-joining matchup didn't play (earlier + not participated)
                // are greyed and tagged. Future rounds aren't — they're the upcoming
                // bracket, shown to everyone as it fills in.
                const beforeJoin = selectedMatchupId != null && round.participating === false && isEarlier;
                // null = still fetching; [] = loaded but empty
                const roundFixtures: Fixture[] | null = isCurrentRound
                  ? visibleFixtures
                  : (completedRoundFixtures[round.id] ?? null);
                const hasFilters = !!(filterStage || hideMyPicks || hideOpponentPicks);
                if (filterStage && round.stage !== filterStage) return null;

                return (
                  <div key={round.id} className={`wc-round-section${beforeJoin ? ' wc-round-section--readonly' : ''}`}>
                    {/* Sticky round header */}
                    <div className="wc-round-section-header">
                      <h2 className="wc-round-section-title">{fmtStage(round.stage)}</h2>
                      {beforeJoin && <span className="wc-round-section-tag">Before you joined</span>}
                      {round.starts_at && (
                        <span className="wc-round-section-date">
                          {new Date(round.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                          {round.ends_at && round.ends_at !== round.starts_at
                            ? ` – ${new Date(round.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                            : ''}
                        </span>
                      )}
                    </div>

                    {/* Fixtures, loading, or TBD placeholder. Future rounds now show
                        the bracket (placeholders filling in) once seeded — TBD only
                        when a round genuinely has no fixtures. */}
                    {roundFixtures === null ? (
                      <div className="wc-round-tbd" style={{ opacity: 0.5 }}>Loading…</div>
                    ) : roundFixtures.length === 0 ? (
                      <div className="wc-round-tbd">
                        {hasFilters && isCurrentRound ? 'No fixtures match the filter.' : isFutureRound ? 'Fixtures TBD' : 'No fixtures yet.'}
                      </div>
                    ) : (() => {
                        // Tournament day 1 = June 11 2026, in the viewer's LOCAL time — each
                        // local playing day increments by one (see tournamentMatchday). The
                        // score chart uses the same helper so its MD numbers always match.
                        let lastTournamentDay = -1;
                        return roundFixtures.map((f) => {
                          const isSelected = f.id === selectedFixtureId;
                          const myPick = pickMap[f.id] ?? f.myPickSide ?? null;
                          const pts = computePickPoints(f, myPick, round.stage);
                          const hasPickOrder = Object.keys(pickOrder).length > 0;
                          // Completed-round fixtures are always "accessible" for display
                          const isMyFixture = !isCurrentRound || !hasPickOrder || pickOrder[f.id] === myParticipantId;
                          const fixtureDate = new Date(f.startsAt);
                          const tournamentDay = tournamentMatchday(f.startsAt);
                          const showHeader = tournamentDay !== lastTournamentDay;
                          if (showHeader) lastTournamentDay = tournamentDay;

                          // Format kickoff time in the viewer's local timezone
                          const kickoffLabel = fixtureDate.toLocaleString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          });

                          // Matchday date, e.g. "Thu · June 18" (viewer-local).
                          const matchdayDateLabel = fixtureDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'long',
                            day: 'numeric',
                          }).replace(',', ' ·');

                          return (
                            <Fragment key={f.id}>
                              {showHeader && (
                                <div className="wc-matchday-header">
                                  <span>Matchday {tournamentDay}</span>
                                  <span className="wc-matchday-header-date">{matchdayDateLabel}</span>
                                </div>
                              )}
                              <button
                                className={`wc-scorebug${isSelected ? ' wc-scorebug--selected' : ''}${f.isLocked ? ' wc-scorebug--locked' : ''}${!f.isLocked && !isMyFixture ? ' wc-scorebug--not-mine' : ''}${f.status === 'FINAL' && myPick ? (isGenuineDraw(f) ? ' wc-scorebug--draw' : (pts ?? 0) > 0 ? ' wc-scorebug--win' : ' wc-scorebug--loss') : ''}`}
                                data-fixture-id={f.id}
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
                              {/* Group label + kickoff — time always shows; group only for group stage */}
                              <div className="wc-scorebug-group">
                                <span>{f.groupName ? `Group ${f.groupName}` : ''}</span>
                                <span className="wc-scorebug-kickoff">{kickoffLabel}</span>
                              </div>

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
                                        <span className={`wc-scorebug-pts-val${myPick !== 'HOME' ? ' wc-scorebug-pts-val--opp' : ''}`}>+{homePts}</span>
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
                                        <span className={`wc-scorebug-pts-val${myPick !== 'AWAY' ? ' wc-scorebug-pts-val--opp' : ''}`}>+{awayPts}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()}
                              </button>
                            </Fragment>
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
        <div
          className="wc-content"
          onTouchStart={(e) => {
            // Only arm the swipe-back gesture when this panel is visible on mobile
            if (mobileView !== 'content') return;
            const x = e.touches[0].clientX;
            // Only arm if touch starts within 30px of the left edge
            contentSwipeStartX.current = x <= 30 ? x : null;
          }}
          onTouchEnd={(e) => {
            if (contentSwipeStartX.current === null) return;
            const endX = e.changedTouches[0].clientX;
            if (endX - contentSwipeStartX.current > 60) {
              setMobileView('feed');
            }
            contentSwipeStartX.current = null;
          }}
        >
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
                Match Details
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
                Recap
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
          </div>

          {/* Sliding content panel */}
          <div className="wc-drawer-panel">
            <div className="wc-drawer-panel-header">
              <span className="wc-drawer-panel-title">
                {{ chat: 'Chat', calendar: 'Calendar' }[drawerTab as 'chat' | 'calendar']}
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
                    onMarkRead={handleChatMarkRead}
                    opponentOnline={opponentOnline}
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
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile bottom nav — hidden in the chat view (the ‹ back button is enough,
          and hiding it frees the full viewport for the keyboard). */}
      {!mobileChatOpen && (
      <nav className="wc-mobile-nav" aria-label="Mobile navigation">

        {/* Matches */}
        <button
          className="wc-mobile-nav-btn"
          aria-pressed={mobileView === 'feed' || mobileView === 'content'}
          onClick={() => setMobileView('feed')}
        >
          {/* Soccer ball — custom filled glyph (uses currentColor). */}
          <svg width="22" height="22" viewBox="0 0 1080 1080" fill="currentColor" aria-hidden="true">
            <g transform="matrix(2.38008,0,0,2.38008,596.408,987.664)">
              <g transform="matrix(1,0,0,1,-372.045,-526.2)">
                <path fillRule="nonzero" d="M337.37,491.22C276.473,487.031 223,438.824 207.91,380.46C193.986,319.943 221.638,251.8 275.591,220.2C310.295,199.387 353.841,196.785 392.251,207.626C439.693,222.265 475.805,264.655 488.482,311.946C499.87,355.528 491.657,405.014 461.388,439.356C433.974,473.643 390.152,493.397 346.328,491.633C343.341,491.571 340.356,491.43 337.376,491.214L337.37,491.22ZM373.667,484.361C384.594,483.404 382.674,480.039 372.735,479.185C354.978,475.753 335.805,475.664 318.668,481.682C333.754,488.985 353.794,487.105 370.682,484.926L373.667,484.361L373.667,484.361L373.667,484.361ZM319.866,474.721C327.664,466.731 319.529,447.64 312.714,440.075C297.482,432.271 285.671,419.516 271.739,409.897C261.246,406.062 251.012,413.351 240.87,415.821C240.824,425.885 240.171,437.247 248.991,444.245C263.511,458.636 281.037,471.25 300.816,476.983C307.169,477.28 313.841,476.892 319.866,474.721L319.866,474.721ZM403.37,475.123C428.643,464.188 452.35,446.615 466.602,422.699C471.733,415.817 475.501,403.768 462.098,407.753C445.262,418.377 430.058,431.527 412.81,441.592C402.352,449.895 394.819,461.321 387.385,472.248C389.977,478.301 398.401,476.858 403.37,475.123L403.37,475.123ZM420.502,431.181C433.206,420.721 451.588,413.983 458.258,398.116C461.272,385.639 461.508,372.727 462.765,359.999C450.106,348.725 434.559,341.079 419.359,333.855C404.337,335.062 392.196,348.447 380.317,357.121C373.987,360.628 375.612,368.509 373.892,374.551C371.59,388.678 368.925,402.762 367.391,417C379.21,425.776 392.405,433.831 406.776,437.216C411.969,437.28 416.284,433.75 420.503,431.18L420.502,431.181ZM329.89,433.383C341.395,428.979 356.619,425.653 362.02,413.423C366.025,396.286 368.253,378.749 370.369,361.292C358.939,350.387 346.735,338.889 331.747,333.199C318.818,332.991 307.86,342.165 296.355,347.176C280.876,351.39 275.5,365.514 274.823,380.102C270.282,394.532 275.494,409.356 288.546,417.309C299.946,425.739 314.597,439.182 329.889,433.383L329.89,433.383ZM233.594,413.159C224.26,395.846 217.823,376.887 215.253,357.381C206.022,359.245 214.412,381.967 216.956,391.238C221.308,403.761 227.967,415.273 234.87,426.53C236.132,421.898 236.881,417.298 233.594,413.159L233.594,413.159ZM229.574,336.09C233.65,330.252 240.138,325.643 242.583,318.974C246.898,298.782 253.937,279.289 264.005,261.237C263.58,249.574 250.59,242.488 244.123,255.34C225.695,279.131 211.239,308.122 210.603,338.72C208.18,349.215 217.287,356.849 222.534,344.422C224.885,341.648 227.231,338.87 229.575,336.09L229.574,336.09ZM466.874,350.556C474.685,340.278 485.48,328.078 482.673,314.156C477.785,287.758 464.266,262.694 443.5,245.49C437.335,242.868 426.067,233.222 421.766,242.333C415.409,254.575 399.599,266.149 405.295,281.395C410.178,296.445 413.741,312.175 420.86,326.347C433.955,336.594 449.123,344.559 464.374,351.281L466.874,350.556L466.874,350.556L466.874,350.556ZM292.644,343.712C304.736,337.591 316.481,330.823 328.272,324.149C332.248,310.223 337.238,296.617 341.888,282.923C342.538,268.116 329.362,257.478 320.548,247.093C311.892,233.202 297.244,243.857 286.558,248.937C263.04,261.528 257.641,289.246 249.651,312.383C250.76,321.047 258.673,328.279 264.449,334.756C272.432,342.788 281.407,353.522 292.644,343.712L292.644,343.712ZM379.374,268.867C385.629,268.007 392.616,268.636 398.423,266.862C407.11,257.486 414.756,246.502 418.374,234.18C414.006,221.758 399.535,216.097 387.917,211.868C373.116,207.453 357.268,205.291 341.905,207.035C330.816,212.712 310.926,229.185 322.156,241.954C330.382,251.773 339.138,261.129 348.054,270.321C358.513,270.423 368.948,269.605 379.374,268.867L379.374,268.867Z"/>
              </g>
            </g>
          </svg>
          <span>Matches</span>
        </button>

        {/* Chat */}
        <button
          className="wc-mobile-nav-btn"
          aria-pressed={mobileView === 'chat'}
          onClick={() => setMobileView(mobileView === 'chat' ? 'feed' : 'chat')}
          style={{ position: 'relative' }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 4h14a1 1 0 011 1v8a1 1 0 01-1 1H6l-4 3V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
          </svg>
          {totalUnread > 0 && <span className="wc-mobile-nav-badge">{totalUnread > 9 ? '9+' : totalUnread}</span>}
          <span>Chat</span>
        </button>

        {/* Profile — uses the user's own avatar as the icon */}
        <button
          className="wc-mobile-nav-btn wc-mobile-nav-btn--profile"
          aria-pressed={mobileView === 'profile'}
          onClick={() => setMobileView(mobileView === 'profile' ? 'feed' : 'profile')}
        >
          {userAvatarUrl
            ? <img src={userAvatarUrl} alt="Profile" className="wc-mobile-nav-avatar" referrerPolicy="no-referrer" />
            : <span className="wc-mobile-nav-avatar wc-mobile-nav-avatar--initials" style={{ background: avatarColor(userEmail) }}>
                {(displayName || userEmail).charAt(0).toUpperCase()}
              </span>
          }
          <span>Profile</span>
        </button>
      </nav>
      )}

      {/* ── Mobile: Matchup switcher drawer (hamburger) ───────────────────────── */}
      {matchupDrawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="wc-matchup-drawer-backdrop"
            onClick={() => setMatchupDrawerOpen(false)}
          />
          {/* Drawer */}
          <div className="wc-matchup-drawer">
            <div className="wc-matchup-drawer-header">
              <span className="wc-matchup-drawer-title">Your Matchups</span>
            </div>
            <div className="wc-matchup-drawer-list" style={{ flex: 1 }}>
              {orderedMatchups.map((m) => {
                const oppName = m.opponentDisplayName ?? m.opponentEmail?.split('@')[0] ?? 'Pending';
                const oppInit = initials(oppName);
                const isActive = m.matchupId === selectedMatchupId;
                return (
                  <div key={m.matchupId} className="wc-swipe-row">
                    {/* Delete action revealed on swipe */}
                    <button
                      className="wc-swipe-delete"
                      onClick={() => {
                        const el = drawerRowRefs.current.get(m.matchupId);
                        if (el) { el.style.transition = 'transform 0.2s ease'; el.style.transform = 'translateX(0)'; }
                        setCancelMatchupId(m.matchupId);
                      }}
                    >
                      Delete
                    </button>
                    {/* Swipeable row */}
                    <button
                      ref={(el) => { if (el) drawerRowRefs.current.set(m.matchupId, el); else drawerRowRefs.current.delete(m.matchupId); }}
                      className={`wc-matchup-lobby-card${isActive ? ' wc-matchup-lobby-card--active' : ''}`}
                      onTouchStart={(e) => { drawerTouchStartX.current = e.touches[0].clientX; }}
                      onTouchMove={(e) => {
                        const dx = Math.min(0, e.touches[0].clientX - drawerTouchStartX.current);
                        const el = drawerRowRefs.current.get(m.matchupId);
                        if (el) { el.style.transition = 'none'; el.style.transform = `translateX(${Math.max(dx, -80)}px)`; }
                      }}
                      onTouchEnd={(e) => {
                        const dx = e.changedTouches[0].clientX - drawerTouchStartX.current;
                        const el = drawerRowRefs.current.get(m.matchupId);
                        if (el) {
                          el.style.transition = 'transform 0.2s ease';
                          el.style.transform = dx < -40 ? 'translateX(-80px)' : 'translateX(0)';
                        }
                      }}
                      onClick={() => {
                        const el = drawerRowRefs.current.get(m.matchupId);
                        // If the row is swiped open, close it instead of navigating
                        if (el && el.style.transform === 'translateX(-80px)') {
                          el.style.transition = 'transform 0.2s ease';
                          el.style.transform = 'translateX(0)';
                          return;
                        }
                        setSelectedMatchupId(m.matchupId);
                        setMatchupDrawerOpen(false);
                        setMobileView('feed');
                      }}
                    >
                      <div className="wc-matchup-lobby-avatar">
                        {m.opponentAvatarUrl
                          ? <img src={m.opponentAvatarUrl} alt={oppName} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          : <span style={{ background: avatarColor(m.opponentEmail), width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>{oppInit}</span>}
                      </div>
                      <div className="wc-matchup-lobby-info">
                        <span className="wc-matchup-lobby-name">
                          {oppName.split(' ')[0]}
                          {(() => {
                            const sc = matchupScores[m.matchupId];
                            if (!sc) return null;
                            return <span className="wc-matchup-lobby-score"> ({sc.mine} - {sc.opp})</span>;
                          })()}
                        </span>
                      </div>
                      {isActive && (
                        <svg className="wc-matchup-lobby-check" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M3 8l4 4 6-7" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Create + Join actions */}
            <div className="wc-matchup-drawer-footer">
              <button
                className="wc-drawer-action-btn wc-drawer-action-btn--primary"
                onClick={() => { setMatchupDrawerOpen(false); setCreateOpen(true); }}
              >
                + Create
              </button>
              <button
                className="wc-drawer-action-btn wc-drawer-action-btn--secondary"
                onClick={() => { setMatchupDrawerOpen(false); setJoinOpen(true); }}
              >
                Join
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Notification drawer (right side) ──────────────────────────────────── */}
      {notifDrawerOpen && (
        <>
          <div
            className="wc-notif-drawer-backdrop"
            onClick={() => setNotifDrawerOpen(false)}
          />
          <div className="wc-notif-drawer">
            {/* Header */}
            <div className="wc-notif-drawer-header">
              <span className="wc-notif-drawer-title">Picks Due</span>
              <button
                className="wc-notif-drawer-close"
                aria-label="Close"
                onClick={() => setNotifDrawerOpen(false)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Body — only show actionable rows */}
            <div className="wc-notif-drawer-body">
              {notifSummaryLoading && (
                <div className="wc-notif-drawer-empty">Loading…</div>
              )}
              {!notifSummaryLoading && notifSummary.filter(m => m.total > 0 || m.isPending).length === 0 && (
                <div className="wc-notif-drawer-empty">You&apos;re all caught up!</div>
              )}
              {!notifSummaryLoading && notifSummary
                .filter(item => item.total > 0 || item.isPending)
                .map((item) => {
                  const matchup = matchups.find(m => m.matchupId === item.matchupId);
                  const oppEmail = matchup?.opponentEmail ?? '';
                  const oppName = item.opponentName ?? 'Pending';
                  const oppInit = oppName.charAt(0).toUpperCase();
                  return (
                    <button
                      key={item.matchupId}
                      className="wc-notif-row"
                      onClick={() => {
                        setSelectedMatchupId(item.matchupId);
                        setNotifDrawerOpen(false);
                        if (!item.isPending) setHideMyPicks(true);
                        setMobileView('feed');
                      }}
                    >
                      {/* Small avatar */}
                      <div className="wc-notif-row-avatar">
                        {item.isPending ? (
                          <span style={{ background: 'var(--text-2)', width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M4 2h8M4 14h8M5 2v3.5c0 .8.4 1.6 1 2l2 1.5-2 1.5c-.6.4-1 1.2-1 2V14M11 2v3.5c0 .8-.4 1.6-1 2L8 9l2 1.5c.6.4 1 1.2 1 2V14" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        ) : item.opponentAvatarUrl ? (
                          <img src={item.opponentAvatarUrl} alt={oppName} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ background: avatarColor(oppEmail), width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.7rem' }}>{oppInit}</span>
                        )}
                      </div>

                      {/* Text */}
                      <div className="wc-notif-row-body">
                        {item.isPending ? (
                          <>
                            <span className="wc-notif-row-label wc-notif-row-label--muted">Invite pending</span>
                            <span className="wc-notif-row-sub">waiting for opponent to join</span>
                          </>
                        ) : (
                          <>
                            <span className="wc-notif-row-name">{oppName}</span>
                            <span className={`wc-notif-row-count${item.urgent > 0 ? ' wc-notif-row-count--urgent' : ''}`}>
                              {item.total} pick{item.total !== 1 ? 's' : ''} due
                              {item.urgent > 0 && <span className="wc-notif-urgent-dot" aria-label={`${item.urgent} urgent`} />}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Chevron */}
                      <svg className="wc-notif-row-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  );
                })}
            </div>

            {/* Footer — Clear closes and resets the badge */}
            {!notifSummaryLoading && (
              <div className="wc-notif-drawer-footer">
                <button
                  className="wc-notif-drawer-clear"
                  onClick={() => {
                    setNotifSummary([]);
                    setNotifDrawerOpen(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Mobile: Chat full-screen ──────────────────────────────────────────── */}
      {mobileView === 'chat' && (
        <div className="wc-mobile-overlay wc-mobile-overlay--chat">
          <div className="wc-mobile-overlay-nav wc-mobile-overlay-nav--chat">
            <button className="wc-topbar-icon-btn" aria-label="Back" onClick={() => setMobileView('feed')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {(() => {
              const oppName = selectedMatchup?.opponentDisplayName ?? selectedMatchup?.opponentEmail?.split('@')[0] ?? 'Chat';
              return (
                <div className="wc-chat-nav-id">
                  <div className="wc-chat-nav-avatar-wrap">
                    {selectedMatchup?.opponentAvatarUrl
                      ? <img src={selectedMatchup.opponentAvatarUrl} className="wc-chat-nav-avatar" referrerPolicy="no-referrer" alt={oppName} />
                      : <span className="wc-chat-nav-avatar wc-chat-nav-avatar--init" style={{ background: avatarColor(selectedMatchup?.opponentEmail) }}>{initials(oppName)}</span>
                    }
                    {opponentOnline && <span className="wc-presence-dot" />}
                  </div>
                  <div className="wc-chat-nav-text">
                    <span className="wc-chat-nav-name">{oppName}</span>
                    <span className={`wc-chat-nav-status${opponentOnline ? ' wc-chat-nav-status--online' : ''}`}>
                      {opponentOnline ? 'online' : 'offline'}
                    </span>
                  </div>
                </div>
              );
            })()}
            <div style={{ width: 34 }} />
          </div>
          <div className="wc-mobile-overlay-body wc-mobile-overlay-body--chat">
            {selectedMatchupId && myAppUserId && selectedMatchup?.opponentEmail ? (
              <ChatPanel
                matchupId={selectedMatchupId}
                myAppUserId={myAppUserId}
                myAvatarUrl={userAvatarUrl ?? null}
                opponentDisplayName={selectedMatchup.opponentDisplayName ?? null}
                opponentEmail={selectedMatchup.opponentEmail}
                opponentAvatarUrl={selectedMatchup.opponentAvatarUrl ?? null}
                onMarkRead={handleChatMarkRead}
                opponentOnline={opponentOnline}
                hideHeader
              />
            ) : (
              <p className="wc-subtitle" style={{ padding: '24px 16px' }}>
                {!selectedMatchupId ? 'Select a matchup to open chat.' : 'Chat available once your opponent joins.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile: Profile full-screen ───────────────────────────────────────── */}
      {mobileView === 'profile' && (
        <div className="wc-mobile-overlay">
          <div className="wc-mobile-overlay-nav">
            <button className="wc-topbar-icon-btn" aria-label="Back" onClick={() => setMobileView('feed')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <span className="wc-mobile-overlay-title">Profile</span>
            <div style={{ width: 34 }} />
          </div>
          <div className="wc-mobile-overlay-body">
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
              notificationPreferences={notificationPreferences}
              onNotificationPrefsChange={saveNotificationPreferences}
              onThemeChange={changeTheme}
              onAvatarUploaded={setUploadedAvatar}
              onSignOut={signOut}
            />
          </div>
        </div>
      )}

      {/* Score chart modal */}
      {scoreChartOpen && selectedMatchup && (
        <ScoreChartModal
          standing={standing}
          roundResults={roundResults}
          allRounds={allRounds}
          fixtures={fixtures}
          completedRoundFixtures={completedRoundFixtures}
          pickMap={pickMap}
          provisionalPoints={provisionalPoints}
          currentRound={currentRound}
          selectedMatchup={selectedMatchup}
          userAvatarUrl={userAvatarUrl}
          oppAvatarUrl={oppAvatarUrl}
          userEmail={userEmail}
          displayName={displayName}
          onClose={() => setScoreChartOpen(false)}
        />
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
              notificationPreferences={notificationPreferences}
              onNotificationPrefsChange={saveNotificationPreferences}
              onThemeChange={changeTheme}
              onAvatarUploaded={setUploadedAvatar}
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
            <div className="wc-modal-actions">
              <button
                className="wc-modal-dismiss"
                type="button"
                disabled={loading}
                onClick={cancelMatchup}
              >
                {loading ? 'CANCELLING…' : 'YES, CANCEL IT'}
              </button>
              <button className="wc-btn wc-btn-primary" type="button" onClick={() => setCancelMatchupId(null)}>
                KEEP IT
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
                  <span className="wc-invite-link-text" style={{ userSelect: 'text', cursor: 'text' }}>
                    {`${window.location.origin}/join/${createdInviteCode}`}
                  </span>
                </div>
                <div className="wc-modal-actions">
                  <button className="wc-modal-dismiss" type="button" onClick={closeCreateModal}>
                    DISMISS
                  </button>
                  <button
                    className="wc-btn wc-btn-primary"
                    type="button"
                    onClick={() => copyInviteLink(createdInviteCode)}
                  >
                    {copyConfirmed ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: 0 }}>Create a Matchup</h3>
                <p className="wc-subtitle">
                  A unique invite link will be generated for you to share with one opponent.
                </p>
                <div className="wc-modal-actions">
                  <button className="wc-modal-dismiss" type="button" onClick={closeCreateModal}>
                    DISMISS
                  </button>
                  <button
                    className="wc-btn wc-btn-primary"
                    type="button"
                    disabled={loading}
                    onClick={createMatchup}
                  >
                    {loading ? 'Creating…' : 'Create'}
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

      {/* ── Onboarding overlay ─────────────────────────────────────────── */}
      {onboardingStep !== null && (() => {
        const steps = [
          {
            icon: '⚽',
            title: 'Pick the winners',
            body: 'For every fixture, one of you picks which team will win — your opponent is automatically assigned the other side. You can never root for the same team.',
          },
          {
            icon: '🔁',
            title: 'Behind? You pick first',
            body: 'After each round, the player who scored fewer points gets first pick in the next stage — a built-in edge for the underdog. Every round is a fresh chance.',
          },
          {
            icon: '📈',
            title: 'Points escalate every round',
            body: 'Group stage picks are worth 1pt. By the Final it\'s 32pts. A single correct Final pick can overturn an entire group stage deficit.',
          },
        ];
        const step = steps[onboardingStep - 1];
        const isLast = onboardingStep === steps.length;

        function dismiss() {
          localStorage.setItem('md_onboarding_v1', 'done');
          setOnboardingStep(null);
          // Clean up the ?onboarding=1 param from the URL
          const url = new URL(window.location.href);
          url.searchParams.delete('onboarding');
          window.history.replaceState({}, '', url.toString());
        }

        return (
          <div className="wc-modal-backdrop" role="dialog" aria-modal="true" aria-label="How it works">
            <div className="wc-modal wc-onboarding">
              <div className="wc-onboarding-progress">
                {steps.map((_, i) => (
                  <div key={i} className={`wc-onboarding-dot${i < onboardingStep ? ' wc-onboarding-dot--done' : ''}`} />
                ))}
              </div>
              <div className="wc-onboarding-icon">{step.icon}</div>
              <h2 className="wc-onboarding-title">{step.title}</h2>
              <p className="wc-onboarding-body">{step.body}</p>
              <div className="wc-onboarding-actions">
                <button className="wc-onboarding-skip" onClick={dismiss}>SKIP</button>
                {!isLast ? (
                  <button className="wc-onboarding-next" onClick={() => setOnboardingStep(s => (s ?? 1) + 1)} aria-label="Next">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M6 4 L12 9 L6 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : (
                  <button className="wc-btn wc-btn-primary" style={{ fontSize: '0.9rem' }} onClick={dismiss}>
                    Let&apos;s Duel!
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
