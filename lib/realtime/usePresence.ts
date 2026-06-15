'use client';

import { useEffect, useState } from 'react';
import { useRealtimeChannel } from '@/lib/realtime/useRealtimeChannel';

export interface UsePresenceResult {
  /** Presence keys currently online other than me (i.e. the opponent[s]). */
  onlineKeys: string[];
  /** Convenience: someone other than me is present. */
  anyOnline: boolean;
}

/**
 * Tracks who is actively present on a shared channel.
 *
 * Each client joins keyed by its own stable id (`myKey`) and is tracked only
 * while the tab is visible — so a user shows "online" only when they actually
 * have the app open in the foreground. Backgrounding the tab untracks them
 * (pauseWhenHidden), and reconnects use exponential backoff + jitter via the
 * underlying useRealtimeChannel.
 *
 * Keying by `myKey` (rather than Supabase's default random presence ref) is
 * what makes "is the OTHER person here?" answerable: onlineKeys excludes myKey.
 */
export function usePresence(
  channelName: string,
  myKey: string,
  options: { enabled?: boolean } = {},
): UsePresenceResult {
  const enabled = (options.enabled ?? true) && Boolean(myKey);
  const [onlineKeys, setOnlineKeys] = useState<string[]>([]);

  const { status } = useRealtimeChannel(
    channelName,
    (channel) =>
      channel.on('presence', { event: 'sync' }, () => {
        // Identify presences by the userId we put in the tracked payload, NOT by
        // the (random) presence ref. A single user can hold several refs at once
        // — StrictMode remounts, reconnects, a stale tab that hasn't timed out —
        // and we must not count any of our own as "the opponent". Deduping by
        // userId and excluding myKey makes presence accurate regardless.
        const state = channel.presenceState<{ userId?: string }>();
        const others = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.userId && entry.userId !== myKey) others.add(entry.userId);
          }
        }
        setOnlineKeys([...others]);
      }),
    {
      enabled,
      pauseWhenHidden: true,
      channelConfig: { config: { presence: { key: myKey } } },
      onSubscribed: (channel) => { channel.track({ userId: myKey, at: Date.now() }); },
    },
  );

  // While not actively subscribed (reconnecting, or torn down because the tab
  // is hidden) we have no trustworthy presence state — treat everyone offline
  // until the next sync rather than showing stale "online".
  useEffect(() => {
    if (status !== 'subscribed') setOnlineKeys([]);
  }, [status]);

  return { onlineKeys, anyOnline: onlineKeys.length > 0 };
}
