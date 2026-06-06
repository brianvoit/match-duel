'use client';

import { teamFlag } from '@/lib/data/teamInfo';
import type { PreMatchData } from '@/app/components/playground-types';

interface PreMatchPanelProps {
  data: PreMatchData;
}

function oddsToImplied(odd: string): string {
  const n = parseFloat(odd);
  if (!n || n <= 0) return '—';
  return `${Math.round((1 / n) * 100)}%`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="wc-fd-section-label" style={{ marginBottom: 8 }}>{children}</h3>;
}


function FormPill({ result, opacity }: { result: string; opacity: number }) {
  if (result === 'X') {
    return (
      <span className="wc-form-pill wc-form-pill--empty" style={{ opacity }}>
        X
      </span>
    );
  }
  const bg = result === 'W' ? 'var(--ok)' : result === 'D' ? 'var(--text-2)' : 'var(--danger)';
  return (
    <span className="wc-form-pill" style={{ background: bg, opacity }}>
      {result}
    </span>
  );
}

/** Pad a form string to exactly 5 entries, prepending 'X' for unknown oldest results.
 *  Returns oldest-first array, e.g. "WW" → ['X','X','X','W','W']
 */
function padForm(s: string): string[] {
  const chars = s.split('').filter(c => 'WDL'.includes(c)).slice(-5);
  while (chars.length < 5) chars.unshift('X');
  return chars;
}

/** Form row — W/D/L pills always shown (X = no data yet).
 *  Home: oldest → newest left-to-right (newest rightmost, closest to center)
 *  Away: newest → oldest left-to-right (newest leftmost, closest to center)
 *  Opacity fades from 35% (oldest) → 100% (newest).
 */
function FormRow({ homeForm, awayForm }: { homeForm: string; awayForm: string }) {
  const home = padForm(homeForm);                  // oldest first
  const away = [...padForm(awayForm)].reverse();   // newest first
  const steps = 5;
  // home: i=0 oldest (dim) → i=4 newest (full)
  const homeOpacity = (i: number) => 0.35 + (i / (steps - 1)) * 0.65;
  // away: i=0 newest (full) → i=4 oldest (dim)
  const awayOpacity = (i: number) => 0.35 + ((steps - 1 - i) / (steps - 1)) * 0.65;
  return (
    <div className="wc-pm-comp-row">
      <div className="wc-pm-comp-header">
        <span style={{ flex: 1 }} />
        <span className="wc-pm-comp-label">Form</span>
        <span style={{ flex: 1 }} />
      </div>
      <div className="wc-form-pills-row">
        <div className="wc-form-pills">
          {home.map((ch, i) => <FormPill key={i} result={ch} opacity={homeOpacity(i)} />)}
        </div>
        <div className="wc-form-pills wc-form-pills--away">
          {away.map((ch, i) => <FormPill key={i} result={ch} opacity={awayOpacity(i)} />)}
        </div>
      </div>
    </div>
  );
}

function CompBar({ label, home, away }: { label: string; home: number; away: number }) {
  return (
    <div className="wc-pm-comp-row">
      <div className="wc-pm-comp-header">
        <span className="wc-pm-comp-val wc-pm-comp-val--home">{home}%</span>
        <span className="wc-pm-comp-label">{label}</span>
        <span className="wc-pm-comp-val wc-pm-comp-val--away">{away}%</span>
      </div>
      <div className="wc-recap-bars wc-recap-bars--tall">
        <div className="wc-recap-bar-track wc-recap-bar-track--home">
          <div className="wc-recap-bar wc-recap-bar--home" style={{ width: `${home}%` }} />
        </div>
        <div className="wc-recap-bar-track wc-recap-bar-track--away">
          <div className="wc-recap-bar wc-recap-bar--away" style={{ width: `${away}%` }} />
        </div>
      </div>
    </div>
  );
}

export function PreMatchPanel({ data }: PreMatchPanelProps) {
  const { homeTeam, awayTeam, predictions, standings, injuries, odds, topScorers, comparison } = data;

  // Form + Style Comparison always render (with placeholders), so the panel is always shown.

  return (
    <div className="wc-pm-panel">

      {/* ── Win Probability ───────────────────────────────────────────── */}
      {predictions && (
        <div className="wc-fd-section">
          <SectionLabel>Win Probability</SectionLabel>
          <div className="wc-pm-prob">
            <div className="wc-pm-prob-team">
              <div className="wc-pm-prob-pct wc-pm-prob-pct--home">{predictions.homePercent}%</div>
              {/* No name — left = home, right = away */}
            </div>
            <div className="wc-pm-prob-draw">
              <div className="wc-pm-prob-pct wc-pm-prob-pct--draw">{predictions.drawPercent}%</div>
              <div className="wc-pm-prob-name">Draw</div>
            </div>
            <div className="wc-pm-prob-team">
              <div className="wc-pm-prob-pct wc-pm-prob-pct--away">{predictions.awayPercent}%</div>
            </div>
          </div>
          {/* Probability bar — taller for visibility */}
          <div className="wc-pm-prob-bar wc-pm-prob-bar--tall">
            <div className="wc-pm-prob-bar-home" style={{ width: `${predictions.homePercent}%` }} />
            <div className="wc-pm-prob-bar-draw" style={{ width: `${predictions.drawPercent}%` }} />
            <div className="wc-pm-prob-bar-away" style={{ flex: 1 }} />
          </div>
          {/* advice removed */}
        </div>
      )}

      {/* ── Bookmaker Odds ─────────────────────────────────────────────── */}
      {odds && (
        <div className="wc-fd-section">
          <SectionLabel>Odds · {odds.bookmaker}</SectionLabel>
          <div className="wc-pm-odds">
            {[
              { label: homeTeam, odd: odds.home },
              { label: 'Draw', odd: odds.draw },
              { label: awayTeam, odd: odds.away },
            ].map(({ label, odd }) => (
              <div key={label} className="wc-pm-odds-item">
                <div className="wc-pm-odds-odd">{odd}</div>
                <div className="wc-pm-odds-implied">{oddsToImplied(odd)}</div>
                <div className="wc-pm-odds-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form & Goals section removed */}

      {/* ── Injuries & Suspensions ─────────────────────────────────────── */}
      {injuries && (injuries.home.length > 0 || injuries.away.length > 0) && (
        <div className="wc-fd-section">
          <SectionLabel>Injuries &amp; Suspensions</SectionLabel>
          <div className="wc-pm-injuries">
            {[
              { team: homeTeam, list: injuries.home },
              { team: awayTeam, list: injuries.away },
            ].filter(({ list }) => list.length > 0).map(({ team, list }) => (
              <div key={team} className="wc-pm-injury-team">
                <div className="wc-pm-injury-team-name">{teamFlag(team)} {team}</div>
                {list.map((inj, i) => (
                  <div key={i} className={`wc-pm-injury wc-pm-injury--${inj.type.toLowerCase().replace(' ', '-')}`}>
                    <span className="wc-pm-injury-name">{inj.playerName}</span>
                    <span className="wc-pm-injury-type">{inj.type}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Form + Style Comparison — always rendered (X pills / 0% bars until data arrives) */}
      <div className="wc-fd-section">
        <FormRow
          homeForm={predictions?.homeForm ?? ''}
          awayForm={predictions?.awayForm ?? ''}
        />
        <SectionLabel>Style Comparison</SectionLabel>
        <CompBar label="Attack"  home={comparison?.att.home ?? 0}  away={comparison?.att.away ?? 0} />
        <CompBar label="Defence" home={comparison?.def.home ?? 0}  away={comparison?.def.away ?? 0} />
      </div>

      {/* ── Goalscorers (fixture teams only) ──────────────────────────── */}
      {(() => {
        const fixtureScorers = (topScorers ?? []).filter(
          s => s.teamName === homeTeam || s.teamName === awayTeam
        );
        if (!fixtureScorers.length) return null;
        return (
          <div className="wc-fd-section">
            <SectionLabel>Goalscorers</SectionLabel>
            <div className="wc-pm-scorers">
              <div className="wc-pm-scorer wc-pm-scorer--header">
                <span className="wc-pm-scorer-flag" />
                <span className="wc-pm-scorer-name" />
                <span className="wc-pm-scorer-goals">G</span>
                <span className="wc-pm-scorer-assists">A</span>
              </div>
              {fixtureScorers.map((s, i) => (
                <div key={i} className="wc-pm-scorer wc-pm-scorer--highlight">
                  <span className="wc-pm-scorer-flag">{teamFlag(s.teamName)}</span>
                  <span className="wc-pm-scorer-name">{s.playerName}</span>
                  <span className="wc-pm-scorer-goals">{s.goals}</span>
                  <span className="wc-pm-scorer-assists">{s.assists}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Group Standings (last, sits just above Previous Meetings) ───── */}
      {standings && (
        <div className="wc-fd-section">
          <SectionLabel>{standings.group} Standings</SectionLabel>
          <table className="wc-pm-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>P</th><th>W</th><th>D</th><th>L</th>
                <th>GD</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.rows.map(r => (
                <tr key={r.teamName} className={r.isHome || r.isAway ? 'wc-pm-table-highlight' : ''}>
                  <td className="wc-pm-table-team">
                    {r.isHome || r.isAway ? <strong>{r.teamName}</strong> : r.teamName}
                  </td>
                  <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                  <td>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                  <td><strong>{r.points}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
