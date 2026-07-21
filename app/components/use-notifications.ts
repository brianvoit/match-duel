'use client';

import { useCallback, useState } from 'react';

export interface NotifSummaryEntry {
  matchupId: string;
  opponentName: string | null;
  opponentAvatarUrl: string | null;
  isPending: boolean;
  total: number;
  urgent: number;
}

/**
 * The notification bell drawer: per-matchup pending/urgent counts, fetched on
 * demand (bell click, or prefetched once matchups land — see the
 * fetchNotifSummary param threaded into useMatchups/useRoundFixtures).
 *
 * Called before useMatchups/useRoundFixtures, same as useProfile: those hooks
 * take fetchNotifSummary as a param to prefetch the badge, so it has to exist
 * before they're constructed.
 */
export interface UseNotificationsResult {
  notifDrawerOpen: boolean;
  setNotifDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifSummary: NotifSummaryEntry[];
  setNotifSummary: React.Dispatch<React.SetStateAction<NotifSummaryEntry[]>>;
  notifSummaryLoading: boolean;
  fetchNotifSummary: () => Promise<void>;
}

export function useNotifications(): UseNotificationsResult {
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [notifSummary, setNotifSummary] = useState<NotifSummaryEntry[]>([]);
  const [notifSummaryLoading, setNotifSummaryLoading] = useState(false);

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

  return { notifDrawerOpen, setNotifDrawerOpen, notifSummary, setNotifSummary, notifSummaryLoading, fetchNotifSummary };
}
