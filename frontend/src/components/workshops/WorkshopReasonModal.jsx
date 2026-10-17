import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';

/**
 * Reusable modal for operations requiring a mandatory reason (minimum 5 chars).
 * Supports Workshop Rejection, Workshop Cancellation, and Certificate Revocation.
 */
export function WorkshopReasonModal({
  isOpen,
  title = 'Reason Required',
  message = 'Please provide a clear, detailed reason for this action.',
  label = 'Reason',
  placeholder = 'Enter at least 5 characters explaining the decision...',
  confirmLabel = 'Submit',
  danger = true,
  minLength = 5,
  maxLength = 1000,
  onClose,
  onSubmit,
  isProcessing = false
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < minLength) {
      setError(`Reason must be at least ${minLength} characters.`);
      return;
    }
    if (trimmed.length > maxLength) {
      setError(`Reason cannot exceed ${maxLength} characters.`);
      return;
    }
    setError('');
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err.message || 'Operation failed. Please try again.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="520px">
      <form onSubmit={handleSubmit} style={{ marginTop: '8px' }}>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {message}
        </p>

        <div className="field">
          <label htmlFor="reason-input">{label} <span style={{ color: 'var(--red)' }}>*</span></label>
          <textarea
            id="reason-input"
            rows={4}
            placeholder={placeholder}
            value={reason}
            disabled={isProcessing}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            {error ? (
              <span className="field-error" style={{ color: 'var(--red)', fontSize: '0.82rem' }}>{error}</span>
            ) : (
              <span className="hint" style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                Minimum {minLength} characters required.
              </span>
            )}
            <span style={{ fontSize: '0.78rem', color: reason.length > maxLength ? 'var(--red)' : 'var(--muted)' }}>
              {reason.length} / {maxLength}
            </span>
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button
            className="ghost"
            type="button"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            className={danger ? 'danger' : 'primary'}
            type="submit"
            disabled={isProcessing || reason.trim().length < minLength}
          >
            {isProcessing ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
