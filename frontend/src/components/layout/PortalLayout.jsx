import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ConfirmModal } from '../common/ConfirmModal.jsx';

export function VvwuLogo({ size = 42 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <circle cx="24" cy="24" r="23" fill="#ffffff" stroke="#d5e2f0" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="19.5" fill="#0d2c5e" />
      {/* Book base */}
      <path
        d="M13.5 31.5C16.8 30 20.5 29.5 24 31C27.5 29.5 31.2 30 34.5 31.5C32.5 33.5 28.5 34.8 24 34.8C19.5 34.8 15.5 33.5 13.5 31.5Z"
        fill="#ffffff"
      />
      <path
        d="M15 30C18 28.8 21 28.4 24 29.6C27 28.4 30 28.8 33 30C31.5 31.2 28 32.2 24 32.2C20 32.2 16.5 31.2 15 30Z"
        fill="#1d68ff"
      />
      {/* Torch base */}
      <path d="M22 25.5H26V28H22Z" fill="#ffb74d" />
      {/* Flame - red */}
      <path
        d="M24 11.5C24 11.5 28.5 16.5 28.5 20.5C28.5 23.2 26.5 25.5 24 25.5C21.5 25.5 19.5 23.2 19.5 20.5C19.5 16.5 24 11.5 24 11.5Z"
        fill="#e53935"
      />
      {/* Flame - inner bright yellow */}
      <path
        d="M24 15C24 15 26.8 18.2 26.8 20.8C26.8 22.3 25.5 23.8 24 23.8C22.5 23.8 21.2 22.3 21.2 20.8C21.2 18.2 24 15 24 15Z"
        fill="#ffeb3b"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" />
      <line x1="8" y1="6" x2="8.01" y2="6" strokeWidth="2.5" />
      <line x1="12" y1="6" x2="12.01" y2="6" strokeWidth="2.5" />
      <line x1="16" y1="6" x2="16.01" y2="6" strokeWidth="2.5" />
      <line x1="8" y1="10" x2="8.01" y2="10" strokeWidth="2.5" />
      <line x1="12" y1="10" x2="12.01" y2="10" strokeWidth="2.5" />
      <line x1="16" y1="10" x2="16.01" y2="10" strokeWidth="2.5" />
      <line x1="8" y1="14" x2="8.01" y2="14" strokeWidth="2.5" />
      <line x1="12" y1="14" x2="12.01" y2="14" strokeWidth="2.5" />
      <line x1="16" y1="14" x2="16.01" y2="14" strokeWidth="2.5" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function GraduationCapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  );
}

function WorkshopsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L20 3" />
      <path d="M16 4.5l2.5 2.5" />
      <path d="M18.5 2l2.5 2.5" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function PortalLayout({
  title,
  subtitle,
  actions,
  currentPath = '',
  children,
  category,
  section,
  hideEyebrow = false
}) {
  const { user, role, logout } = useAuth();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const getInitials = (email = '') =>
    email
      .split('@')[0]
      .split(/[._-]/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const getDisplayName = (u) =>
    u?.email?.split('@')[0].replace(/[._-]/g, ' ') || 'Portal User';

  const isNavActive = (route) => {
    if (!currentPath) return false;
    if (route === '/dashboard') return currentPath === '/dashboard';
    if (route === '/profile') return currentPath === '/profile' || currentPath === '/change-password';
    return currentPath === route || currentPath.startsWith(route + '/');
  };

  return (
    <div className="portal">
      <aside className="sidebar">
        <a className="brand" href="#/dashboard">
          <VvwuLogo size={42} />
          <div className="brand-title-box">
            <span className="brand-name">VVWU</span>
            <span className="brand-sub">Campus Recruitment Portal</span>
          </div>
        </a>

        <nav>
          {/* Top ungrouped items */}
          <a
            className={'nav-link ' + (isNavActive('/dashboard') ? 'active' : '')}
            href="#/dashboard"
          >
            <span className="nav-icon"><HomeIcon /></span>
            Dashboard
          </a>
          <a
            className={'nav-link ' + (isNavActive('/profile') ? 'active' : '')}
            href="#/profile"
          >
            <span className="nav-icon"><UserIcon /></span>
            My Account
          </a>

          {/* USERS */}
          <span className="nav-label">USERS</span>
          <a
            className={'nav-link ' + (isNavActive('/users') ? 'active' : '')}
            href="#/users"
          >
            <span className="nav-icon"><UsersIcon /></span>
            Users
          </a>

          {/* MASTER DATA */}
          <span className="nav-label">MASTER DATA</span>
          <a
            className={'nav-link ' + (isNavActive('/departments') ? 'active' : '')}
            href="#/departments"
          >
            <span className="nav-icon"><BuildingIcon /></span>
            Departments
          </a>
          <a
            className={'nav-link ' + (isNavActive('/courses') ? 'active' : '')}
            href="#/courses"
          >
            <span className="nav-icon"><BookIcon /></span>
            Courses
          </a>

          {/* RECRUITMENT */}
          <span className="nav-label">RECRUITMENT</span>
          <a
            className={'nav-link ' + (isNavActive('/job-postings') ? 'active' : '')}
            href="#/job-postings"
          >
            <span className="nav-icon"><BriefcaseIcon /></span>
            Job Postings
          </a>
          <a
            className={'nav-link ' + (isNavActive('/applications') ? 'active' : '')}
            href="#/applications"
          >
            <span className="nav-icon"><DocumentIcon /></span>
            Applications
          </a>
          <a
            className={'nav-link ' + (isNavActive('/interviews') ? 'active' : '')}
            href="#/interviews"
          >
            <span className="nav-icon"><CalendarIcon /></span>
            Interviews
          </a>
          <a
            className={'nav-link ' + (isNavActive('/placements') ? 'active' : '')}
            href="#/placements"
          >
            <span className="nav-icon"><GraduationCapIcon /></span>
            Placements
          </a>
          <a
            className={'nav-link ' + (isNavActive('/training-workshops') ? 'active' : '')}
            href="#/training-workshops"
          >
            <span className="nav-icon"><WorkshopsIcon /></span>
            Training & Workshops
          </a>

          {/* ACCESS MANAGEMENT */}
          <span className="nav-label">ACCESS MANAGEMENT</span>
          <a
            className={'nav-link ' + (isNavActive('/roles') ? 'active' : '')}
            href="#/roles"
          >
            <span className="nav-icon"><ShieldIcon /></span>
            Roles
          </a>
          <a
            className={'nav-link ' + (isNavActive('/permissions') ? 'active' : '')}
            href="#/permissions"
          >
            <span className="nav-icon"><KeyIcon /></span>
            Permissions
          </a>

          {/* DATA IMPORT */}
          <span className="nav-label">DATA IMPORT</span>
          <a
            className={'nav-link ' + (isNavActive('/import') ? 'active' : '')}
            href="#/import"
          >
            <span className="nav-icon"><ImportIcon /></span>
            Import Data
          </a>

          {/* REPORTS */}
          <span className="nav-label">REPORTS</span>
          <a
            className={'nav-link ' + (isNavActive('/reports') ? 'active' : '')}
            href="#/reports"
          >
            <span className="nav-icon"><ChartIcon /></span>
            Reports & Analytics
          </a>

          {/* DIVIDER */}
          <div className="sidebar-divider" />

          {/* SYSTEM */}
          <span className="nav-label">SYSTEM</span>
          <a
            className={'nav-link ' + (isNavActive('/settings') ? 'active' : '')}
            href="#/settings"
          >
            <span className="nav-icon"><SettingsIcon /></span>
            Settings
          </a>
        </nav>

        <div className="sidebar-footer">
          <strong>{getDisplayName(user)}</strong>
          <span>{role?.name || ''}</span>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Campus Recruit <span> / </span>
            {section && (
              <>
                <span>{section}</span> <span> / </span>
              </>
            )}
            <b>{title}</b>
          </div>
          <div className="topbar-actions">
            <a className="user-pill" href="#/profile">
              <span className="avatar">{getInitials(user?.email)}</span>
              <span>{user?.email}</span>
            </a>
            <button
              className="ghost"
              type="button"
              onClick={() => setLogoutModalOpen(true)}
            >
              Log out
            </button>
          </div>
        </header>

        <main className="page">
          <header className="page-header">
            <div>
              {!hideEyebrow && (category || role?.name) ? (
                <p className="eyebrow">{category || role?.name}</p>
              ) : null}
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions}
          </header>
          {children}
        </main>
      </section>

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
    </div>
  );
}
