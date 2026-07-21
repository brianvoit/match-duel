'use client';

import { useEffect, useRef, useState } from 'react';
import { urlBase64ToUint8Array } from '@/app/components/playground-utils';
import type { NoticeTone } from '@/app/components/playground-types';
import type { NotificationPreferences } from '@/app/components/profile-settings';

/**
 * The signed-in user's own profile + device settings: name, avatar, theme,
 * default pick side, and web-push subscription.
 *
 * These are all "about me", loaded once and written only from the profile modal /
 * settings — nothing in the fixture, pick or matchup flow touches them. Grouping
 * them here takes 13 pieces of state, three mount effects (profile load, persisted
 * theme, service-worker/push detection) and six handlers out of Playground, which
 * previously interleaved them with the game state.
 */
export interface UseProfileResult {
  // Identity
  myAppUserId: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  setFirstName: (v: string) => void;
  setLastName: (v: string) => void;
  savingName: boolean;
  saveDisplayName: () => Promise<void>;
  handleNameBlur: () => void;
  // Avatar — a fresh upload overrides the server-provided value for instant feedback.
  userAvatarUrl: string | null | undefined;
  setUploadedAvatar: (url: string | null) => void;
  // Appearance
  theme: 'system' | 'light' | 'dark';
  changeTheme: (t: 'system' | 'light' | 'dark') => void;
  // Pick defaults
  defaultPickSide: 'HOME' | 'AWAY';
  savingDefaultPick: boolean;
  saveDefaultPickSide: (side: 'HOME' | 'AWAY') => Promise<void>;
  // Notifications
  pushSupported: boolean;
  pushEnabled: boolean;
  pushLoading: boolean;
  togglePush: () => Promise<void>;
  notificationPreferences: NotificationPreferences | null;
  saveNotificationPreferences: (prefs: NotificationPreferences) => Promise<void>;
}

export function useProfile(params: {
  showNotice: (tone: NoticeTone, text: string) => void;
  /** Server-rendered avatar from the page props; a fresh upload wins over it. */
  propAvatarUrl?: string | null;
}): UseProfileResult {
  const { showNotice, propAvatarUrl } = params;

  const [myAppUserId, setMyAppUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const [defaultPickSide, setDefaultPickSide] = useState<'HOME' | 'AWAY'>('HOME');
  const [savingDefaultPick, setSavingDefaultPick] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);

  const swRegistration = useRef<ServiceWorkerRegistration | null>(null);

  const userAvatarUrl = uploadedAvatar ?? propAvatarUrl;

  function applyThemeClass(t: 'system' | 'light' | 'dark') {
    const root = document.documentElement;
    root.classList.remove('theme-light', 'theme-dark');
    if (t === 'light') root.classList.add('theme-light');
    if (t === 'dark') root.classList.add('theme-dark');
  }

  // ── Mount: load the profile ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/user/profile', { cache: 'no-store' }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const payload = await res.json();
      if (cancelled || !payload.ok) return;
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
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Mount: apply persisted theme ───────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('wc-theme') as 'system' | 'light' | 'dark' | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
      applyThemeClass(saved);
    }
  }, []);

  // ── Mount: register service worker + check existing push subscription ──────
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

  // ── Handlers ───────────────────────────────────────────────────────────────

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

  function handleNameBlur() {
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    if (!fullName || fullName === displayName) return;
    saveDisplayName();
  }

  function changeTheme(t: 'system' | 'light' | 'dark') {
    setTheme(t);
    applyThemeClass(t);
    localStorage.setItem('wc-theme', t);
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

  async function saveNotificationPreferences(prefs: NotificationPreferences) {
    setNotificationPreferences(prefs);
    await fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationPreferences: prefs }),
    }).catch(() => {});
  }

  return {
    myAppUserId, displayName, firstName, lastName, setFirstName, setLastName,
    savingName, saveDisplayName, handleNameBlur,
    userAvatarUrl, setUploadedAvatar,
    theme, changeTheme,
    defaultPickSide, savingDefaultPick, saveDefaultPickSide,
    pushSupported, pushEnabled, pushLoading, togglePush,
    notificationPreferences, saveNotificationPreferences,
  };
}
