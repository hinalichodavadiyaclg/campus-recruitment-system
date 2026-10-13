import React from 'react';
import { Modal } from '../common/Modal.jsx';

export function DefaultPasswordsModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Default Initial Passwords">
      <p style={{ marginTop: '8px' }}>
        Initial default passwords for accounts imported from Excel:
      </p>
      <div
        className="card"
        style={{ marginTop: '16px', background: 'var(--canvas)' }}
      >
        <dl className="definition-list">
          <div>
            <dt>Student Accounts</dt>
            <dd>
              <code style={{ fontSize: '1.1em', color: 'var(--teal)' }}>
                Student@123456
              </code>
            </dd>
          </div>
          <div>
            <dt>Company Recruiter Accounts</dt>
            <dd>
              <code style={{ fontSize: '1.1em', color: 'var(--teal)' }}>
                Company@123456
              </code>
            </dd>
          </div>
          <div>
            <dt>Placement Cell Accounts</dt>
            <dd>
              <code style={{ fontSize: '1.1em', color: 'var(--teal)' }}>
                Placement@123456
              </code>
            </dd>
          </div>
        </dl>
      </div>
      <p className="help-text" style={{ marginTop: '16px' }}>
        Users can change their password after logging in, or administrators can reset passwords via the Edit User button.
      </p>
      <div className="modal-actions" style={{ marginTop: '20px' }}>
        <button className="primary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
