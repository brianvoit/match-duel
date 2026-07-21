'use client';

import { useState, useRef } from 'react';
import type { TouchEventHandler } from 'react';

/**
 * Pull-to-refresh on the fixture feed: touch tracking, the reveal distance
 * shown while dragging, and the in-flight guard around the actual refresh.
 * Takes the feed's scroll container ref (owned by Playground, since other
 * scroll logic — auto-scroll-to-today, scroll-to-fixture — also uses it) and
 * the refresh callback to run once the user drags past the trigger distance.
 */
export interface UsePullToRefreshResult {
  pullUI: number;
  refreshing: boolean;
  onTouchStart: TouchEventHandler<HTMLDivElement>;
  onTouchMove: TouchEventHandler<HTMLDivElement>;
  onTouchEnd: TouchEventHandler<HTMLDivElement>;
}

export function usePullToRefresh(params: {
  feedScrollRef: React.RefObject<HTMLDivElement | null>;
  onRefresh: () => Promise<void>;
}): UsePullToRefreshResult {
  const { feedScrollRef, onRefresh } = params;

  const pullStartY = useRef<number | null>(null);
  const pullDist = useRef(0);
  const [pullUI, setPullUI] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  const onTouchStart: TouchEventHandler<HTMLDivElement> = (e) => {
    const c = feedScrollRef.current;
    pullStartY.current = c && c.scrollTop <= 0 ? e.touches[0].clientY : null;
    pullDist.current = 0;
  };

  const onTouchMove: TouchEventHandler<HTMLDivElement> = (e) => {
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
  };

  const onTouchEnd: TouchEventHandler<HTMLDivElement> = () => {
    const triggered = pullStartY.current !== null && pullDist.current > 60;
    pullStartY.current = null;
    pullDist.current = 0;
    setPullUI(0);
    if (triggered) refresh();
  };

  return { pullUI, refreshing, onTouchStart, onTouchMove, onTouchEnd };
}
