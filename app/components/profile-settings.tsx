'use client';

import { useRef, useState } from 'react';
import { avatarColor } from '@/lib/avatar-color';

/** Downscale an image file to a small square-ish JPEG blob for upload. */
async function resizeImage(file: File, max = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image processing failed'))), 'image/jpeg', 0.85)
  );
}

export interface NotificationPreferences {
  pick_reminder:  boolean;
  match_finished: string[];
  round_complete: boolean;
  chat_message:   boolean;
}

const MATCH_FINISHED_STAGES = [
  { key: 'GROUP',        label: 'Group Stage' },
  { key: 'ROUND_OF_32',  label: 'Round of 32' },
  { key: 'ROUND_OF_16',  label: 'Round of 16' },
  { key: 'QUARTERFINAL', label: 'Quarter-Finals' },
  { key: 'SEMIFINAL',    label: 'Semi-Finals' },
  { key: 'THIRD_PLACE',  label: '3rd Place' },
  { key: 'FINAL',        label: 'Final' },
];

const DEFAULT_PREFS: NotificationPreferences = {
  pick_reminder:  true,
  match_finished: ['QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'],
  round_complete: true,
  chat_message:   true,
};

interface ProfileSettingsProps {
  userEmail: string;
  userAvatarUrl?: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  savingName: boolean;
  defaultPickSide: 'HOME' | 'AWAY';
  savingDefaultPick: boolean;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushLoading: boolean;
  notificationPreferences?: NotificationPreferences | null;
  theme: 'system' | 'light' | 'dark';
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onNameBlur: () => void;
  onDefaultPickSide: (side: 'HOME' | 'AWAY') => void;
  onTogglePush: () => void;
  onNotificationPrefsChange: (prefs: NotificationPreferences) => void;
  onThemeChange: (t: 'system' | 'light' | 'dark') => void;
  onAvatarUploaded: (url: string) => void;
  onSignOut: () => void;
}

export function ProfileSettings({
  userEmail, userAvatarUrl, displayName,
  firstName, lastName, savingName,
  defaultPickSide, savingDefaultPick,
  pushSupported, pushEnabled, pushLoading,
  notificationPreferences,
  theme,
  onFirstNameChange, onLastNameChange, onNameBlur,
  onDefaultPickSide, onTogglePush, onNotificationPrefsChange, onThemeChange, onAvatarUploaded, onSignOut,
}: ProfileSettingsProps) {
  const prefs: NotificationPreferences = notificationPreferences ?? DEFAULT_PREFS;
  const shownName = displayName || userEmail.split('@')[0];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Please choose an image file.'); return; }
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const blob = await resizeImage(file);
      const fd = new FormData();
      fd.append('file', blob, 'avatar.jpg');
      const res = await fetch('/api/user/avatar', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      onAvatarUploaded(data.url as string);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div className="wc-stack">
      {/* Avatar + identity */}
      <div className="wc-profile-header">
        <button
          type="button"
          className="wc-profile-avatar-wrap"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAvatar}
          aria-label="Change profile photo"
        >
          {userAvatarUrl
            ? <img src={userAvatarUrl} alt="Profile" className="wc-profile-avatar-img" referrerPolicy="no-referrer" />
            : <span className="wc-profile-avatar-init" style={{ background: avatarColor(userEmail) }}>{shownName.charAt(0).toUpperCase()}</span>
          }
          {uploadingAvatar && <span className="wc-profile-avatar-uploading">…</span>}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarFile}
        />
        <div className="wc-profile-identity">
          <div className="wc-profile-identity-name">{shownName}</div>
          <div className="wc-profile-identity-email">{userEmail}</div>
          <div className="wc-profile-identity-hint">
            {avatarError ? <span className="wc-profile-avatar-error">{avatarError}</span> : (uploadingAvatar ? 'Uploading…' : 'Tap photo to change')}
          </div>
        </div>
      </div>

      {/* First / Last name */}
      <div className="wc-name-row">
        <div className="wc-floating-field">
          <span className="wc-floating-label">First name</span>
          <input className="wc-floating-input" value={firstName} maxLength={32}
            onChange={e => onFirstNameChange(e.target.value)} onBlur={onNameBlur} />
        </div>
        <div className="wc-floating-field">
          <span className="wc-floating-label">Last name</span>
          <input className="wc-floating-input" value={lastName} maxLength={32}
            onChange={e => onLastNameChange(e.target.value)} onBlur={onNameBlur} />
        </div>
      </div>

      {/* Default pick side */}
      <div className="wc-profile-setting">
        <div className="wc-profile-setting-label">Default pick if I miss kickoff</div>
        <div className="wc-profile-setting-hint">
          If you don&apos;t pick before a match starts, this team side is used automatically.
        </div>
        <div className="wc-toggle-group">
          {(['HOME', 'AWAY'] as const).map(side => (
            <button key={side}
              className={`wc-toggle-btn${defaultPickSide === side ? ' wc-toggle-btn--active' : ''}`}
              type="button" disabled={savingDefaultPick}
              onClick={() => onDefaultPickSide(side)}
            >
              {side.charAt(0) + side.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Push notifications */}
      {pushSupported && (
        <div className="wc-profile-setting">
          <div className="wc-profile-setting-label">Push notifications</div>
          <div className="wc-toggle-group" style={{ marginBottom: 12 }}>
            <button className={`wc-toggle-btn${!pushEnabled ? ' wc-toggle-btn--active' : ''}`}
              type="button" disabled={pushLoading}
              onClick={() => pushEnabled && onTogglePush()}>Off</button>
            <button className={`wc-toggle-btn${pushEnabled ? ' wc-toggle-btn--active' : ''}`}
              type="button" disabled={pushLoading}
              onClick={() => !pushEnabled && onTogglePush()}>On</button>
          </div>

          {pushEnabled && (
            <div className="wc-notif-prefs">

              {/* Pick reminder */}
              <label className="wc-notif-row">
                <span className="wc-notif-label">Pick reminders</span>
                <input type="checkbox" checked={prefs.pick_reminder}
                  onChange={e => onNotificationPrefsChange({ ...prefs, pick_reminder: e.target.checked })} />
              </label>

              {/* Match finished */}
              <div className="wc-notif-row wc-notif-row--group">
                <span className="wc-notif-label">Match finished</span>
                <div className="wc-notif-stages">
                  {MATCH_FINISHED_STAGES.map(({ key, label }) => (
                    <label key={key} className="wc-notif-stage-row">
                      <span>{label}</span>
                      <input type="checkbox"
                        checked={prefs.match_finished.includes(key)}
                        onChange={e => {
                          const stages = e.target.checked
                            ? [...prefs.match_finished, key]
                            : prefs.match_finished.filter(s => s !== key);
                          onNotificationPrefsChange({ ...prefs, match_finished: stages });
                        }} />
                    </label>
                  ))}
                </div>
              </div>

              {/* Round results */}
              <label className="wc-notif-row">
                <span className="wc-notif-label">Round results</span>
                <input type="checkbox" checked={prefs.round_complete}
                  onChange={e => onNotificationPrefsChange({ ...prefs, round_complete: e.target.checked })} />
              </label>

              {/* Chat */}
              <label className="wc-notif-row">
                <span className="wc-notif-label">Chat messages</span>
                <input type="checkbox" checked={prefs.chat_message}
                  onChange={e => onNotificationPrefsChange({ ...prefs, chat_message: e.target.checked })} />
              </label>

            </div>
          )}
        </div>
      )}

      {/* Theme */}
      <div className="wc-profile-setting">
        <div className="wc-profile-setting-label">Theme</div>
        <div className="wc-toggle-group">
          {(['system', 'light', 'dark'] as const).map(t => (
            <button key={t}
              className={`wc-toggle-btn${theme === t ? ' wc-toggle-btn--active' : ''}`}
              type="button" onClick={() => onThemeChange(t)}
            >
              {t === 'system' ? 'System' : t === 'light' ? 'Day' : 'Night'}
            </button>
          ))}
        </div>
      </div>

      <button className="wc-signout-btn" type="button" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
