import React from 'react';
import { AuthLayout } from '../../components/layout/AuthLayout.jsx';
import { CheckIcon } from '../../components/common/Icons.jsx';

export function ResetSuccessPage() {
  return (
    <AuthLayout>
      <div className="center">
        <div className="success-icon">
          <CheckIcon size={32} strokeWidth={2.5} />
        </div>
        <p className="eyebrow">Password updated</p>
        <h2>Password successfully changed</h2>
        <p className="subcopy">
          Your active sessions have been signed out. Use your new password to sign in.
        </p>
        <a className="primary full" href="#/login">
          Continue to sign in
        </a>
      </div>
    </AuthLayout>
  );
}
