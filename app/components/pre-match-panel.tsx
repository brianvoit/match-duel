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

function FormBadge({ result }: { result: string }) {
  const cls = result === 'W' ? 'win' : result === 'L' ? 'loss' : 'draw';
  return <span className={`wc-pm-form-badge wc-pm-form-badge--${cls}`}>{result}</span>;
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
      <div className="wc-recap-bars">
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
  const { homeTeam, awayTeam, predictions, standings, homeGoals, awayGoals,
    injuries, odds, topScorers, comparison } = data;

  const hasSomething = predictions || standings || homeGoals || injuries || odds || topScorers || comparison;
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
              <div className="wc-pm-prob-name">{teamFlag(homeTeam)} {homeTeam}</div>
            </div>
            <div className="wc-pm-prob-draw">
              <div className="wc-pm-prob-pct wc-pm-prob-pct--draw">{predictions.drawPercent}%</div>
              <div className="wc-pm-prob-name">Draw</div>
            </div>
            <div className="wc-pm-prob-team">
              <div className="wc-pm-prob-pct wc-pm-prob-pct--away">{predictions.awayPercent}%</div>
              <div className="wc-pm-prob-name">{awayTeam} {teamFlag(awayTeam)}</div>
            </div>
          </div>
          {/* Probability bar */}
          <div className="wc-pm-prob-bar">
            <div className="wc-pm-prob-bar-home" style={{ width: `${predictions.homePercent}%` }} />
            <div className="wc-pm-prob-bar-draw" style={{ width: `${predictions.drawPercent}%` }} />
            <div className="wc-pm-prob-bar-away" style={{ flex: 1 }} />
          </div>
          {predictions.advice && (
            <p className="wc-pm-advice">💡 {predictions.advice}</p>
          )}
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

      {/* ── Recent Form & Goals ────────────────────────────────────────── */}
      {(predictions?.homeForm || homeGoals) && (
        <div className="wc-fd-section">
          <SectionLabel>Form &amp; Goals (Last 5)</SectionLabel>
          <div className="wc-pm-form-rows">
            {[
              { team: homeTeam, form: predictions?.homeForm, goals: homeGoals },
              { team: awayTeam, form: predictions?.awayForm, goals: awayGoals },
            ].map(({ team, form, goals }) => (
              <div key={team} className="wc-pm-form-row">
                <div className="wc-pm-form-team">
                  {teamFlag(team)}
                  <span className="wc-pm-form-team-name">{team}</span>
                </div>
                <div className="wc-pm-form-badges">
                  {form ? [...form].slice(-5).map((r, i) => (
                    <FormBadge key={i} result={r} />
                  )) : <span className="wc-pm-form-na">—</span>}
                </div>
                {goals && (
                  <div className="wc-pm-form-goals">
                    <span className="wc-pm-form-goals-for">⚽ {goals.avgFor}</span>
                    <span className="wc-pm-form-goals-against">🧤 {goals.avgAgainst}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ── Style Comparison ───────────────────────────────────────────── */}
      {comparison && (
        <div className="wc-fd-section">
          <SectionLabel>Style Comparison</SectionLabel>
          <div className="wc-pm-comp-header-teams">
            <span>{teamFlag(homeTeam)} {homeTeam}</span>
            <span>{awayTeam} {teamFlag(awayTeam)}</span>
          </div>
          <CompBar label="Form" home={comparison.form.home} away={comparison.form.away} />
          <CompBar label="Attack" home={comparison.att.home} away={comparison.att.away} />
          <CompBar label="Defence" home={comparison.def.home} away={comparison.def.away} />
        </div>
      )}

      {/* ── Top Scorers ────────────────────────────────────────────────── */}
      {topScorers && topScorers.length > 0 && (
        <div className="wc-fd-section">
          <SectionLabel>Tournament Top Scorers</SectionLabel>
          <div className="wc-pm-scorers">
            {topScorers.map((s, i) => {
              const isFixtureTeam = s.teamName === homeTeam || s.teamName === awayTeam;
              return (
                <div key={i} className={`wc-pm-scorer${isFixtureTeam ? ' wc-pm-scorer--highlight' : ''}`}>
                  <span className="wc-pm-scorer-rank">{i + 1}</span>
                  <span className="wc-pm-scorer-flag">{teamFlag(s.teamName)}</span>
                  <span className="wc-pm-scorer-name">{s.playerName}</span>
                  <span className="wc-pm-scorer-goals">⚽ {s.goals}</span>
                  {s.assists > 0 && <span className="wc-pm-scorer-assists">🅰 {s.assists}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
