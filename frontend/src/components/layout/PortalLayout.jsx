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
  LogOutIcon,
  SearchIcon,
  BellIcon,
  MenuIcon,
  ChevronDownIcon
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

import { NAVIGATION_GROUPS, getVisibleNavGroups } from './navigationConfig.js';

const NAV_ICONS = {
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
  ImportIcon,
  ChartIcon,
  SettingsIcon
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
  const { user, role, loading, has, logout } = useAuth();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, has, { loading });

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
          {visibleGroups.map((group, groupIndex) => {
            return (
              <React.Fragment key={group.id || group.label || groupIndex}>
                {group.divider && <div className="sidebar-divider" />}
                {group.label && <span className="nav-label">{group.label}</span>}
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.icon];
                  return (
                    <React.Fragment key={item.path || item.id}>
                      <a
                        className={'nav-link ' + (isNavActive(item.path) ? 'active' : '')}
                        href={'#' + item.path}
                      >
                        <span className="nav-icon">{Icon ? <Icon /> : null}</span>
                        {item.label}
                      </a>
                      {Array.isArray(item.children) && item.children.length > 0 && (
                        <div className="nav-submenu">
                          {item.children.map((child) => {
                            const ChildIcon = NAV_ICONS[child.icon];
                            return (
                              <a
                                key={child.path || child.id}
                                className={
                                  'nav-link nav-sub-link ' +
                                  (isNavActive(child.path) ? 'active' : '')
                                }
                                href={'#' + child.path}
                                style={{ paddingLeft: '32px' }}
                              >
                                <span className="nav-icon">
                                  {ChildIcon ? <ChildIcon /> : null}
                                </span>
                                {child.label}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <strong>{getDisplayName(user)}</strong>
          <span>{role?.name || ''}</span>
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-menu-toggle"
              type="button"
              aria-label="Toggle navigation"
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              <MenuIcon size={20} color="#334155" />
            </button>
            <div className="topbar-search">
              <SearchIcon size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search..."
                className="topbar-search-input"
              />
            </div>
          </div>

          <div className="topbar-actions">
            <button
              className="topbar-icon-btn"
              type="button"
              aria-label="Notifications"
              title="Notifications"
            >
              <BellIcon size={19} color="#475569" />
              <span className="topbar-badge">3</span>
            </button>

            <div className="topbar-user-dropdown" style={{ position: 'relative' }}>
              <button
                className="topbar-user-btn"
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <span className="avatar-circle">{getInitials(user?.email)}</span>
                <span className="user-email-text">{user?.email}</span>
                <ChevronDownIcon size={14} color="#64748b" />
              </button>
              {userMenuOpen && (
                <div className="topbar-dropdown-menu">
                  <a
                    className="topbar-dropdown-item"
                    href="#/profile"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <UserIcon size={16} /> My Account
                  </a>
                  <button
                    className="topbar-dropdown-item danger"
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      setLogoutModalOpen(true);
                    }}
                  >
                    <LogOutIcon size={16} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page">
          <div className="page-breadcrumb">
            Campus Recruit <span> / </span>
            {section && (
              <>
                <span>{section}</span> <span> / </span>
              </>
            )}
            <b>{title}</b>
          </div>

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
