import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = 'User ID or email is required.';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setGeneralError('');
    setLoading(true);
    try {
      await login(trimmedEmail, password, remember);
      window.location.hash = '#/dashboard';
    } catch (err) {
      const msg = err.message || 'The request could not be completed.';
      if (err.code === 'INVALID_CREDENTIALS') {
        setGeneralError('Invalid email, user ID, or password.');
      } else if (err.code === 'ACCOUNT_LOCKED') {
        setGeneralError('Account is temporarily locked. Please try again later.');
      } else if (err.code === 'ACCOUNT_UNAVAILABLE') {
        setGeneralError('Account is currently inactive or unavailable.');
      } else if (msg.toLowerCase().includes('password') && !msg.toLowerCase().includes('email') && !msg.toLowerCase().includes('user')) {
        setFieldErrors((prev) => ({ ...prev, password: msg }));
      } else if ((msg.toLowerCase().includes('user') || msg.toLowerCase().includes('email')) && !msg.toLowerCase().includes('password')) {
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      } else {
        setGeneralError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <p className="eyebrow">Secure sign in</p>
      <h2>Welcome back</h2>
      <p className="subcopy">Use your university or organization account to continue.</p>

      <form
        id="login-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        onSubmit={handleSubmit}
      >
        <div className="field">
          <label htmlFor="email">User ID or email *</label>
          <input
            id="email"
            type="text"
            autoComplete="email"
            placeholder="you@university.edu or username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
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

        <div className="field password-field">
          <label htmlFor="password">Password *</label>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
            }}
            disabled={loading}
            style={fieldErrors.password ? { borderColor: 'var(--red, #e53e3e)' } : {}}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          <button
            className="password-toggle"
            type="button"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
          {fieldErrors.password && (
            <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
              {fieldErrors.password}
            </span>
          )}
        </div>

        <div className="row-between">
          <label className="remember">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
            />
            Remember me
          </label>
          <a className="text-link" href="#/forgot-password">
            Forgot password?
          </a>
        </div>

        {generalError && (
          <p id="form-notice" className="notice error">
            {generalError}
          </p>
        )}

        <button className="primary full" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="help-text">
        Your navigation and permissions are loaded dynamically from MongoDB upon sign-in.
      </p>
    </AuthLayout>
  );
}
