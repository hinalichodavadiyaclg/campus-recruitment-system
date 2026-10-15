import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { authService } from '../../services/auth.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import {
  SettingsIcon,
  LockIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon
} from '../../components/common/Icons.jsx';
import './Settings.css';

export function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('change-password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});
  const [generalNotice, setGeneralNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCancel = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setGeneralNotice(null);
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required.';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required.';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters long.';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirm password is required.';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setGeneralNotice(null);
    setLoading(true);

    try {
      await authService.changePassword({
        currentPassword,
        newPassword
      });

      toast('Password updated successfully!');
      setGeneralNotice({
        type: 'success',
        text: 'Your password has been changed successfully.'
      });
      handleCancel();
    } catch (err) {
      const msg = err.message || 'Failed to update password.';
      if (msg.toLowerCase().includes('current password')) {
        setFieldErrors((prev) => ({ ...prev, currentPassword: msg }));
      } else if (msg.toLowerCase().includes('new password') || msg.toLowerCase().includes('least 12') || msg.toLowerCase().includes('weak')) {
        setFieldErrors((prev) => ({ ...prev, newPassword: msg }));
      } else {
        setGeneralNotice({ type: 'error', text: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalLayout currentPath="/settings" hideEyebrow={true}>
      <div className="settings-page-container">
        {/* Breadcrumb Navigation */}
        <div className="settings-breadcrumb">
          <span>Settings</span>
          <span>/</span>
          <span className="current">Change Password</span>
        </div>

        {/* Page Heading */}
        <h1 className="settings-page-title">Settings</h1>

        {/* 2-Column Layout */}
        <div className="settings-layout-grid">
          {/* Left Navigation Card */}
          <aside className="settings-menu-card">
            <div className="settings-menu-header">
              <SettingsIcon size={20} color="#2563eb" />
              <span>Settings</span>
            </div>
            <div className="settings-nav-list">
              <button
                type="button"
                className={`settings-nav-item ${activeTab === 'change-password' ? 'active' : ''}`}
                onClick={() => setActiveTab('change-password')}
              >
                <div className="settings-nav-item-left">
                  <LockIcon size={18} color="#2563eb" />
                  <span>Change Password</span>
                </div>
                <ChevronRightIcon size={16} color="#2563eb" />
              </button>
            </div>
          </aside>

          {/* Right Main Content Card */}
          <main className="settings-content-card">
            {/* Header Banner */}
            <div className="settings-banner">
              <div className="settings-banner-left">
                <div className="settings-banner-icon-box">
                  <LockIcon size={22} color="#2563eb" />
                </div>
                <h2 className="settings-banner-title">Change Password</h2>
              </div>

              {/* Decorative Shield Artwork */}
              <div className="settings-banner-graphic" aria-hidden="true">
                <svg
                  width="130"
                  height="72"
                  viewBox="0 0 130 72"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="95" cy="36" r="34" fill="#93c5fd" fillOpacity="0.28" />
                  <circle cx="110" cy="20" r="18" fill="#dbeafe" fillOpacity="0.6" />
                  <path
                    d="M92 12C92 12 101 8.5 110 12C110 32 101 44 92 50C83 44 74 32 74 12C83 8.5 92 12 92 12Z"
                    fill="url(#settings-shield-gradient)"
                  />
                  <rect x="87" y="27" width="10" height="9" rx="1.5" fill="#ffffff" />
                  <path
                    d="M89 27V23.5C89 21.8431 90.3431 20.5 92 20.5C93.6569 20.5 95 21.8431 95 23.5V27"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient
                      id="settings-shield-gradient"
                      x1="74"
                      y1="9"
                      x2="110"
                      y2="50"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#3b82f6" />
                      <stop offset="1" stopColor="#1d4ed8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            {/* Change Password Form */}
            <form className="settings-password-form" onSubmit={handleSubmit} noValidate>
              {/* Current Password Field */}
              <div className="settings-form-group">
                <label className="settings-label" htmlFor="settings-current-pwd">
                  Current Password
                </label>
                <div className="settings-input-wrapper">
                  <div className="settings-input-icon">
                    <LockIcon size={18} color="#94a3b8" />
                  </div>
                  <input
                    id="settings-current-pwd"
                    type={showCurrent ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (fieldErrors.currentPassword) {
                        setFieldErrors((prev) => ({ ...prev, currentPassword: '' }));
                      }
                    }}
                    disabled={loading}
                    className={`settings-input ${fieldErrors.currentPassword ? 'has-error' : ''}`}
                  />
                  <button
                    type="button"
                    className="settings-toggle-eye"
                    onClick={() => setShowCurrent(!showCurrent)}
                    aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  >
                    {showCurrent ? (
                      <EyeOffIcon size={18} color="#64748b" />
                    ) : (
                      <EyeIcon size={18} color="#64748b" />
                    )}
                  </button>
                </div>
                {fieldErrors.currentPassword && (
                  <span className="settings-error-text">{fieldErrors.currentPassword}</span>
                )}
              </div>

              {/* New Password Field */}
              <div className="settings-form-group">
                <label className="settings-label" htmlFor="settings-new-pwd">
                  New Password
                </label>
                <div className="settings-input-wrapper">
                  <div className="settings-input-icon">
                    <LockIcon size={18} color="#94a3b8" />
                  </div>
                  <input
                    id="settings-new-pwd"
                    type={showNew ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (fieldErrors.newPassword) {
                        setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
                      }
                    }}
                    disabled={loading}
                    className={`settings-input ${fieldErrors.newPassword ? 'has-error' : ''}`}
                  />
                  <button
                    type="button"
                    className="settings-toggle-eye"
                    onClick={() => setShowNew(!showNew)}
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                  >
                    {showNew ? (
                      <EyeOffIcon size={18} color="#64748b" />
                    ) : (
                      <EyeIcon size={18} color="#64748b" />
                    )}
                  </button>
                </div>
                {fieldErrors.newPassword && (
                  <span className="settings-error-text">{fieldErrors.newPassword}</span>
                )}
              </div>

              {/* Confirm New Password Field */}
              <div className="settings-form-group">
                <label className="settings-label" htmlFor="settings-confirm-pwd">
                  Confirm New Password
                </label>
                <div className="settings-input-wrapper">
                  <div className="settings-input-icon">
                    <LockIcon size={18} color="#94a3b8" />
                  </div>
                  <input
                    id="settings-confirm-pwd"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirmPassword) {
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
                      }
                    }}
                    disabled={loading}
                    className={`settings-input ${fieldErrors.confirmPassword ? 'has-error' : ''}`}
                  />
                  <button
                    type="button"
                    className="settings-toggle-eye"
                    onClick={() => setShowConfirm(!showConfirm)}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirm ? (
                      <EyeOffIcon size={18} color="#64748b" />
                    ) : (
                      <EyeIcon size={18} color="#64748b" />
                    )}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <span className="settings-error-text">{fieldErrors.confirmPassword}</span>
                )}
              </div>

              {/* General Feedback Notice */}
              {generalNotice && (
                <div className={`settings-notice ${generalNotice.type}`}>
                  {generalNotice.text}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="settings-form-actions">
                <button
                  type="button"
                  className="settings-btn-cancel"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="settings-btn-update"
                  disabled={loading}
                >
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </main>
        </div>
      </div>
    </PortalLayout>
  );
}
