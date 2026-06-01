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

  const hasSomething = predictions || standings || injuries || odds || topScorers || comparison;
  if (!hasSomething) return null;

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

      {/* ── Group Standings ────────────────────────────────────────────── */}
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

      {/* ── Style Comparison — no team labels, side implies team ───────── */}
      {comparison && (
        <div className="wc-fd-section">
          <SectionLabel>Style Comparison</SectionLabel>
          {/* Team labels removed — left = home (blue), right = away (amber) */}
          <CompBar label="Form"    home={comparison.form.home} away={comparison.form.away} />
          <CompBar label="Attack"  home={comparison.att.home}  away={comparison.att.away} />
          <CompBar label="Defence" home={comparison.def.home}  away={comparison.def.away} />
        </div>
      )}

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

    </div>
  );
}
