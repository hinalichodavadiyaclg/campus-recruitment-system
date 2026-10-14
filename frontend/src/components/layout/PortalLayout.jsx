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

import {
  HomeIcon,
  UserIcon,
  UsersIcon,
  BuildingIcon,
  BookIcon,
  BriefcaseIcon,
  DocumentIcon,
  CalendarIcon,
  GraduationCapIcon,
  WorkshopsIcon,
  ShieldIcon,
  KeyIcon,
  ChartIcon,
  ImportIcon,
  SettingsIcon,
  LogOutIcon
} from '../common/Icons.jsx';

export {
  HomeIcon,
  UserIcon,
  UsersIcon,
  BuildingIcon,
  BookIcon,
  BriefcaseIcon,
  DocumentIcon,
  CalendarIcon,
  GraduationCapIcon,
  WorkshopsIcon,
  ShieldIcon,
  KeyIcon,
  ChartIcon,
  ImportIcon,
  SettingsIcon,
  LogOutIcon
};

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
              <LogOutIcon size={15} /> Log out
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
