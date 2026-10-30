import React, { useState, useEffect, useCallback } from 'react';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { workshopService } from '../../services/workshop.service.js';
import { useToast } from '../../context/ToastContext.jsx';
import { ShieldIcon } from '../../components/common/Icons.jsx';
import { PrintableCertificateModal } from '../../components/workshops/PrintableCertificateModal.jsx';

export function StudentMyCertificatesPage() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingCertificate, setViewingCertificate] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadCertificates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await workshopService.getMyCertificates();
      setCertificates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load certificates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  const handleDownload = async (cert) => {
    if (cert.certificateStatus === 'REVOKED') {
      toast('This certificate has been revoked and cannot be downloaded.');
      return;
    }
    setDownloadingId(cert._id);
    try {
      await workshopService.downloadCertificate(cert._id, cert.certificateNumber);
      toast('Certificate downloaded successfully.');
    } catch (err) {
      toast(err.message || 'Failed to download certificate.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <PortalLayout
      title="My Certificates"
      description="Official completion certificates for concluded workshops."
      currentPath="/certificates"
    >
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Earned Certificates ({certificates.length})</h3>
          <button
            type="button"
            className="secondary"
            onClick={loadCertificates}
            disabled={loading}
            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="card" style={{ marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '12px 16px' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="card empty" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p>Loading certificates…</p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="card empty" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <ShieldIcon size={48} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
            <h3>No certificates found</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', margin: '4px 0 0' }}>
              Completion certificates will appear here once earned.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px'
            }}
          >
            {certificates.map((cert) => {
              const ws = cert.workshopId || {};
              const isIssued = cert.certificateStatus === 'ISSUED';
              const isRevoked = cert.certificateStatus === 'REVOKED';

              return (
                <div
                  key={cert._id}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '18px',
                    opacity: isRevoked ? 0.75 : 1
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                        {cert.certificateNumber}
                      </span>
                      <span className={`badge ${isIssued ? 'published' : 'closed'}`} style={{ fontSize: '0.72rem' }}>
                        {cert.certificateStatus}
                      </span>
                    </div>

                    <h4 style={{ margin: '0 0 6px', color: '#102e5f', fontSize: '1rem' }}>
                      {ws.title || 'Technical Workshop'}
                    </h4>

                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '8px' }}>
                      Issued: {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}
                    </div>

                    {isRevoked && cert.revocationReason && (
                      <div style={{ fontSize: '0.78rem', color: '#dc2626', background: '#fef2f2', padding: '6px 8px', borderRadius: '4px', marginBottom: '10px' }}>
                        Revocation note: {cert.revocationReason}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => setViewingCertificate(cert)}
                    >
                      View & Print
                    </button>

                    <button
                      type="button"
                      className="primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      disabled={isRevoked || downloadingId === cert._id}
                      onClick={() => handleDownload(cert)}
                    >
                      {downloadingId === cert._id ? 'Downloading…' : 'Download PDF'}
                    </button>

                    {cert.verificationCode && (
                      <a
                        href={`#/verify-certificate/${cert.verificationCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ghost"
                        style={{ padding: '6px 10px', fontSize: '0.78rem', textDecoration: 'none' }}
                      >
                        Verify
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <PrintableCertificateModal
          isOpen={Boolean(viewingCertificate)}
          certificate={viewingCertificate}
          onClose={() => setViewingCertificate(null)}
          onDownload={handleDownload}
        />
      </section>
    </PortalLayout>
  );
}
