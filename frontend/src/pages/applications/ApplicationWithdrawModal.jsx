import React, { useState } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { AlertTriangleIcon } from '../../components/common/Icons.jsx';

export function ApplicationWithdrawModal({
  isOpen,
  onClose,
  application,
  onConfirm
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !application) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      await onConfirm(application._id, { reason: reason.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to withdraw application.');
    } finally {
      setSaving(false);
    }
  };

  const jobTitle = application.jobSnapshot?.title || application.jobId?.title || 'Job';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="480px">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--red-pale)',
          color: 'var(--red)'
        }}>
          <AlertTriangleIcon size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--ink)' }}>
            Withdraw Application
          </h2>
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            Application: <b>{application.applicationId}</b> &bull; {jobTitle}
          </span>
        </div>
      </div>

      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
        Are you sure you want to withdraw your application? This action cannot be undone for the current recruitment round.
      </p>

      {error && <div className="notice error" style={{ marginBottom: '12px' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Reason for Withdrawal (Optional)</label>
          <textarea
            rows="3"
            placeholder="e.g. Accepted another campus offer, personal circumstances..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="modal-actions" style={{ marginTop: '18px' }}>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={saving}>
            {saving ? 'Withdrawing…' : 'Confirm Withdrawal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
