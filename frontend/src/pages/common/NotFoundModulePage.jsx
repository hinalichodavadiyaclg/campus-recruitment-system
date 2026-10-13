import React from 'react';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';

export function NotFoundModulePage({ title = 'Not found', path = '', icon = null }) {
  return (
    <PortalLayout
      title={title}
      currentPath={path}
      hideEyebrow={true}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '440px',
          padding: '24px 16px'
        }}
      >
        <div
          style={{
            maxWidth: '460px',
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '44px 32px',
            textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#f1f5f9',
              color: '#64748b',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}
          >
            {icon || (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            )}
          </div>

          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 10px 0',
              letterSpacing: '-0.02em'
            }}
          >
            Not found
          </h2>

          <p
            style={{
              fontSize: '0.92rem',
              color: '#64748b',
              lineHeight: 1.6,
              margin: '0 0 24px 0'
            }}
          >
            No data found for {title}. There are currently no records available in the system.
          </p>

          <a
            href="#/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 22px',
              borderRadius: '8px',
              background: '#1d68ff',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background-color 0.15s ease'
            }}
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </PortalLayout>
  );
}
