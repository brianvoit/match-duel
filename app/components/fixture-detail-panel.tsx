'use client';

import { Dispatch, SetStateAction } from 'react';
import { teamFlag, teamCode } from '@/lib/data/teamInfo';
import { PreMatchPanel } from '@/app/components/pre-match-panel';
import {
  computePickPoints, fmtStage, penaltyWinner, isGenuineDraw,
  initials, StatusGlyph, liveMatchClock,
} from '@/app/components/playground-utils';
import type {
  Fixture, Round, Matchup, PreMatchData, TournamentForm, TournamentFormFixture,
} from '@/app/components/playground-types';

type H2HMeeting = { year: number; stage: string; home: string; away: string; homeGoals: number | null; awayGoals: number | null };

function ScoreBugForm({ form }: { form: string }) {
  const chars = form.split('').filter(c => 'WDL'.includes(c)).slice(-5);
  while (chars.length < 5) chars.unshift('X');
  return (
    <div className="wc-fd-scorebug-form">
      {chars.map((ch, i) => {
        const opacity = 0.35 + (i / 4) * 0.65;
        if (ch === 'X') {
          return <span key={i} className="wc-form-pill wc-form-pill--sm wc-form-pill--empty" style={{ opacity }}>X</span>;
        }
        const bg = ch === 'W' ? 'var(--ok)' : ch === 'D' ? 'var(--text-2)' : 'var(--danger)';
        return <span key={i} className="wc-form-pill wc-form-pill--sm" style={{ background: bg, opacity }}>{ch}</span>;
      })}
    </div>
  );
}

interface FixtureDetailPanelProps {
  selectedMatchupId: string | null;
  selectedFixture: Fixture | null;
  selectedFixtureId: string | null;
  fixtures: Fixture[];
  currentRound: Round | null;
  completedRoundFixtures: Record<string, Fixture[]>;
  allRounds: Round[];
  pickMap: Record<string, 'HOME' | 'AWAY'>;
  pickOrder: Record<string, string>;
  myParticipantId: string | null;
  sharingCard: boolean;
  preMatchData: PreMatchData | null;
  userAvatarUrl?: string | null;
  oppAvatarUrl: string | null;
  displayName: string;
  userEmail: string;
  selectedMatchup: Matchup | null;
  loading: boolean;
  teamForm: TournamentForm | null;
  headToHead: H2HMeeting[];
  h2hHome: string;
  h2hAway: string;
  shareMatchCard: (f: Fixture, stage: string) => void;
  submitSinglePick: (fixtureId: string) => void;
  setPickMap: Dispatch<SetStateAction<Record<string, 'HOME' | 'AWAY'>>>;
  setSelectedFixtureId: Dispatch<SetStateAction<string | null>>;
  setHeadToHead: Dispatch<SetStateAction<H2HMeeting[]>>;
  setTeamForm: Dispatch<SetStateAction<TournamentForm | null>>;
  setH2hHome: Dispatch<SetStateAction<string>>;
  setH2hAway: Dispatch<SetStateAction<string>>;
}

// Extracted from Playground.renderFixtureDetail — a faithful move; the large prop
// surface reflects how coupled this view is to pick/matchup state (a candidate for
// Part 3 Layer 2 state-hook consolidation later).
export function FixtureDetailPanel({
  selectedMatchupId, selectedFixture, selectedFixtureId, fixtures, currentRound,
  completedRoundFixtures, allRounds, pickMap, pickOrder, myParticipantId, sharingCard,
  preMatchData, userAvatarUrl, oppAvatarUrl, displayName, userEmail, selectedMatchup,
  loading, teamForm, headToHead, h2hHome, h2hAway,
  shareMatchCard, submitSinglePick, setPickMap, setSelectedFixtureId, setHeadToHead,
  setTeamForm, setH2hHome, setH2hAway,
}: FixtureDetailPanelProps) {
  if (!selectedMatchupId) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle">Select a matchup from the left to load fixtures.</p>
      </div>
    );
  }

  if (!selectedFixture) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle">Select a fixture from the feed to view its details.</p>
      </div>
    );
  }

  const f = selectedFixture;
  // Picks for a later round stay locked until the current round is settled
  // (the server also enforces this — see picks.ts round-gating). Once the
  // current round settles, it advances and this fixture's round becomes current.
  // Fixture → round is resolved by membership: current-round fixtures live in
  // `fixtures`; other rounds in `completedRoundFixtures` (keyed by round id).
  const fRoundId = fixtures.some((x) => x.id === f.id)
    ? currentRound?.id
    : Object.keys(completedRoundFixtures).find((rid) => completedRoundFixtures[rid]?.some((x) => x.id === f.id));
  const fRound = allRounds.find((r) => r.id === fRoundId);
  const isFutureRoundPick = !!(fRound && currentRound && fRound.order_index > currentRound.order_index);
  // The pick unlocks when the round immediately BEFORE this fixture's round
  // settles (rounds complete in order). Name THAT round — not the matchup's
  // current round, which is wrong for any fixture more than one round ahead
  // (e.g. clicking the Final during the Round of 32 should point to the round
  // that actually gates it, the Third Place match).
  const gatingRound = fRound
    ? allRounds.find((r) => r.order_index === fRound.order_index - 1)
    : null;
  // Use the SELECTED fixture's own round for its stage label + points — not the
  // matchup's current round, which mislabels a fixture from a different round
  // (e.g. viewing the Final while Third Place is the current round showed
  // "Third Place", and scored it with the wrong stage multiplier).
  const stage = fRound?.stage ?? currentRound?.stage ?? '';
  const myPoints = computePickPoints(f, pickMap[f.id] ?? f.myPickSide, stage);
  const firstPickerId = pickOrder[f.id];
  const iPickFirst =
    firstPickerId && myParticipantId ? firstPickerId === myParticipantId : null;

  const myPick = pickMap[f.id] ?? f.myPickSide ?? null;
  const pickState = !myPick ? null
    : f.status === 'FINAL'
      ? (myPoints !== null && myPoints > 0 ? 'correct' : 'wrong')
      : 'pending';

  return (
    <div className="wc-stack">
      {/* Large scorebug — matches feed card style */}
      <div className="wc-fd-scorebug">
        {/* Share the match as an image (copy/paste into a chat) */}
        <button
          className="wc-fd-share-btn"
          type="button"
          disabled={sharingCard}
          aria-label="Share match card"
          title="Share match card"
          onClick={() => shareMatchCard(f, fRound?.stage ?? currentRound?.stage ?? 'GROUP')}
        >
          {sharingCard ? (
            <span className="wc-fd-share-spinner" aria-hidden="true" />
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          )}
        </button>

        {/* Group / stage label */}
        <div className="wc-fd-scorebug-group">
          {f.groupName ? `Group ${f.groupName}` : stage ? fmtStage(stage) : ''}
        </div>

        {/* Teams + score */}
        <div className="wc-fd-scorebug-body">
          {/* Home */}
          <div className="wc-fd-scorebug-team">
            <div className="wc-fd-scorebug-crest-wrap">
              <span className="wc-fd-scorebug-crest">{teamFlag(f.homeTeam)}</span>
              {myPick === 'HOME' && (
                <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side${pickState === 'wrong' ? ' wc-pick-badge--wrong' : pickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                  {userAvatarUrl
                    ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" />
                    : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>
                  }
                </span>
              )}
              {f.opponentPickSide === 'HOME' && (
                <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side">
                  {oppAvatarUrl
                    ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" />
                    : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>
                  }
                </span>
              )}
            </div>
            <h2 className="wc-fd-scorebug-name">{f.homeTeam}</h2>
            <ScoreBugForm form={preMatchData?.homeForm ?? ''} />
          </div>

          {/* Score center */}
          <div className="wc-fd-scorebug-center">
            <div className="wc-fd-scorebug-nums">
              <span>{f.homeScore !== null ? f.homeScore : '—'}</span>
              <span className="wc-fd-scorebug-sep">–</span>
              <span>{f.awayScore !== null ? f.awayScore : '—'}</span>
            </div>
            {penaltyWinner(f) && (
              <div className="wc-fd-scorebug-pens">{f.homePenScore}–{f.awayPenScore} pens</div>
            )}
            <div className="wc-fd-scorebug-status">
              <StatusGlyph status={f.status} isLocked={f.isLocked || iPickFirst === false} size={13} />
            </div>
            <div className="wc-fd-scorebug-kickoff">
              {liveMatchClock(f)
                ? <span className="wc-fd-live-clock">{liveMatchClock(f)}</span>
                : new Date(f.startsAt).toLocaleString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit'
                  })}
            </div>
            {(f.venue || f.city) && (
              <div className="wc-fd-scorebug-venue">
                {[f.venue, f.city].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {/* Away */}
          <div className="wc-fd-scorebug-team">
            <div className="wc-fd-scorebug-crest-wrap">
              <span className="wc-fd-scorebug-crest">{teamFlag(f.awayTeam)}</span>
              {myPick === 'AWAY' && (
                <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side${pickState === 'wrong' ? ' wc-pick-badge--wrong' : pickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                  {userAvatarUrl
                    ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" />
                    : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>
                  }
                </span>
              )}
              {f.opponentPickSide === 'AWAY' && (
                <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side">
                  {oppAvatarUrl
                    ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" />
                    : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>
                  }
                </span>
              )}
            </div>
            <h2 className="wc-fd-scorebug-name">{f.awayTeam}</h2>
            <ScoreBugForm form={preMatchData?.awayForm ?? ''} />
          </div>
        </div>
      </div>


      {/* ── Detail body — centred 3/5 on desktop ─────────────────── */}
      <div className="wc-fd-detail-body">

      {/* Pick section */}
      {(() => {
        const hasPickOrder = Object.keys(pickOrder).length > 0;
        const iAmFirstPicker = !hasPickOrder || pickOrder[f.id] === myParticipantId;
        const myEffectivePick = pickMap[f.id] ?? f.myPickSide;
        const oppEffectivePick = f.opponentPickSide;

        return (
          <>
            {/* Pick action area */}
            <div className="wc-fd-section">
              <h3 className="wc-fd-section-label">Who will win?</h3>

              {isFutureRoundPick ? (
                /* Next round(s) stay locked until the current round is settled */
                <p className="wc-pick-hint wc-pick-hint--locked" style={{ margin: '0 0 6px' }}>
                  Picks open once {(gatingRound ?? currentRound)?.stage ? fmtStage((gatingRound ?? currentRound)!.stage) : 'the current round'} is settled.
                </p>
              ) : f.isLocked ? (
                /* Post-kickoff: show picks with chose/assigned context */
                <div className="wc-fd-locked-picks">
                  <div className="wc-fd-locked-pick">
                    <span className="wc-fd-locked-pick-you">
                      {iAmFirstPicker ? 'You Chose' : 'You Were Assigned'}
                    </span>
                    <span className="wc-fd-locked-pick-team">
                      {myEffectivePick ? (myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam) : '—'}
                    </span>
                  </div>
                  <div className="wc-fd-locked-pick">
                    <span className="wc-fd-locked-pick-you">
                      {iAmFirstPicker ? 'Opponent Was Assigned' : 'Opponent Chose'}
                    </span>
                    <span className="wc-fd-locked-pick-team">
                      {oppEffectivePick ? (oppEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam) : '—'}
                    </span>
                  </div>
                </div>
              ) : iAmFirstPicker ? (
                /* First picker: dropdown + save */
                <>
                  <select
                    className="wc-select"
                    value={pickMap[f.id] ?? ''}
                    disabled={loading}
                    onChange={(e) => {
                      const side = e.target.value as 'HOME' | 'AWAY' | '';
                      setPickMap((prev) => {
                        if (!side) { const next = { ...prev }; delete next[f.id]; return next; }
                        return { ...prev, [f.id]: side };
                      });
                    }}
                  >
                    <option value="" disabled hidden />
                    <option value="HOME">{f.homeTeam}</option>
                    <option value="AWAY">{f.awayTeam}</option>
                  </select>
                  <button
                    className="wc-btn wc-btn-primary"
                    type="button"
                    onClick={() => submitSinglePick(f.id)}
                    disabled={loading || !pickMap[f.id]}
                  >
                    Save Pick
                  </button>
                </>
              ) : myEffectivePick ? (
                /* Second picker — opponent has picked, you're auto-assigned */
                <div className="wc-fd-assigned">
                  <span className="wc-fd-assigned-flag">{teamFlag(myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam)}</span>
                  <div>
                    <div className="wc-fd-assigned-label">You&apos;ve Been Assigned</div>
                    <div className="wc-fd-assigned-team">{myEffectivePick === 'HOME' ? f.homeTeam : f.awayTeam}</div>
                  </div>
                </div>
              ) : (
                /* Second picker — waiting for opponent to pick */
                <p className="wc-pick-hint wc-pick-hint--opponent" style={{ margin: '0 0 6px' }}>
                  Waiting for opponent to pick — you&apos;ll be assigned the other team.
                </p>
              )}
            </div>

            {/* Points outcome */}
            {f.status === 'FINAL' && myPoints !== null && (
              <div className={`wc-fd-outcome${myPoints > 0 ? ' wc-fd-outcome--scored' : isGenuineDraw(f) ? ' wc-fd-outcome--draw' : ' wc-fd-outcome--missed'}`}>
                {`${(displayName || userEmail.split('@')[0]).trim().split(/\s+/)[0]}: ${myPoints}`}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Pre-match context ─────────────────────────────────────── */}
      {preMatchData && <PreMatchPanel data={preMatchData} isKnockout={!!stage && stage !== 'GROUP'} />}

      {/* ── Tournament form ───────────────────────────────────────── */}
      {teamForm && (teamForm.homeFixtures.length > 0 || teamForm.awayFixtures.length > 0) && (() => {

        function renderFormCard(fc: TournamentFormFixture) {
          const myPick  = fc.myPickSide;
          const oppPick = fc.opponentPickSide;
          const homePts = fc.status === 'FINAL' ? computePickPoints(fc as unknown as Fixture, 'HOME', fc.stage) : null;
          const awayPts = fc.status === 'FINAL' ? computePickPoints(fc as unknown as Fixture, 'AWAY', fc.stage) : null;
          const myPickState = !myPick ? null
            : fc.status === 'FINAL'
              ? ((myPick === 'HOME' ? homePts : awayPts) ?? 0) > 0 ? 'correct' : 'wrong'
              : 'pending';

          const kickoffLabel = new Date(fc.startsAt).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          });

          return (
            <button
              key={fc.id}
              className="wc-scorebug"
              onClick={() => {
                setSelectedFixtureId(fc.id);
                setHeadToHead([]);
                setTeamForm(null);
                fetch(`/api/fixtures/${fc.id}/head-to-head`)
                  .then(r => r.json())
                  .then(d => { setHeadToHead(d.meetings ?? []); setH2hHome(d.home ?? ''); setH2hAway(d.away ?? ''); })
                  .catch(() => {});
                const url = selectedMatchupId
                  ? `/api/fixtures/${fc.id}/form?matchupId=${selectedMatchupId}`
                  : `/api/fixtures/${fc.id}/form`;
                fetch(url).then(r => r.json()).then(d => { if (d.ok) setTeamForm(d); }).catch(() => {});
              }}
            >
              <div className="wc-scorebug-group">
                <span>{fc.groupName ? `Group ${fc.groupName}` : ''}</span>
                <span className="wc-scorebug-kickoff">{kickoffLabel}</span>
              </div>
              <div className="wc-scorebug-body">
                {/* Home pts */}
                <div className="wc-scorebug-pts">
                  {fc.status === 'FINAL' && (myPick === 'HOME' || oppPick === 'HOME') && homePts !== null && homePts > 0 && (
                    <span className="wc-scorebug-pts-val">{homePts > 0 ? `+${homePts}` : ''}</span>
                  )}
                </div>

                {/* Home team */}
                <div className="wc-scorebug-team">
                  <div className="wc-scorebug-crest-wrap">
                    <span className="wc-scorebug-crest">{teamFlag(fc.homeTeam)}</span>
                    {myPick === 'HOME' && (
                      <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side${myPickState === 'wrong' ? ' wc-pick-badge--wrong' : myPickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                        {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>}
                      </span>
                    )}
                    {oppPick === 'HOME' && (
                      <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--home-side">
                        {oppAvatarUrl ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>}
                      </span>
                    )}
                  </div>
                  <div className="wc-scorebug-code">{teamCode(fc.homeTeam)}</div>
                </div>

                {/* Score */}
                <div className="wc-scorebug-center">
                  <div className="wc-scorebug-nums">
                    <span>{fc.homeScore !== null ? fc.homeScore : '—'}</span>
                    <span className="wc-scorebug-sep">–</span>
                    <span>{fc.awayScore !== null ? fc.awayScore : '—'}</span>
                  </div>
                  <div className="wc-scorebug-status-row">
                    <StatusGlyph status={fc.status} isLocked={true} />
                  </div>
                </div>

                {/* Away team */}
                <div className="wc-scorebug-team">
                  <div className="wc-scorebug-crest-wrap">
                    <span className="wc-scorebug-crest">{teamFlag(fc.awayTeam)}</span>
                    {myPick === 'AWAY' && (
                      <span className={`wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side${myPickState === 'wrong' ? ' wc-pick-badge--wrong' : myPickState === 'correct' ? ' wc-pick-badge--correct' : ''}`}>
                        {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(displayName || userEmail)}</span>}
                      </span>
                    )}
                    {oppPick === 'AWAY' && (
                      <span className="wc-pick-badge wc-pick-badge--avatar wc-pick-badge--away-side">
                        {oppAvatarUrl ? <img src={oppAvatarUrl} alt="" className="wc-pick-badge-img" /> : <span className="wc-pick-badge-init">{initials(selectedMatchup?.opponentDisplayName || selectedMatchup?.opponentEmail || 'Opp')}</span>}
                      </span>
                    )}
                  </div>
                  <div className="wc-scorebug-code">{teamCode(fc.awayTeam)}</div>
                </div>

                {/* Away pts */}
                <div className="wc-scorebug-pts">
                  {fc.status === 'FINAL' && (myPick === 'AWAY' || oppPick === 'AWAY') && awayPts !== null && awayPts > 0 && (
                    <span className="wc-scorebug-pts-val">{awayPts > 0 ? `+${awayPts}` : ''}</span>
                  )}
                </div>
              </div>
            </button>
          );
        }

        return (
          <>
            {teamForm.homeFixtures.length > 0 && (
              <div className="wc-fd-section">
                <h3 className="wc-fd-section-label">{teamForm.homeTeam}</h3>
                <div className="wc-form-list">
                  {teamForm.homeFixtures.map(renderFormCard)}
                </div>
              </div>
            )}
            {teamForm.awayFixtures.length > 0 && (
              <div className="wc-fd-section">
                <h3 className="wc-fd-section-label">{teamForm.awayTeam}</h3>
                <div className="wc-form-list">
                  {teamForm.awayFixtures.map(renderFormCard)}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Previous Meetings (competitive, non-friendly) */}
      {selectedFixtureId && (
        <div className="wc-fd-section">
          <h3 className="wc-fd-section-label">Previous Meetings</h3>
          {headToHead.length > 0 ? (
            <div className="wc-card wc-h2h-history">
              {headToHead.map((m, i) => {
                const isH2hHomeFixtureHome = m.home === h2hHome;
                const fixtureHomeGoals = isH2hHomeFixtureHome ? m.homeGoals : m.awayGoals;
                const fixtureAwayGoals = isH2hHomeFixtureHome ? m.awayGoals : m.homeGoals;
                const homeWon = (fixtureHomeGoals ?? 0) > (fixtureAwayGoals ?? 0);
                const awayWon = (fixtureAwayGoals ?? 0) > (fixtureHomeGoals ?? 0);
                return (
                  <div key={i} className="wc-h2h-row">
                    <span className={`wc-h2h-row-team${homeWon ? ' wc-h2h-row-team--winner' : ''}`}>{h2hHome}</span>
                    <span className={`wc-h2h-row-score wc-h2h-row-score--${homeWon ? 'home' : awayWon ? 'away' : 'draw'}`}>
                      {fixtureHomeGoals ?? '?'} – {fixtureAwayGoals ?? '?'}
                    </span>
                    <span className={`wc-h2h-row-team wc-h2h-row-team--right${awayWon ? ' wc-h2h-row-team--winner' : ''}`}>{h2hAway}</span>
                    <span className="wc-h2h-row-meta">{m.year} · {m.stage}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="wc-h2h-none">These teams have never met in a competitive match.</p>
          )}
        </div>
      )}

      </div>{/* /wc-fd-detail-body */}
    </div>
  );
}
