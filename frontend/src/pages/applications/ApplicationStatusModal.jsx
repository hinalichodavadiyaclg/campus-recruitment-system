import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import {
  APPLICATION_STATUS_INFO,
  ALLOWED_STATUS_TRANSITIONS
} from '../../utils/job-helpers.js';

export function ApplicationStatusModal({
  isOpen,
  onClose,
  application,
  onConfirm
}) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [note, setNote] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentStatus = application?.status || 'APPLIED';
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

  useEffect(() => {
    if (isOpen && application) {
      setSelectedStatus(allowedNext[0] || '');
      setNote('');
      setReviewerNotes('');
      setError('');
    }
  }, [isOpen, application]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStatus) {
      setError('Please select an authorized next stage.');
      return;
    }

    try {
      setSaving(true);
      await onConfirm(application._id, {
        status: selectedStatus,
        note: note.trim() || undefined,
        reviewerNotes: reviewerNotes.trim() || undefined
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update application status.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !application) return null;

  const currentInfo = APPLICATION_STATUS_INFO[currentStatus] || { label: currentStatus };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="500px">
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--ink)' }}>
          Update Recruitment Stage
        </h2>
        <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
          Application: <b>{application.applicationId}</b> &bull; Current Stage:{' '}
          <b>{currentInfo.label}</b>
        </span>
      </div>

      {allowedNext.length === 0 ? (
        <div className="notice warn">
          This application is in a terminal stage (<b>{currentStatus}</b>) and cannot transition further.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="form-grid">
          {error && <div className="notice error">{error}</div>}

          <div className="field">
            <label>
              Next Stage <span style={{ color: 'var(--red)' }}>*</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              {allowedNext.map((st) => {
                const info = APPLICATION_STATUS_INFO[st] || { label: st };
                return (
                  <option key={st} value={st}>
                    {info.label} ({info.description})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="field">
            <label>Stage Transition Note (Visible in history)</label>
            <input
              type="text"
              placeholder="e.g. Cleared technical interview round with positive feedback"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Internal Reviewer Feedback (Optional)</label>
            <textarea
              rows="3"
              placeholder="Internal notes for recruiting team..."
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '16px' }}>
            <button type="button" className="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Updating Stage…' : 'Advance Stage'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
