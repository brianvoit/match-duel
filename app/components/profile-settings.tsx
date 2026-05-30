'use client';

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
  theme: 'system' | 'light' | 'dark';
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onNameBlur: () => void;
  onDefaultPickSide: (side: 'HOME' | 'AWAY') => void;
  onTogglePush: () => void;
  onThemeChange: (t: 'system' | 'light' | 'dark') => void;
  onSignOut: () => void;
}

export function ProfileSettings({
  userEmail, userAvatarUrl, displayName,
  firstName, lastName, savingName,
  defaultPickSide, savingDefaultPick,
  pushSupported, pushEnabled, pushLoading,
  theme,
  onFirstNameChange, onLastNameChange, onNameBlur,
  onDefaultPickSide, onTogglePush, onThemeChange, onSignOut,
}: ProfileSettingsProps) {
  const shownName = displayName || userEmail.split('@')[0];

  return (
    <div className="wc-stack">
      {/* Avatar + identity */}
      <div className="wc-profile-header">
        <div className="wc-profile-avatar-wrap">
          {userAvatarUrl
            ? <img src={userAvatarUrl} alt="Profile" className="wc-profile-avatar-img" referrerPolicy="no-referrer" />
            : <span className="wc-profile-avatar-init">{shownName.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="wc-profile-identity">
          <div className="wc-profile-identity-name">{shownName}</div>
          <div className="wc-profile-identity-email">{userEmail}</div>
          <div className="wc-profile-identity-hint">Tap photo to change</div>
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
          <div className="wc-profile-setting-hint">
            Get alerted when your opponent picks or results are settled.
          </div>
          <div className="wc-toggle-group">
            <button className={`wc-toggle-btn${!pushEnabled ? ' wc-toggle-btn--active' : ''}`}
              type="button" disabled={pushLoading}
              onClick={() => pushEnabled && onTogglePush()}>Off</button>
            <button className={`wc-toggle-btn${pushEnabled ? ' wc-toggle-btn--active' : ''}`}
              type="button" disabled={pushLoading}
              onClick={() => !pushEnabled && onTogglePush()}>On</button>
          </div>
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

      <ul className="wc-profile-list">
        <li>Reduced motion is respected automatically.</li>
      </ul>

      <button className="wc-signout-btn" type="button" onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
