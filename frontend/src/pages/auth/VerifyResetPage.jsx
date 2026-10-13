import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { authService } from '../../services/auth.service.js';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';

export function VerifyResetPage() {
  const { resetState, setResetState } = useAuth();
  const { toast } = useToast();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [remaining, setRemaining] = useState(300);
  const [error, setError] = useState('');
  const inputsRef = useRef([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleDigitChange = (index, value) => {
    const clean = value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[index] = clean.slice(-1);
    setDigits(newDigits);

    if (clean && index < 5 && inputsRef.current[index + 1]) {
      inputsRef.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0 && inputsRef.current[index - 1]) {
      inputsRef.current[index - 1].focus();
    }
  };

  const handleResend = async () => {
    try {
      const data = await authService.forgotPassword(resetState.email);
      setResetState((prev) => ({
        ...prev,
        token: data.resetToken || prev.token
      }));
      setRemaining(300);
      toast('Verification instructions refreshed.');
    } catch (err) {
      toast(err.message);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Enter all six digits.');
      return;
    }
    window.location.hash = '#/reset-password';
  };

  return (
    <AuthLayout>
      <p className="eyebrow">Password recovery</p>
      <h2>Verify your identity</h2>
      <p className="subcopy">
        Enter the verification step for <b>{resetState.email || 'your email'}</b>.
      </p>

      <form
        id="verify-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        onSubmit={handleSubmit}
      >
        <div className="otp-row">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputsRef.current[index] = el)}
              data-otp={index}
              inputMode="numeric"
              maxLength={1}
              aria-label={`Verification digit ${index + 1}`}
              value={digit}
              onChange={(e) => {
                handleDigitChange(index, e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => handleKeyDown(index, e)}
              style={error ? { borderColor: 'var(--red, #e53e3e)' } : {}}
            />
          ))}
        </div>

        {error && (
          <span className="field-error center" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.85rem', textAlign: 'center', display: 'block' }}>
            {error}
          </span>
        )}

        <p className="center" style={{ margin: 0 }}>
          <span id="timer">{formatTimer(remaining)}</span> remaining
        </p>

        <button className="primary" type="submit">
          Verify and continue
        </button>

        <button
          id="resend-code"
          className="secondary"
          type="button"
          onClick={handleResend}
        >
          Resend code
        </button>

        <a className="text-link center" href="#/forgot-password">
          Use another email
        </a>
      </form>
    </AuthLayout>
  );
}
