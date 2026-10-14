import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { UserIcon, KeyIcon } from '../common/Icons.jsx';
import { userService } from '../../services/user.service.js';
import { roleService } from '../../services/role.service.js';

export function EditUserModal({ isOpen, onClose, user, onSuccess }) {
  const isPlacement = user?.userType === 'PLACEMENT' || user?.roleId?.includes('PLACEMENT');

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setEmail(user.email || '');
      setRoleId(user.roleId || '');
      setStatus(user.accountStatus || 'ACTIVE');
      setPassword('');
      setFieldErrors({});
      setServerError('');
      roleService
        .listRoles()
        .then((data) => setRoles(data))
        .catch(() => {});
    }
  }, [isOpen, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setServerError('');
    const errors = {};

    const emailVal = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal) errors.email = 'Email Address is required.';
    else if (!emailRegex.test(emailVal)) errors.email = 'Please enter a valid email address.';
    else if (emailVal.length > 254) errors.email = 'Email address cannot exceed 254 characters.';

    if (!isPlacement && password && password.length < 12) {
      errors.password = 'Password must be at least 12 characters.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    const body = {
      email: emailVal.toLowerCase(),
      roleId,
      accountStatus: status
    };
    if (!isPlacement && password) {
      body.password = password;
    }

    try {
      await userService.updateUser(user._id, body);
      onClose();
      onSuccess();
    } catch (err) {
      const msg = err.message || 'Failed to update user.';
      setServerError(msg);
      if (msg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit User Details" maxWidth="760px">
      <form
        id="edit-user-modal-form"
        autoComplete="off"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginTop: '16px'
        }}
        onSubmit={handleSubmit}
        noValidate
      >
        {serverError && (
          <div id="eu-notice" className="notice error" role="alert" style={{ marginBottom: '4px' }}>
            {serverError}
          </div>
        )}

        {/* SECTION 1: Account Credentials & Role */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--navy, #173b76)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <UserIcon size={16} color="var(--primary, #0284c7)" /> Account Credentials & Role
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Portal login email, access role, and account status
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label htmlFor="eu-email">
                Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="eu-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  if (serverError) setServerError('');
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={254}
                autoComplete="off"
              />
              {fieldErrors.email && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.email}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="eu-role">Authorization Role</label>
              <select
                id="eu-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="eu-status">Account Status</label>
              <select
                id="eu-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="LOCKED">LOCKED</option>
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 2: Security & Password Override (Hidden for Placement accounts) */}
        {!isPlacement && (
          <section className="form-section-card">
            <div style={{ marginBottom: '12px' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '0.95rem',
                  fontWeight: '700',
                  color: 'var(--navy, #173b76)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <KeyIcon size={16} color="var(--primary, #0284c7)" /> Security & Password Override
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                Optional password reset for this user account
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              <div className="field">
                <label htmlFor="eu-password">
                  Reset Password (leave blank to keep current)
                </label>
                <input
                  id="eu-password"
                  type="password"
                  placeholder="New strong password (min 12 chars)"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  style={fieldErrors.password ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  autoComplete="new-password"
                />
                {fieldErrors.password && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.password}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '12px'
          }}
        >
          <button className="ghost" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
