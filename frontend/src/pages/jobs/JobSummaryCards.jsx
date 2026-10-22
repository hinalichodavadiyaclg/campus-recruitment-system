import React from 'react';

/**
 * Reusable summary metric cards component for Job module views
 * Displays live authoritative statistics in clean, compact VVWU-styled cards.
 */
export function JobSummaryCards({ cards = [] }) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="job-metrics-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        const isClickable = typeof card.onClick === 'function';

        return (
          <div
            key={card.id || card.label}
            className={`job-metric-card ${card.active ? 'active' : ''} ${isClickable ? 'clickable' : ''}`}
            onClick={card.onClick}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      card.onClick();
                    }
                  }
                : undefined
            }
          >
            <div className="job-metric-icon-wrap" style={{ color: card.color || 'var(--navy)', background: card.bg || '#f1f5f9' }}>
              {Icon && <Icon size={20} />}
            </div>
            <div className="job-metric-data">
              <span className="job-metric-value">{card.value ?? 0}</span>
              <span className="job-metric-label">{card.label}</span>
            </div>
            {card.subtitle && (
              <span className="job-metric-sub">{card.subtitle}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
