'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { backoffDelay, type BackoffOptions } from '@/lib/realtime/backoff';

export type ChannelStatus = 'idle' | 'connecting' | 'subscribed' | 'error' | 'closed';

/** Attach `.on(...)` handlers to the channel and return it. Called every time
 *  the channel is (re)built, so it must be pure setup — no side effects. */
export type ChannelSetup = (channel: RealtimeChannel) => RealtimeChannel;

export interface UseRealtimeChannelOptions {
  /** Subscribe only when true. Flipping to false tears the channel down. Default true. */
  enabled?: boolean;
  /** Backoff tuning for reconnect attempts. */
  backoff?: BackoffOptions;
  /** Fired whenever the channel status changes. */
  onStatus?: (status: ChannelStatus) => void;
  /** Run once right after the channel reaches 'subscribed' (e.g. presence track). */
  onSubscribed?: (channel: RealtimeChannel) => void;
  /** Tear the channel down while the tab is hidden, re-subscribe on return.
   *  Use for presence (so the user shows offline when backgrounded). Default false. */
  pauseWhenHidden?: boolean;
  /** Passed to `supabase.channel(name, channelConfig)` — e.g. presence key config. */
  channelConfig?: Record<string, unknown>;
}

/**
 * Subscribe to a Supabase Realtime channel with production-grade lifecycle
 * handling:
 *  - resubscribes automatically with exponential backoff + jitter on
 *    CHANNEL_ERROR / TIMED_OUT / CLOSED
 *  - re-subscribes immediately (resetting backoff) when the tab regains focus
 *    or visibility — realtime sockets are commonly dropped while backgrounded
 *  - optionally tears the channel down entirely while hidden (pauseWhenHidden)
 *  - cleans up the channel, timers, and listeners on unmount or when any of
 *    channelName / enabled change
 *
 * Returns a ref to the live channel (for `.send()` etc.) and the current status.
 */
export function useRealtimeChannel(
  channelName: string,
  setup: ChannelSetup,
  options: UseRealtimeChannelOptions = {},
): { channelRef: React.RefObject<RealtimeChannel | null>; status: ChannelStatus } {
  const { enabled = true, backoff, pauseWhenHidden = false, channelConfig } = options;

  // Keep callbacks/options in refs so they don't retrigger the subscribe effect.
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const onStatusRef = useRef(options.onStatus);
  onStatusRef.current = options.onStatus;
  const onSubscribedRef = useRef(options.onSubscribed);
  onSubscribedRef.current = options.onSubscribed;
  const backoffRef = useRef(backoff);
  backoffRef.current = backoff;
  const channelConfigRef = useRef(channelConfig);
  channelConfigRef.current = channelConfig;

  // One browser client per hook instance.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createClient();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const [status, setStatus] = useState<ChannelStatus>('idle');

  useEffect(() => {
    if (!enabled) return;

    const supabase = supabaseRef.current!;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const setPhase = (s: ChannelStatus) => {
      if (disposed) return;
      setStatus(s);
      onStatusRef.current?.(s);
    };

    const teardownChannel = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    const connect = () => {
      teardownChannel();
      if (disposed) return;
      setPhase('connecting');

      const channel = setupRef.current(
        channelConfigRef.current
          ? supabase.channel(channelName, channelConfigRef.current as never)
          : supabase.channel(channelName),
      );
      channelRef.current = channel;

      channel.subscribe((subStatus) => {
        if (disposed) return;
        if (subStatus === 'SUBSCRIBED') {
          attempt = 0; // reset backoff on a healthy connection
          setPhase('subscribed');
          onSubscribedRef.current?.(channel);
        } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') {
          setPhase('error');
          scheduleReconnect();
        } else if (subStatus === 'CLOSED') {
          setPhase('closed');
        }
      });
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      // Don't burn retries while hidden; the visibility handler reconnects on return.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const delay = backoffDelay(attempt++, backoffRef.current);
      retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
    };

    const handleVisible = () => {
      if (disposed) return;
      if (document.visibilityState === 'visible') {
        attempt = 0; // fresh start on return to foreground
        connect();
      } else if (pauseWhenHidden) {
        teardownChannel();
        setPhase('closed');
      }
    };

    connect();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
      teardownChannel();
    };
  }, [channelName, enabled, pauseWhenHidden]);

  return { channelRef, status };
}
