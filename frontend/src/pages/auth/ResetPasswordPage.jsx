import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { authService } from '../../services/auth.service.js';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';

export function ResetPasswordPage() {
  const { resetState, setResetState } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

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

    if (!resetState.token) {
      setGeneralError('No reset token available. Please restart the forgot password process.');
      return;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setGeneralError('');
    setLoading(true);
    try {
      await authService.resetPassword(resetState.token, newPassword);
      setResetState({ email: '', token: null });
      window.location.hash = '#/reset-success';
    } catch (err) {
      const msg = err.message || 'The request could not be completed.';
      if (msg.toLowerCase().includes('password')) {
        setFieldErrors({ newPassword: msg });
      } else {
        setGeneralError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <p className="eyebrow">Password recovery</p>
      <h2>Set a new password</h2>
      <p className="subcopy">Choose a strong password you have not used before.</p>

      <form
        id="reset-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        onSubmit={handleSubmit}
      >
        <div className="field password-field">
          <label htmlFor="reset-new">New password *</label>
          <input
            id="reset-new"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Enter new password"
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
          <label htmlFor="reset-confirm">Confirm new password *</label>
          <input
            id="reset-confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Confirm new password"
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
          <li>Uppercase, lowercase, number, and symbol</li>
        </ul>

        {generalError && (
          <p id="reset-notice" className="notice error">
            {generalError}
          </p>
        )}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
