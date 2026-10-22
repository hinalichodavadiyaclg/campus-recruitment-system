import React from 'react';
import { BriefcaseIcon, AlertCircleIcon, PlusIcon, RefreshCwIcon } from '../../components/common/Icons.jsx';
import { Loading } from '../../components/common/Loading.jsx';

export function JobEmptyState({
  loading = false,
  error = null,
  isFiltered = false,
  onResetFilters,
  onRetry,
  onCreateJob,
  canCreate = false,
  title,
  message,
  actionLabel
}) {
  if (loading) {
    return (
      <div className="card empty-state-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
        <Loading message="Loading recruitment records from verified database…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card empty-state-card error-card" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div className="empty-state-icon-wrap error">
          <AlertCircleIcon size={32} color="var(--red)" />
        </div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--ink)', margin: '12px 0 6px' }}>
          Unable to Load Job Postings
        </h3>
        <p style={{ margin: '0 auto 20px', maxWidth: '420px', fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          {error}
        </p>
        {onRetry && (
          <button type="button" className="secondary" onClick={onRetry}>
            <RefreshCwIcon size={14} /> Retry Request
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card empty-state-card" style={{ padding: '60px 24px', textAlign: 'center' }}>
      <div className="empty-state-icon-wrap">
        <BriefcaseIcon size={32} color="var(--muted)" />
      </div>
      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--ink)', margin: '12px 0 6px' }}>
        {title || (isFiltered ? 'No Matching Job Postings Found' : 'No Job Postings Found')}
      </h3>
      <p style={{ margin: '0 auto 24px', maxWidth: '460px', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>
        {message ||
          (isFiltered
            ? 'There are no recruitment opportunities matching your active search or filter criteria. Try clearing or relaxing filters.'
            : 'No recruitment opportunities have been posted yet. New postings will appear here once published.')}
      </p>

      {isFiltered && onResetFilters ? (
        <button type="button" className="secondary" onClick={onResetFilters}>
          Clear All Filters
        </button>
      ) : canCreate && onCreateJob ? (
        <button type="button" className="primary" onClick={onCreateJob}>
          <PlusIcon size={16} /> {actionLabel || 'Post New Job'}
        </button>
      ) : null}
    </div>
  );
}
