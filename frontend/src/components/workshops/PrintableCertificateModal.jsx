import React from 'react';
import { Modal } from '../common/Modal.jsx';
import { VvwuLogo } from '../layout/PortalLayout.jsx';
import { CheckCircleIcon, ShieldIcon } from '../common/Icons.jsx';

export function PrintableCertificateModal({ isOpen, certificate, onClose }) {
  if (!certificate) return null;

  const handlePrint = () => {
    window.print();
  };

  const verifyUrl = `#/verify-certificate/${certificate.verificationCode || ''}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Official Certificate of Completion" maxWidth="720px">
      <div style={{ padding: '10px 0' }}>
        {/* Certificate Border Container */}
        <div
          id="printable-certificate"
          style={{
            border: '8px double #102e5f',
            padding: '36px 28px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f9fbfd 100%)',
            borderRadius: '12px',
            textAlign: 'center',
            position: 'relative',
            boxShadow: '0 4px 20px rgba(16, 46, 95, 0.08)'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
            <VvwuLogo size={52} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#102e5f', letterSpacing: '0.04em' }}>
                VEER NARMAD SOUTH GUJARAT UNIVERSITY
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                Vanita Vishram Women's University | Training & Placement Cell
              </div>
            </div>
          </div>

          <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #087c91, transparent)', margin: '16px auto', maxWidth: '80%' }} />

          {/* Certificate Title */}
          <h2 style={{ fontSize: '1.6rem', color: '#102e5f', fontWeight: 800, margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Certificate of Completion
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', fontStyle: 'italic', margin: '0 0 20px' }}>
            This is to certify that
          </p>

          {/* Recipient */}
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#087c91', borderBottom: '1px solid #cbd5e1', display: 'inline-block', padding: '0 32px 6px', margin: '0 auto 16px' }}>
            {certificate.studentName || `${certificate.studentId?.firstName || ''} ${certificate.studentId?.lastName || ''}`.trim() || 'Candidate'}
          </div>

          <p style={{ fontSize: '0.92rem', color: '#334155', maxWidth: '540px', margin: '0 auto 18px', lineHeight: 1.6 }}>
            has successfully completed the training and workshop program on
          </p>

          {/* Workshop Title */}
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#102e5f', margin: '0 auto 18px', maxWidth: '580px' }}>
            "{certificate.workshop?.title || certificate.workshopId?.title || 'Advanced Technical Workshop'}"
          </div>

          {/* Date & Mode Details */}
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 28px' }}>
            Conducted by the Central Placement Cell & Academic Departments with distinction.
          </p>

          {/* Signatures & Verification Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '20px' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Certificate No:</div>
              <strong style={{ fontSize: '0.88rem', color: '#102e5f' }}>{certificate.certificateNumber}</strong>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                Issued: {certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#e7f5f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#087c91', margin: '0 auto 4px' }}>
                <ShieldIcon size={22} />
              </div>
              <div style={{ fontSize: '0.72rem', color: '#087c91', fontWeight: 700 }}>
                AUTHENTIC & VERIFIED
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ width: '120px', borderBottom: '1px solid #102e5f', margin: '0 0 4px auto' }} />
              <strong style={{ fontSize: '0.82rem', color: '#102e5f', display: 'block' }}>Director / Head</strong>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Training & Placement Cell</span>
            </div>
          </div>

          {/* Verification Code Box */}
          <div style={{ marginTop: '18px', background: '#f8fafc', padding: '6px 14px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Digital Verification Key:</span>
            <code style={{ fontSize: '0.78rem', color: '#087c91', fontWeight: 700 }}>{certificate.verificationCode}</code>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary"
            style={{ textDecoration: 'none' }}
          >
            Open Public Verification Link
          </a>
          
          <div className="button-group">
            <button className="ghost" type="button" onClick={onClose}>
              Close
            </button>
            <button className="primary" type="button" onClick={handlePrint}>
              Print Certificate
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
