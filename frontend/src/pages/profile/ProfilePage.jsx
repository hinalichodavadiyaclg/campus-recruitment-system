import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';

export function ProfilePage() {
  const { user, role, logout } = useAuth();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const getInitials = (email = '') =>
    email
      .split('@')[0]
      .split(/[._-]/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'A';

  const getDisplayName = (u) =>
    u?.name || u?.email?.split('@')[0].replace(/[._-]/g, ' ') || 'admin';

  const formatDate = (value) => {
    const d = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(d);
  };

  const userId =
    user?.universityId ||
    user?.employeeId ||
    user?.companyBusinessId ||
    user?.userId ||
    'ADMIN-001';

  const roleName = role?.name || 'Super Admin';
  const userType = user?.userType || 'PLACEMENT';
  const isActive = (user?.accountStatus || 'ACTIVE').toUpperCase() === 'ACTIVE';

  return (
    <PortalLayout
      title="My Account"
      subtitle="View your account details and manage your security credentials."
      currentPath="/profile"
      hideEyebrow={true}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(320px, 0.95fr)',
          gap: '24px',
          alignItems: 'start'
        }}
      >
        {/* Left Card: Account Details */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
          {/* Card Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.05rem'
                }}
              >
                👤
              </div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                Account Details
              </h3>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '99px',
                fontSize: '0.78rem',
                fontWeight: 600,
                background: isActive ? '#ecfdf5' : '#fef2f2',
                color: isActive ? '#059669' : '#dc2626'
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isActive ? '#10b981' : '#ef4444'
                }}
              />
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* User Identity Head */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px 0 22px',
              borderBottom: '1px solid #f1f5f9',
              marginBottom: '8px'
            }}
          >
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: '#0e7490',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                fontWeight: 700,
                flexShrink: 0
              }}
            >
              {getInitials(user?.email)}
            </div>
            <div>
              <h2
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#0f172a'
                }}
              >
                {getDisplayName(user)}
              </h2>
              <div
                style={{
                  fontSize: '0.86rem',
                  color: '#64748b',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>{roleName}</span>
                <span style={{ fontSize: '0.7rem' }}>•</span>
                <span>{userType}</span>
              </div>
            </div>
          </div>

          {/* Key-Value Rows List */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Row 1: User ID */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 0',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}
                >
                  🪪
                </div>
                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                  User ID
                </span>
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>
                {userId}
              </strong>
            </div>

            {/* Row 2: Email */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 0',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}
                >
                  ✉️
                </div>
                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                  Email
                </span>
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>
                {user?.email || 'admin@example.edu'}
              </strong>
            </div>

            {/* Row 3: User type */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 0',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}
                >
                  🛡️
                </div>
                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                  User type
                </span>
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>
                {userType}
              </strong>
            </div>

            {/* Row 4: Assigned role */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 0',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}
                >
                  👥
                </div>
                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                  Assigned role
                </span>
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>
                {roleName}
              </strong>
            </div>

            {/* Row 5: Account status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 0',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}
                >
                  ⬇️
                </div>
                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                  Account status
                </span>
              </div>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: '99px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  background: isActive ? '#ecfdf5' : '#fef2f2',
                  color: isActive ? '#059669' : '#dc2626'
                }}
              >
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Row 6: Last login */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    flexShrink: 0
                  }}
                >
                  🕒
                </div>
                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 500 }}>
                  Last login
                </span>
              </div>
              <strong style={{ fontSize: '0.9rem', color: '#0f172a', fontWeight: 600 }}>
                {formatDate(user?.lastLoginAt)}
              </strong>
            </div>
          </div>
        </div>

        {/* Right Card: Security */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.05rem'
              }}
            >
              🔒
            </div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
              Security
            </h3>
          </div>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.84rem', color: '#64748b' }}>
            Keep your account secure with a strong password.
          </p>

          {/* Centered Inner Container with Shield */}
          <div
            style={{
              background: '#f8fbff',
              border: '1px solid #f1f5f9',
              borderRadius: '14px',
              padding: '36px 20px',
              textAlign: 'center'
            }}
          >
            {/* Shield Icon Box */}
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                background: '#dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
                boxShadow: '0 2px 8px rgba(37,99,235,0.1)'
              }}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <h4
              style={{
                margin: '0 0 6px 0',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#0f172a'
              }}
            >
              Change your password
            </h4>
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: '0.85rem',
                color: '#64748b',
                lineHeight: 1.45
              }}
            >
              Use a strong password to keep your account safe.
            </p>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <a
                href="#/change-password"
                id="btn-change-password"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '11px 18px',
                  background: '#2563eb',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  textDecoration: 'none',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.22)',
                  transition: 'background 0.15s ease'
                }}
              >
                <span>🔑</span>
                <span>Change Password</span>
              </a>

              <button
                type="button"
                id="btn-profile-logout"
                onClick={() => setLogoutModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '11px 18px',
                  background: '#ffffff',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'background 0.15s ease'
                }}
              >
                <span>🚪</span>
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        title="Log out?"
        message="Your active session will be closed on this device."
        confirmLabel="Log out"
        danger={true}
        onConfirm={async () => {
          setLogoutModalOpen(false);
          await logout();
        }}
      />
    </PortalLayout>
  );
}
