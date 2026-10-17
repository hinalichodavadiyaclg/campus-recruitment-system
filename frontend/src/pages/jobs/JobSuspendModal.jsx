import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { AlertCircleIcon, ShieldIcon } from '../../components/common/Icons.jsx';

export function JobSuspendModal({
  isOpen,
  onClose,
  job,
  onConfirm
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCurrentlySuspended = Boolean(job?.isSuspended);

  useEffect(() => {
    if (isOpen) {
      setReason(isCurrentlySuspended ? 'Compliance verified and approved by Placement Cell.' : '');
      setError('');
    }
  }, [isOpen, isCurrentlySuspended]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      setError('Please provide a reason of at least 3 characters.');
      return;
    }

    try {
      setSaving(true);
      await onConfirm({
        isSuspended: !isCurrentlySuspended,
        suspensionReason: reason.trim()
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
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="500px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: isCurrentlySuspended ? 'var(--green-pale)' : 'var(--red-pale)',
          color: isCurrentlySuspended ? 'var(--green)' : 'var(--red)'
        }}>
          {isCurrentlySuspended ? <ShieldIcon size={20} /> : <AlertCircleIcon size={20} />}
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
            {isCurrentlySuspended ? 'Restore Job Posting' : 'Suspend Job Posting'}
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            Job: <b>{job.jobId}</b> &bull; {job.title}
          </span>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
        {isCurrentlySuspended
          ? 'Restoring this job will re-enable student visibility and applications, and allow company updates.'
          : 'Suspending this job immediately hides it from eligible students, halts new applications, and freezes company edits.'}
      </p>

      {error && <div className="notice error" style={{ marginBottom: '12px' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>
            {isCurrentlySuspended ? 'Restoration Note / Reason' : 'Suspension Reason'}{' '}
            <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea
            rows="3"
            placeholder={
              isCurrentlySuspended
                ? 'e.g. Terms reviewed and updated; drive approved.'
                : 'e.g. Terms clarification pending with company HR.'
            }
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError('');
            }}
          />
        </div>

        <div className="modal-actions" style={{ marginTop: '18px' }}>
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
              ? 'Confirm Restore'
              : 'Suspend Posting'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
