'use client';

interface PickSummaryStats {
  total: number;
  urgent: number;
  soon: number;
  later: number;
}

interface PickSummaryContentProps {
  stats: PickSummaryStats;
  onShowUnpicked: () => void;
  onDismiss: () => void;
}

export function PickSummaryContent({ stats, onShowUnpicked, onDismiss }: PickSummaryContentProps) {
  const { total, urgent, soon, later } = stats;

  if (total === 0) {
    return (
      <div className="wc-pick-summary-hero" style={{ paddingBottom: 8 }}>
        <div style={{ fontSize: '1.8rem', textAlign: 'center' }}>✓</div>
        <div className="wc-pick-summary-label" style={{ textAlign: 'center' }}>
          You&apos;re all caught up — no picks to make right now.
        </div>
      </div>
    );
  }

  return (
    <div className="wc-stack">
      <div className="wc-pick-summary-hero">
        <div className="wc-pick-summary-num">{total}</div>
        <div className="wc-pick-summary-label">
          {total === 1 ? 'pick to make' : 'picks to make'} this round
        </div>
      </div>

      {(urgent > 0 || soon > 0) && (
        <div className="wc-pick-summary-rows">
          {urgent > 0 && (
            <div className="wc-pick-summary-row wc-pick-summary-row--urgent">
              <span className="wc-pick-summary-dot wc-pick-summary-dot--urgent" />
              <span className="wc-pick-summary-count">{urgent}</span>
              <span className="wc-pick-summary-desc">{urgent === 1 ? 'locks' : 'lock'} in the next 24 hours</span>
            </div>
          )}
          {soon > 0 && (
            <div className="wc-pick-summary-row wc-pick-summary-row--soon">
              <span className="wc-pick-summary-dot wc-pick-summary-dot--soon" />
              <span className="wc-pick-summary-count">{soon}</span>
              <span className="wc-pick-summary-desc">{soon === 1 ? 'locks' : 'lock'} in 1–3 days</span>
            </div>
          )}
        </div>
      )}

      <div className="wc-onboarding-actions" style={{ marginTop: 8 }}>
        <button className="wc-onboarding-skip" type="button" onClick={onDismiss}>
          DISMISS
        </button>
        <button className="wc-onboarding-next" type="button" onClick={onShowUnpicked} aria-label="Show unpicked fixtures">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M6 4 L12 9 L6 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
