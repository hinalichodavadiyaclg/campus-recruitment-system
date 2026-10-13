import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { authService } from '../../services/auth.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';

export function ChangePasswordPage({ firstLogin = false }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalNotice, setGeneralNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!firstLogin && !currentPassword) {
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
      setGeneralNotice({ type: 'success', text: 'Password changed successfully!' });
      setTimeout(() => {
        window.location.hash = '#/dashboard';
      }, 900);
    } catch (err) {
      const msg = err.message || 'Failed to change password.';
      if (msg.toLowerCase().includes('current password')) {
        setFieldErrors((prev) => ({ ...prev, currentPassword: msg }));
      } else if (msg.toLowerCase().includes('new password')) {
        setFieldErrors((prev) => ({ ...prev, newPassword: msg }));
      } else {
        setGeneralNotice({ type: 'error', text: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalLayout
      title={firstLogin ? 'First Login Password Change' : 'Change Password'}
      subtitle="Set a strong, unique password for your account."
      currentPath="/change-password"
    >
      <section className="card" style={{ maxWidth: '540px' }}>
        <form
          id="change-password-form"
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          onSubmit={handleSubmit}
        >
          {/* Section: Password Security */}
          <div style={{ marginTop: '4px', marginBottom: '2px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔑 Security Credentials
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Enter current password and choose a secure new password
            </p>
          </div>

          {!firstLogin && (
            <div className="field password-field">
              <label htmlFor="change-current">Current or temporary password *</label>
              <input
                id="change-current"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (fieldErrors.currentPassword) setFieldErrors((prev) => ({ ...prev, currentPassword: '' }));
                }}
                disabled={loading}
                style={fieldErrors.currentPassword ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                aria-invalid={Boolean(fieldErrors.currentPassword)}
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
              >
                {showCurrent ? 'Hide' : 'Show'}
              </button>
              {fieldErrors.currentPassword && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.currentPassword}
                </span>
              )}
            </div>
          )}

          <div className="field password-field">
            <label htmlFor="change-new">New password *</label>
            <input
              id="change-new"
              type={showNew ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (fieldErrors.newPassword) setFieldErrors((prev) => ({ ...prev, newPassword: '' }));
              }}
              disabled={loading}
              style={fieldErrors.newPassword ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(fieldErrors.newPassword)}
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowNew(!showNew)}
            >
              {showNew ? 'Hide' : 'Show'}
            </button>
            {fieldErrors.newPassword && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.newPassword}
              </span>
            )}
          </div>

          <div className="field password-field">
            <label htmlFor="change-confirm">Confirm new password *</label>
            <input
              id="change-confirm"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: '' }));
              }}
              disabled={loading}
              style={fieldErrors.confirmPassword ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
            >
              {showConfirm ? 'Hide' : 'Show'}
            </button>
            {fieldErrors.confirmPassword && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>

          <ul className="requirements" style={{ margin: '4px 0', paddingLeft: '20px', fontSize: '0.82rem', color: 'var(--muted, #64748b)' }}>
            <li>At least 8 characters</li>
            <li>Recommended: combination of uppercase, lowercase, numbers, and symbols</li>
          </ul>

          {generalNotice && (
            <p id="change-notice" className={`notice ${generalNotice.type}`}>
              {generalNotice.text}
            </p>
          )}

          <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Changing…' : 'Change password'}
            </button>
            <a className="ghost" href="#/profile">
              Cancel
            </a>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
