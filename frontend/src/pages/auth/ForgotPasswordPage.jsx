import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { authService } from '../../services/auth.service.js';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';

export function ForgotPasswordPage() {
  const { setResetState } = useAuth();
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldErrors({ email: 'Email or User ID is required.' });
      return;
    }

    setFieldErrors({});
    setGeneralError('');
    setLoading(true);
    try {
      const data = await authService.forgotPassword(trimmed);
      setResetState({
        email: trimmed,
        token: data.resetToken || null
      });
      window.location.hash = '#/verify-reset';
    } catch (err) {
      const msg = err.message || 'The request could not be completed.';
      if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('user')) {
        setFieldErrors({ email: msg });
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
      <h2>Forgot your password?</h2>
      <p className="subcopy">Enter your account email. We will prepare a verification step.</p>

      <form
        id="forgot-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="forgot-email">Email or User ID *</label>
          <input
            id="forgot-email"
            type="text"
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors({});
            }}
            disabled={loading}
            style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email && (
            <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
              {fieldErrors.email}
            </span>
          )}
        </div>

        {generalError && (
          <p id="forgot-notice" className="notice error">
            {generalError}
          </p>
        )}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send verification code'}
        </button>

        <a className="text-link center" href="#/login">
          ← Back to sign in
        </a>
      </form>
    </AuthLayout>
  );
}
