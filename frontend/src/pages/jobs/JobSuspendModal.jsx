import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { AlertCircleIcon, ShieldIcon } from '../../components/common/Icons.jsx';

const SUSPENSION_CATEGORIES = [
  { id: 'POLICY_VIOLATION', label: 'University Placement Policy Violation' },
  { id: 'MISLEADING_INFO', label: 'Misleading Job Description or Compensation Terms' },
  { id: 'CONTRADICTORY_CRITERIA', label: 'Contradictory / Unauthorized Eligibility Criteria' },
  { id: 'FRAUDULENT_OR_COMPLAINT', label: 'Credible Student Complaints / Fraudulent Recruitment' },
  { id: 'WITHDRAWN_AUTHORIZATION', label: 'Recruiter Authorization Expired or Revoked' },
  { id: 'OTHER', label: 'Other Institutional Regulatory Reason' }
];

export function JobSuspendModal({
  isOpen,
  onClose,
  job,
  onConfirm
}) {
  const [category, setCategory] = useState(SUSPENSION_CATEGORIES[0].id);
  const [explanation, setExplanation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCurrentlySuspended = Boolean(job?.isSuspended);

  useEffect(() => {
    if (isOpen) {
      setCategory(SUSPENSION_CATEGORIES[0].id);
      setExplanation(
        isCurrentlySuspended
          ? 'Compliance and eligibility terms verified and approved by Placement Cell.'
          : ''
      );
      setError('');
    }
  }, [isOpen, isCurrentlySuspended]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isCurrentlySuspended) {
      if (!explanation.trim() || explanation.trim().length < 10) {
        setError('Please provide an official explanation of at least 10 characters.');
        return;
      }
    } else {
      if (!explanation.trim() || explanation.trim().length < 5) {
        setError('Please provide a restoration note of at least 5 characters.');
        return;
      }
    }

    try {
      setSaving(true);
      const catObj = SUSPENSION_CATEGORIES.find((c) => c.id === category);
      const fullReason = isCurrentlySuspended
        ? explanation.trim()
        : `[${catObj?.label || 'Policy Action'}]: ${explanation.trim()}`;

      await onConfirm({
        isSuspended: !isCurrentlySuspended,
        suspensionReason: fullReason
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Operation failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="540px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: isCurrentlySuspended ? 'var(--green-pale)' : 'var(--red-pale)',
          color: isCurrentlySuspended ? 'var(--green)' : 'var(--red)',
          flexShrink: 0
        }}>
          {isCurrentlySuspended ? <ShieldIcon size={22} /> : <AlertCircleIcon size={22} />}
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
            {isCurrentlySuspended ? 'Restore Job Posting' : 'Institutional Job Suspension'}
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            Job: <b>{job.jobId}</b> &bull; {job.title}
          </span>
        </div>
      </div>

      <div className={isCurrentlySuspended ? 'notice info' : 'suspend-warning-box'} style={{ marginBottom: '16px' }}>
        <strong>
          {isCurrentlySuspended
            ? 'Placement Cell Re-Approval'
            : 'Authoritative University Regulatory Action'}
        </strong>
        {isCurrentlySuspended
          ? 'Restoring this posting will re-enable student discovery, open applications if deadline is valid, and restore company management.'
          : 'Suspending this posting immediately revokes student discovery and halts applications across the institution, overriding company controls until cleared.'}
      </div>

      {error && <div className="notice error" style={{ marginBottom: '12px' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {!isCurrentlyCurrentlySuspended(isCurrentlySuspended) && (
          <div className="field" style={{ marginBottom: '14px' }}>
            <label>
              Suspension Reason Category <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {SUSPENSION_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>
            {isCurrentlySuspended ? 'Restoration & Verification Note' : 'Detailed Explanation'}{' '}
            <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea
            rows="3"
            placeholder={
              isCurrentlySuspended
                ? 'e.g. Terms reviewed with company representative; compensation verified and approved.'
                : 'Provide specific policy rationale and required actions before restoration...'
            }
            value={explanation}
            onChange={(e) => {
              setExplanation(e.target.value);
              setError('');
            }}
          />
          <span style={{ fontSize: '0.74rem', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
            {isCurrentlySuspended
              ? 'This note will be logged in the permanent audit trail.'
              : 'Minimum 10 characters. Stored as an institutional compliance record.'}
          </span>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className={isCurrentlySuspended ? 'primary' : 'danger'}
            disabled={saving}
          >
            {saving
              ? 'Processing…'
              : isCurrentlySuspended
              ? 'Confirm Restoration'
              : 'Authorize Suspension'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function isCurrentlyCurrentlySuspended(isCurrentlySuspended) {
  return isCurrentlySuspended;
}
