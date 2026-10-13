import React from 'react';
import { Modal } from './Modal.jsx';

export function ConfirmModal({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  loading = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="480px">
      <p style={{ marginTop: '8px' }}>{message}</p>
      <div className="modal-actions">
        <button
          className="ghost"
          type="button"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          className={danger ? 'danger' : 'primary'}
          type="button"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Processing…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
