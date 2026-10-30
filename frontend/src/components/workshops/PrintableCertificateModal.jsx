import React, { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { VvwuLogo } from '../layout/PortalLayout.jsx';
import { ShieldIcon } from '../common/Icons.jsx';

export function PrintableCertificateModal({ isOpen, certificate, onClose, onDownload }) {
  const [activeTab, setActiveTab] = useState('pdf');

  if (!certificate) return null;

  const pdfUrl = certificate.fileUrl || `/uploads/certificates/${certificate.certificateNumber}.pdf`;
  const verifyUrl = `#/verify-certificate/${certificate.verificationCode || ''}`;

  const recipientName =
    certificate.recipientName ||
    certificate.studentName ||
    `${certificate.studentId?.firstName || ''} ${certificate.studentId?.lastName || ''}`.trim() ||
    'Distinguished Participant';

  const workshopTitle =
    certificate.workshop?.title ||
    certificate.workshopId?.title ||
    'Advanced Technical Workshop';

  const signatoryName =
    certificate.templateSnapshot?.signatoryName ||
    certificate.certificateTemplateId?.signatoryName ||
    'Director / Head';

  const signatoryTitle =
    certificate.templateSnapshot?.signatoryTitle ||
    certificate.certificateTemplateId?.signatoryTitle ||
    'Training & Placement Cell';

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Certificate: ${certificate.certificateNumber}`}
      maxWidth="880px"
    >
      <div style={{ padding: '4px 0' }}>
        {/* View Mode Toggle Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            borderBottom: '1px solid var(--line)',
            paddingBottom: '10px',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={activeTab === 'pdf' ? 'primary' : 'secondary'}
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => setActiveTab('pdf')}
            >
              PDF Document
            </button>
            <button
              type="button"
              className={activeTab === 'card' ? 'primary' : 'secondary'}
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => setActiveTab('card')}
            >
              Digital Credential View
            </button>
          </div>

          {onDownload && (
            <button
              type="button"
              className="primary"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => onDownload(certificate)}
            >
              Download PDF
            </button>
          )}
        </div>

        {activeTab === 'pdf' ? (
          <div
            style={{
              width: '100%',
              minHeight: '520px',
              background: '#f8fafc',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--line)'
            }}
          >
            <iframe
              src={pdfUrl}
              title={`Certificate PDF ${certificate.certificateNumber}`}
              style={{ width: '100%', height: '540px', border: 'none', display: 'block' }}
            />
          </div>
        ) : (
          /* Certificate Border Container */
          <div
            id="printable-certificate"
            style={{
              border: '6px double #102e5f',
              padding: '32px 28px',
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
                <div style={{ fontSize: '1.28rem', fontWeight: 800, color: '#102e5f', letterSpacing: '0.04em' }}>
                  VANITA VISHRAM WOMEN'S UNIVERSITY
                </div>
                <div style={{ fontSize: '0.82rem', color: '#087c91', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Training & Placement Cell
                </div>
              </div>
            </div>

            <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #087c91, transparent)', margin: '14px auto', maxWidth: '80%' }} />

            {/* Certificate Title */}
            <h2 style={{ fontSize: '1.5rem', color: '#102e5f', fontWeight: 800, margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Certificate of Completion
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b', fontStyle: 'italic', margin: '0 0 16px' }}>
              This is to proudly certify that
            </p>

            {/* Recipient */}
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#087c91', borderBottom: '1px solid #cbd5e1', display: 'inline-block', padding: '0 32px 6px', margin: '0 auto 14px' }}>
              {recipientName}
            </div>

            <p style={{ fontSize: '0.92rem', color: '#334155', maxWidth: '540px', margin: '0 auto 16px', lineHeight: 1.6 }}>
              has successfully completed the training and workshop program on
            </p>

            {/* Workshop Title */}
            <div style={{ fontSize: '1.22rem', fontWeight: 700, color: '#102e5f', margin: '0 auto 16px', maxWidth: '580px' }}>
              "{workshopTitle}"
            </div>

            {/* Date & Mode Details */}
            <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 24px' }}>
              Conducted by Vanita Vishram Women's University Central Placement Cell & Academic Departments with distinction.
            </p>

            {/* Signatures & Verification Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '18px', marginTop: '18px' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Certificate No:</div>
                <strong style={{ fontSize: '0.88rem', color: '#102e5f' }}>{certificate.certificateNumber}</strong>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                  Issued: {certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                {certificate.qrCodeUrl ? (
                  <img
                    src={certificate.qrCodeUrl}
                    alt="Scannable QR Verification Code"
                    style={{ width: '68px', height: '68px', display: 'block', margin: '0 auto 4px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                  />
                ) : (
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#e7f5f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#087c91', margin: '0 auto 4px' }}>
                    <ShieldIcon size={22} />
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#087c91', fontWeight: 700 }}>
                  {certificate.qrCodeUrl ? 'SCAN TO VERIFY' : 'AUTHENTIC & VERIFIED'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ width: '130px', borderBottom: '1px solid #102e5f', margin: '0 0 4px auto' }} />
                <strong style={{ fontSize: '0.82rem', color: '#102e5f', display: 'block' }}>{signatoryName}</strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{signatoryTitle}</span>
              </div>
            </div>

            {/* Verification Code Box */}
            <div style={{ marginTop: '16px', background: '#f8fafc', padding: '6px 14px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Digital Verification Key:</span>
              <code style={{ fontSize: '0.78rem', color: '#087c91', fontWeight: 700 }}>{certificate.verificationCode}</code>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-actions" style={{ marginTop: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary"
            style={{ textDecoration: 'none', fontSize: '0.82rem', padding: '8px 14px' }}
          >
            Public Verification Page →
          </a>

          <div className="button-group" style={{ display: 'flex', gap: '8px' }}>
            <button className="ghost" type="button" onClick={onClose} style={{ fontSize: '0.82rem' }}>
              Close
            </button>
            <button className="secondary" type="button" onClick={handlePrint} style={{ fontSize: '0.82rem' }}>
              Print
            </button>
            {onDownload && (
              <button className="primary" type="button" onClick={() => onDownload(certificate)} style={{ fontSize: '0.82rem' }}>
                Download PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
