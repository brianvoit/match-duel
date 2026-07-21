'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TEAM_INFO, teamCode, teamFlag } from '@/lib/data/teamInfo';
import { ChatPanel } from '@/app/components/chat-panel';
import { FixtureDetailPanel } from '@/app/components/fixture-detail-panel';
import { PreMatchPanel } from '@/app/components/pre-match-panel';
import { RecapPanel } from '@/app/components/recap-panel';
import { SquadPanel } from '@/app/components/squad-panel';
import { useFixtureDetailData } from '@/app/components/use-fixture-detail-data';
import { useMatchups } from '@/app/components/use-matchups';
import { useMatchupActions } from '@/app/components/use-matchup-actions';
import { useNotifications } from '@/app/components/use-notifications';
import { usePullToRefresh } from '@/app/components/use-pull-to-refresh';
import { useRoundFixtures } from '@/app/components/use-round-fixtures';
import { useProfile } from '@/app/components/use-profile';
import { ScoreChartModal } from '@/app/components/score-chart-modal';
import { ProfileSettings } from '@/app/components/profile-settings';
import { renderMatchShareCard, type ShareGoal } from '@/app/components/share-card';
import {
  Fixture,
  TournamentFormFixture, MatchEvent,
  ContentTab, DrawerTab, MobileView, NoticeTone,
} from '@/app/components/playground-types';
import {
  STAGE_POINTS, STAGE_LABELS, fmtStage, computePickPoints, penaltyWinner, isGenuineDraw,
  computeMatchdays, tournamentMatchday, initials, StatusGlyph, liveMatchClock,
} from '@/app/components/playground-utils';
import { avatarColor } from '@/lib/avatar-color';
import { usePresence } from '@/lib/realtime/usePresence';

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
];

// Utilities imported from playground-utils.tsx

// ── Component ─────────────────────────────────────────────────────────────────

export function Playground({ userEmail, userAvatarUrl: propAvatarUrl }: PlaygroundProps) {
  // The signed-in user's own profile + device settings (name, avatar, theme,
  // default pick side, push) — owned by one hook, nothing here writes them.
  const {
    myAppUserId, displayName, firstName, lastName, setFirstName, setLastName,
    savingName, handleNameBlur,
    userAvatarUrl, setUploadedAvatar,
    theme, changeTheme,
    defaultPickSide, savingDefaultPick, saveDefaultPickSide,
    pushSupported, pushEnabled, pushLoading, togglePush,
    notificationPreferences, saveNotificationPreferences,
  } = useProfile({ showNotice, propAvatarUrl });

  // ── Layout state ───────────────────────────────────────────────────────────
  const [leftNavOpen, setLeftNavOpen] = useState(true);
  const [matchupDrawerOpen, setMatchupDrawerOpen] = useState(false);

  // The notification bell drawer. Called before useMatchups/useRoundFixtures:
  // they take fetchNotifSummary as a param to prefetch the badge, so it has to
  // exist first.
  const { notifDrawerOpen, setNotifDrawerOpen, notifSummary, setNotifSummary, notifSummaryLoading, fetchNotifSummary } =
    useNotifications();

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
  const [sharingCard, setSharingCard] = useState(false);
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

  // The user's matchups: the list, their chosen order, the current selection and
  // its standings. Selection here is what the fixture/pick layer below keys off.
  const {
    matchups, orderedMatchups,
    selectedMatchupId, setSelectedMatchupId, selectedMatchup, oppAvatarUrl,
    dragMatchupId, setDragMatchupId, dragOverMatchupId, setDragOverMatchupId, reorderMatchups,
    standing, roundResults, loadStandings, matchupScores,
    tournaments, activeTournament,
    loadMatchups,
  } = useMatchups({ showNotice, setLoading, fetchNotifSummary, matchupDrawerOpen });

  // The create/join/cancel matchup modal flow — all three end by reloading the
  // matchup list above.
  const {
    joinCode, setJoinCode, joinOpen, setJoinOpen,
    createOpen, setCreateOpen, createdInviteCode, copyConfirmed,
    cancelMatchupId, setCancelMatchupId,
    createMatchup, copyInviteLink, closeCreateModal, cancelMatchup, joinMatchup,
  } = useMatchupActions({ showNotice, setLoading, loadMatchups, selectedMatchupId, setSelectedMatchupId });

  // The round + fixture + pick layer — the core game state, keyed off the
  // selected matchup above. Drives the feed, scoring, locking and live polling.
  const {
    currentRound, allRounds, fixtures, completedRoundFixtures,
    pickMap, setPickMap, pickOrder, myParticipantId,
    selectedFixtureId, setSelectedFixtureId, selectedFixture,
    hasLiveFixtures, provisionalPoints,
    loadCurrentRoundAndFixtures, submitSinglePick,
  } = useRoundFixtures({ selectedMatchupId, contentTab, showNotice, setLoading, fetchNotifSummary });

  const [totalUnread, setTotalUnread] = useState(0);
  // Opponent presence on the selected matchup. "Online" means they currently
  // have the app open and focused — presence is tracked only while the tab is
  // visible and is keyed by app user id (see usePresence).
  const { anyOnline: opponentOnline } = usePresence(
    `presence-${selectedMatchupId ?? 'none'}`,
    myAppUserId ?? '',
    { enabled: Boolean(selectedMatchupId && myAppUserId) },
  );
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null); // null = hidden
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const autoScrolledMatchup = useRef<string | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

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

  // Everything the detail panes render for the selected fixture (pre-match, H2H,
  // form, squad, recap) — owned by one hook so selection is the only input.
  const {
    preMatchData, headToHead, h2hHome, h2hAway, teamForm,
    squadData, squadLoading, recapData, recapLoading, eventsData,
  } = useFixtureDetailData({
    selectedFixtureId,
    selectedMatchupId,
    contentTab,
    fixtureStatus: selectedFixture?.status,
    fixtureStartsAt: selectedFixture?.startsAt,
  });

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
    // Fixtures load themselves (schedule on mount, picks on selection — see
    // useRoundFixtures); profile loads itself (see useProfile).
    loadMatchups();

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

  // Selecting a matchup drops mobile users onto the feed. (The fixture reload
  // itself lives in useRoundFixtures, keyed on the same selection.)
  useEffect(() => {
    if (selectedMatchupId) setMobileView('feed');
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

  // Show onboarding for new users arriving from invite link or first sign-in
  useEffect(() => {
    const seen = localStorage.getItem('md_onboarding_v1');
    if (!seen) {
      const isOnboarding = new URLSearchParams(window.location.search).get('onboarding') === '1';
      if (isOnboarding) setOnboardingStep(1);
    }
  }, []);

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

  // Pull-to-refresh: re-read the latest fixtures/standings from the server (the
  // background cron keeps the DB current within ~1 min, including settling any
  // match that just finished). No full re-sync needed.
  const { pullUI, refreshing, onTouchStart: onFeedTouchStart, onTouchMove: onFeedTouchMove, onTouchEnd: onFeedTouchEnd } =
    usePullToRefresh({
      feedScrollRef,
      onRefresh: async () => {
        if (selectedMatchupId) {
          await Promise.all([loadCurrentRoundAndFixtures(selectedMatchupId), loadStandings(selectedMatchupId)]);
        }
      },
    });

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
            onTouchStart={onFeedTouchStart}
            onTouchMove={onFeedTouchMove}
            onTouchEnd={onFeedTouchEnd}
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
                                  // Selection is the only input — useFixtureDetailData
                                  // refetches H2H/form/pre-match off selectedFixtureId.
                                  setSelectedFixtureId(f.id);
                                  setContentTab('details');
                                  setMobileView('content');
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
            {contentTab === 'details' && (
              <FixtureDetailPanel
                selectedMatchupId={selectedMatchupId}
                selectedFixture={selectedFixture}
                selectedFixtureId={selectedFixtureId}
                fixtures={fixtures}
                currentRound={currentRound}
                completedRoundFixtures={completedRoundFixtures}
                allRounds={allRounds}
                pickMap={pickMap}
                pickOrder={pickOrder}
                myParticipantId={myParticipantId}
                sharingCard={sharingCard}
                preMatchData={preMatchData}
                userAvatarUrl={userAvatarUrl}
                oppAvatarUrl={oppAvatarUrl}
                displayName={displayName}
                userEmail={userEmail}
                selectedMatchup={selectedMatchup}
                loading={loading}
                teamForm={teamForm}
                headToHead={headToHead}
                h2hHome={h2hHome}
                h2hAway={h2hAway}
                shareMatchCard={shareMatchCard}
                submitSinglePick={submitSinglePick}
                setPickMap={setPickMap}
                setSelectedFixtureId={setSelectedFixtureId}
              />
            )}
            {contentTab === 'squad' && (
              <SquadPanel
                selectedFixture={selectedFixture}
                squadData={squadData}
                squadLoading={squadLoading}
              />
            )}
            {contentTab === 'recap' && (
              <RecapPanel
                selectedFixture={selectedFixture}
                recapData={recapData}
                eventsData={eventsData}
                recapLoading={recapLoading}
              />
            )}
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
