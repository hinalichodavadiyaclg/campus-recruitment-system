import React, { useState, useEffect } from 'react';
import { workshopService } from '../../services/workshop.service.js';
import { VvwuLogo } from '../../components/layout/PortalLayout.jsx';
import { ShieldIcon, CheckCircleIcon, XCircleIcon, SearchIcon } from '../../components/common/Icons.jsx';

export function PublicCertificateVerifyPage({ initialCode = '' }) {
  const [code, setCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const verifyCode = async (verificationCode) => {
    const trimmed = (verificationCode || '').trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter a valid certificate verification code.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const data = await workshopService.verifyCertificatePublic(trimmed);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Certificate verification failed or invalid code.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      verifyCode(initialCode);
    }
  }, [initialCode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    verifyCode(code);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid var(--line)', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="#/login" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <VvwuLogo size={40} />
          <div>
            <strong style={{ fontSize: '1.15rem', color: '#102e5f', display: 'block' }}>VVWU</strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Certificate Verification Portal</span>
          </div>
        </a>

        <a href="#/login" className="ghost" style={{ fontSize: '0.82rem', padding: '6px 14px', textDecoration: 'none' }}>
          Sign In to Portal →
        </a>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '640px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#e7f5f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)', marginBottom: '12px' }}>
              <ShieldIcon size={30} />
            </div>
            <h1 style={{ fontSize: '1.8rem', color: '#102e5f', margin: '0 0 8px' }}>
              Verify Workshop Credential
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '0.92rem', margin: 0 }}>
              Verify official completion certificates issued by Vanita Vishram Women's University Training & Placement Cell.
            </p>
          </div>

          {/* Verification Search Bar */}
          <form onSubmit={handleSubmit} className="card" style={{ padding: '12px', display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <input
              type="text"
              placeholder="Enter 32-character digital verification code (e.g. A1B2C3D4...)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.92rem', padding: '8px 12px' }}
            />
            <button className="primary" type="submit" disabled={loading} style={{ padding: '10px 20px' }}>
              {loading ? 'Verifying…' : 'Verify Certificate'}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="notice error" style={{ padding: '16px', borderRadius: '10px', textAlign: 'center' }}>
              <strong style={{ display: 'block', marginBottom: '4px' }}>Verification Unsuccessful</strong>
              {error}
            </div>
          )}

          {/* Verification Result Card */}
          {result && (
            <div className="card" style={{ border: result.isValid ? '2px solid #16734b' : '2px solid #b3262c', borderRadius: '14px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: result.isValid ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: result.isValid ? '#15803d' : '#b91c1c' }}>
                  {result.isValid ? <CheckCircleIcon size={26} /> : <XCircleIcon size={26} />}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', color: result.isValid ? '#15803d' : '#b91c1c', margin: 0 }}>
                    {result.isValid ? 'Authentic & Valid Credential' : 'Credential Revoked / Inactive'}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                    Certificate #{result.certificateNumber}
                  </span>
                </div>
              </div>

              {result.status === 'REVOKED' && (
                <div className="notice error" style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
                  <strong>Official Revocation Reason:</strong> {result.revocationReason || 'Administrative revocation'}
                  {result.revokedAt && (
                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                      Revoked on: {new Date(result.revokedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </div>
                  )}
                </div>
              )}

              <div className="detail-grid" style={{ gridTemplateColumns: '1fr', gap: '10px' }}>
                <div className="definition-list">
                  <div>
                    <dt>Recipient Name:</dt>
                    <dd style={{ fontSize: '1rem', color: '#102e5f' }}>{result.studentName}</dd>
                  </div>
                  <div>
                    <dt>Program Title:</dt>
                    <dd>{result.workshop?.title || 'Workshop'}</dd>
                  </div>
                  <div>
                    <dt>Domain Category:</dt>
                    <dd>{result.workshop?.category || 'Technical'}</dd>
                  </div>
                  <div>
                    <dt>Delivery Mode:</dt>
                    <dd>{result.workshop?.mode || 'Offline'}</dd>
                  </div>
                  <div>
                    <dt>Date Issued:</dt>
                    <dd>{result.issuedAt ? new Date(result.issuedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' }) : 'N/A'}</dd>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '14px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Issued by Vanita Vishram Women's University Central Placement Cell.
                Candidate identity verified via institutional academic record.
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid var(--line)', padding: '16px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)' }}>
        © {new Date().getFullYear()} Vanita Vishram Women's University. All rights reserved.
      </footer>
    </div>
  );
}
