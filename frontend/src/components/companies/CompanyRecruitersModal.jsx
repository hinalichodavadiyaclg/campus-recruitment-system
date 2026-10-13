import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Badge } from '../common/Badge.jsx';
import { ConfirmModal } from '../common/ConfirmModal.jsx';
import { companyService } from '../../services/company.service.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CompanyRecruitersModal({ isOpen, company, onClose, onUpdated }) {
  const { has } = useAuth();
  const { toast } = useToast();

  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Recruiter Mode
  const [showAddForm, setShowAddForm] = useState(false);
  const [addHrRecruiterName, setAddHrRecruiterName] = useState('');
  const [addDesignation, setAddDesignation] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addMobileNumber, setAddMobileNumber] = useState('');
  const [addErrors, setAddErrors] = useState({});
  const [addGeneralError, setAddGeneralError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit Recruiter State
  const [editingRecruiter, setEditingRecruiter] = useState(null);
  const [editHrRecruiterName, setEditHrRecruiterName] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editMobileNumber, setEditMobileNumber] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editIsPrimary, setEditIsPrimary] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  const [editGeneralError, setEditGeneralError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete State
  const [deletingRecruiter, setDeletingRecruiter] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // One-time temporary password notice
  const [tempPasswordNotice, setTempPasswordNotice] = useState(null);

  const loadRecruiters = useCallback(async () => {
    if (!company?._id) return;
    setLoading(true);
    setError('');
    try {
      const data = await companyService.listRecruiters(company._id);
      setRecruiters(data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load company recruiters.');
    } finally {
      setLoading(false);
    }
  }, [company?._id]);

  useEffect(() => {
    if (isOpen && company?._id) {
      loadRecruiters();
      setShowAddForm(false);
      setEditingRecruiter(null);
      setAddHrRecruiterName('');
      setAddDesignation('');
      setAddEmail('');
      setAddMobileNumber('');
      setAddErrors({});
      setAddGeneralError('');
      setEditHrRecruiterName('');
      setEditDesignation('');
      setEditEmail('');
      setEditMobileNumber('');
      setEditStatus('ACTIVE');
      setEditIsPrimary(false);
      setEditErrors({});
      setEditGeneralError('');
    }
  }, [isOpen, company?._id, loadRecruiters]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    // 1. HR / Recruiter Name (Required, 1-100)
    const hrTrim = addHrRecruiterName.trim();
    if (!hrTrim) {
      errors.hrRecruiterName = 'HR / Recruiter Name is required.';
    } else if (hrTrim.length > 100) {
      errors.hrRecruiterName = 'HR / Recruiter Name cannot exceed 100 characters.';
    }

    // 2. Designation / Role (Required, 1-100)
    const desigTrim = addDesignation.trim();
    if (!desigTrim) {
      errors.designation = 'Designation is required.';
    } else if (desigTrim.length > 100) {
      errors.designation = 'Designation cannot exceed 100 characters.';
    }

    // 3. Email Address (Required, valid email, max 254)
    const emailTrim = addEmail.trim();
    if (!emailTrim) {
      errors.email = 'Email Address is required.';
    } else if (!EMAIL_REGEX.test(emailTrim)) {
      errors.email = 'Please enter a valid email address (e.g. recruiter@company.com).';
    } else if (emailTrim.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    // 4. Mobile Number (Optional for other recruiter, validated only if provided)
    const mobileTrim = addMobileNumber.trim();
    if (mobileTrim) {
      if (mobileTrim.length > 50) {
        errors.mobileNumber = 'Mobile number cannot exceed 50 characters.';
      } else if (!isValidMobile(mobileTrim)) {
        errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;
      }
    }

    if (Object.keys(errors).length > 0) {
      setAddErrors(errors);
      return;
    }

    setAddErrors({});
    setAddGeneralError('');
    setAddLoading(true);
    try {
      const payload = {
        hrRecruiterName: hrTrim,
        designation: desigTrim,
        email: emailTrim.toLowerCase(),
        mobileNumber: mobileTrim,
        accountStatus: 'ACTIVE'
      };

      const created = await companyService.createRecruiter(company._id, payload);
      setAddHrRecruiterName('');
      setAddDesignation('');
      setAddEmail('');
      setAddMobileNumber('');
      setShowAddForm(false);

      if (created.temporaryPassword) {
        setTempPasswordNotice(created.temporaryPassword);
      } else {
        toast('Recruiter account created successfully.');
      }

      await loadRecruiters();
      onUpdated?.();
    } catch (err) {
      const msg = err.message || 'Failed to create recruiter account.';
      if (msg.toLowerCase().includes('email')) {
        setAddErrors((prev) => ({ ...prev, email: msg }));
      } else {
        setAddGeneralError(msg);
      }
    } finally {
      setAddLoading(false);
    }
  };

  const startEdit = (recruiter) => {
    setShowAddForm(false);
    setEditingRecruiter(recruiter);
    setEditHrRecruiterName(
      recruiter.hrRecruiterName ||
      recruiter.name ||
      (recruiter.isPrimary ? company?.hrRecruiterName : '') ||
      ''
    );
    setEditDesignation(
      recruiter.designation ||
      (recruiter.isPrimary ? company?.designation : '') ||
      ''
    );
    setEditEmail(recruiter.email || '');
    setEditMobileNumber(
      recruiter.mobileNumber ||
      (recruiter.isPrimary ? company?.mobileNumber : '') ||
      ''
    );
    setEditStatus(recruiter.accountStatus || 'ACTIVE');
    setEditIsPrimary(Boolean(recruiter.isPrimary));
    setEditErrors({});
    setEditGeneralError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingRecruiter) return;
    const errors = {};

    // 1. HR / Recruiter Name (Required, 1-100)
    const hrTrim = editHrRecruiterName.trim();
    if (!hrTrim) {
      errors.hrRecruiterName = 'HR / Recruiter Name is required.';
    } else if (hrTrim.length > 100) {
      errors.hrRecruiterName = 'HR / Recruiter Name cannot exceed 100 characters.';
    }

    // 2. Designation / Role (Required, 1-100)
    const desigTrim = editDesignation.trim();
    if (!desigTrim) {
      errors.designation = 'Designation is required.';
    } else if (desigTrim.length > 100) {
      errors.designation = 'Designation cannot exceed 100 characters.';
    }

    // 3. Email Address (Required, valid email, max 254)
    const emailTrim = editEmail.trim();
    if (!emailTrim) {
      errors.email = 'Email Address is required.';
    } else if (!EMAIL_REGEX.test(emailTrim)) {
      errors.email = 'Please enter a valid email address (e.g. recruiter@company.com).';
    } else if (emailTrim.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    // 4. Mobile Number (Optional, 10-15 digits if provided)
    const mobileTrim = editMobileNumber.trim();
    if (mobileTrim) {
      if (mobileTrim.length > 50) {
        errors.mobileNumber = 'Mobile number cannot exceed 50 characters.';
      } else if (!isValidMobile(mobileTrim)) {
        errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setEditErrors({});
    setEditGeneralError('');
    setEditLoading(true);
    try {
      const payload = {
        hrRecruiterName: hrTrim,
        designation: desigTrim,
        email: emailTrim.toLowerCase(),
        mobileNumber: mobileTrim,
        accountStatus: editStatus,
        isPrimary: editIsPrimary
      };

      await companyService.updateRecruiter(company._id, editingRecruiter._id, payload);
      toast('Recruiter account updated.');
      setEditingRecruiter(null);
      await loadRecruiters();
      onUpdated?.();
    } catch (err) {
      const msg = err.message || 'Failed to update recruiter account.';
      if (msg.toLowerCase().includes('email')) {
        setEditErrors((prev) => ({ ...prev, email: msg }));
      } else {
        setEditGeneralError(msg);
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRecruiter) return;
    setDeleteLoading(true);
    try {
      await companyService.deleteRecruiter(company._id, deletingRecruiter._id);
      toast('Recruiter account removed.');
      setDeletingRecruiter(null);
      await loadRecruiters();
      onUpdated?.();
    } catch (err) {
      toast(err.message || 'Failed to delete recruiter.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (val) => {
    if (!val) return 'Never';
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(val));
    } catch (_) {
      return '—';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Recruiters — ${company?.companyName || 'Company'}${company?.companyId ? ` (${company.companyId})` : ''}`}
        maxWidth="920px"
      >
        <div style={{ marginTop: '4px', marginBottom: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted, #64748b)' }}>
            Manage individual recruiter login accounts associated with{' '}
            <strong>{company?.companyName}</strong>{company?.companyId ? ` [ID: ${company.companyId}]` : ''}. Multiple recruiters can share this company profile.
          </p>
        </div>

        {error && (
          <div className="notice error" role="alert" style={{ marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {/* Action Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px'
          }}
        >
          <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--navy, #173b76)' }}>
            Associated Recruiter Accounts ({recruiters.length})
          </div>
          {has('USER_CREATE') && !showAddForm && !editingRecruiter && (
            <button
              className="primary"
              type="button"
              style={{ fontSize: '0.82rem', padding: '6px 12px' }}
              onClick={() => {
                setEditingRecruiter(null);
                setShowAddForm(true);
                setAddErrors({});
                setAddGeneralError('');
              }}
            >
              + Add Recruiter
            </button>
          )}
        </div>

        {/* ADD RECRUITER COLLAPSIBLE FORM */}
        {showAddForm && (
          <section
            className="form-section-card"
            style={{ marginBottom: '16px' }}
          >
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                👤 Add Recruiter to {company?.companyName}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                Configure recruiter contact details. A secure default login password will be generated automatically.
              </p>
            </div>
            <form onSubmit={handleAddSubmit} noValidate autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {/* 1. HR / Recruiter Name */}
                <div className="field">
                  <label htmlFor="ar-hr">
                    HR / Recruiter Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="ar-hr"
                    name="hrRecruiterName"
                    type="text"
                    placeholder="Full Name of Recruiter"
                    value={addHrRecruiterName}
                    onChange={(e) => {
                      setAddHrRecruiterName(e.target.value);
                      if (addErrors.hrRecruiterName) setAddErrors((prev) => ({ ...prev, hrRecruiterName: '' }));
                    }}
                    disabled={addLoading}
                    style={addErrors.hrRecruiterName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(addErrors.hrRecruiterName)}
                    maxLength={100}
                  />
                  {addErrors.hrRecruiterName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {addErrors.hrRecruiterName}
                    </span>
                  )}
                </div>

                {/* 2. Designation / Role */}
                <div className="field">
                  <label htmlFor="ar-designation">
                    Designation / Role <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="ar-designation"
                    name="designation"
                    type="text"
                    placeholder="e.g. Campus Talent Acquisition Lead"
                    value={addDesignation}
                    onChange={(e) => {
                      setAddDesignation(e.target.value);
                      if (addErrors.designation) setAddErrors((prev) => ({ ...prev, designation: '' }));
                    }}
                    disabled={addLoading}
                    style={addErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(addErrors.designation)}
                    maxLength={100}
                  />
                  {addErrors.designation && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {addErrors.designation}
                    </span>
                  )}
                </div>

                {/* 3. Email Address */}
                <div className="field">
                  <label htmlFor="ar-email">
                    Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="ar-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="recruiter@company.example.com"
                    value={addEmail}
                    onChange={(e) => {
                      setAddEmail(e.target.value);
                      if (addErrors.email) setAddErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    disabled={addLoading}
                    style={addErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(addErrors.email)}
                    maxLength={254}
                  />
                  {addErrors.email && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {addErrors.email}
                    </span>
                  )}
                </div>

                {/* 4. Mobile Number */}
                <div className="field">
                  <label htmlFor="ar-mobile">Mobile Number</label>
                  <input
                    id="ar-mobile"
                    name="mobileNumber"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={addMobileNumber}
                    onChange={(e) => {
                      setAddMobileNumber(e.target.value);
                      if (addErrors.mobileNumber) setAddErrors((prev) => ({ ...prev, mobileNumber: '' }));
                    }}
                    disabled={addLoading}
                    style={addErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(addErrors.mobileNumber)}
                    maxLength={15}
                  />
                  {addErrors.mobileNumber && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {addErrors.mobileNumber}
                    </span>
                  )}
                </div>
              </div>

              {addGeneralError && (
                <div className="notice error">
                  {addGeneralError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '4px'
                }}
              >
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  disabled={addLoading}
                >
                  Cancel
                </button>
                <button className="primary" type="submit" disabled={addLoading}>
                  {addLoading ? 'Creating…' : 'Create Recruiter Account'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* EDIT RECRUITER INLINE FORM */}
        {editingRecruiter && (
          <section
            className="form-section-card"
            style={{ marginBottom: '16px' }}
          >
            <div style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ✏️ Edit Recruiter: {editingRecruiter.email}
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                Update recruiter details and account status
              </p>
            </div>
            <form onSubmit={handleEditSubmit} noValidate autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {/* 1. HR / Recruiter Name */}
                <div className="field">
                  <label htmlFor="er-hr">
                    HR / Recruiter Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="er-hr"
                    name="hrRecruiterName"
                    type="text"
                    placeholder="Full Name of Recruiter"
                    value={editHrRecruiterName}
                    onChange={(e) => {
                      setEditHrRecruiterName(e.target.value);
                      if (editErrors.hrRecruiterName) setEditErrors((prev) => ({ ...prev, hrRecruiterName: '' }));
                    }}
                    disabled={editLoading}
                    style={editErrors.hrRecruiterName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(editErrors.hrRecruiterName)}
                    maxLength={100}
                  />
                  {editErrors.hrRecruiterName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {editErrors.hrRecruiterName}
                    </span>
                  )}
                </div>

                {/* 2. Designation / Role */}
                <div className="field">
                  <label htmlFor="er-designation">
                    Designation / Role <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="er-designation"
                    name="designation"
                    type="text"
                    placeholder="e.g. Campus Talent Acquisition Lead"
                    value={editDesignation}
                    onChange={(e) => {
                      setEditDesignation(e.target.value);
                      if (editErrors.designation) setEditErrors((prev) => ({ ...prev, designation: '' }));
                    }}
                    disabled={editLoading}
                    style={editErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(editErrors.designation)}
                    maxLength={100}
                  />
                  {editErrors.designation && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {editErrors.designation}
                    </span>
                  )}
                </div>

                {/* 3. Email Address */}
                <div className="field">
                  <label htmlFor="er-email">
                    Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="er-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    placeholder="recruiter@company.example.com"
                    value={editEmail}
                    onChange={(e) => {
                      setEditEmail(e.target.value);
                      if (editErrors.email) setEditErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    disabled={editLoading}
                    style={editErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(editErrors.email)}
                    maxLength={254}
                  />
                  {editErrors.email && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {editErrors.email}
                    </span>
                  )}
                </div>

                {/* 4. Mobile Number */}
                <div className="field">
                  <label htmlFor="er-mobile">Mobile Number</label>
                  <input
                    id="er-mobile"
                    name="mobileNumber"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={editMobileNumber}
                    onChange={(e) => {
                      setEditMobileNumber(e.target.value);
                      if (editErrors.mobileNumber) setEditErrors((prev) => ({ ...prev, mobileNumber: '' }));
                    }}
                    disabled={editLoading}
                    style={editErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(editErrors.mobileNumber)}
                    maxLength={15}
                  />
                  {editErrors.mobileNumber && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {editErrors.mobileNumber}
                    </span>
                  )}
                </div>

                {/* 5. Account Status (Only displayed in Edit) */}
                <div className="field">
                  <label htmlFor="er-status">Account Status</label>
                  <select
                    id="er-status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    disabled={editLoading}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              {/* 6. Set as Primary Recruiter Checkbox */}
              {!editingRecruiter.isPrimary && (
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editIsPrimary}
                      onChange={(e) => setEditIsPrimary(e.target.checked)}
                      disabled={editLoading}
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                      Set as Primary Recruiter for this Company
                    </span>
                  </label>
                </div>
              )}

              {editGeneralError && (
                <div className="notice error">
                  {editGeneralError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '4px'
                }}
              >
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setEditingRecruiter(null)}
                  disabled={editLoading}
                >
                  Cancel
                </button>
                <button className="primary" type="submit" disabled={editLoading}>
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* RECRUITERS TABLE */}
        <div className="table-wrap" style={{ border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Recruiter Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Primary Recruiter</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="empty">
                    Loading recruiters…
                  </td>
                </tr>
              ) : recruiters.length > 0 ? (
                recruiters.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <strong>
                        {r.name || (r.isPrimary ? company?.hrRecruiterName : null) || r.email?.split('@')[0].replace(/[._-]/g, ' ') || 'Recruiter'}
                      </strong>
                    </td>
                    <td>{r.email}</td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Company Recruiter
                      </span>
                    </td>
                    <td>
                      <Badge status={r.accountStatus} />
                    </td>
                    <td>
                      {r.isPrimary ? (
                        <span
                          className="badge valid"
                          style={{
                            backgroundColor: '#e6fffa',
                            color: '#0d9488',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          ⭐ Primary
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Secondary</span>
                      )}
                    </td>
                    <td>{formatDate(r.lastLoginAt)}</td>
                    <td className="actions">
                      {has('USER_UPDATE') && (
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => startEdit(r)}
                        >
                          Edit
                        </button>
                      )}
                      {has('USER_DELETE') && (
                        <button
                          className="link-button"
                          style={{ color: 'var(--red, #e53e3e)' }}
                          type="button"
                          onClick={() => setDeletingRecruiter(r)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty">
                    No recruiter accounts registered for this company.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '18px'
          }}
        >
          <button className="primary" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={Boolean(deletingRecruiter)}
        onClose={() => setDeletingRecruiter(null)}
        title="Delete Recruiter Account"
        message={
          recruiters.length <= 1
            ? `Cannot delete ${deletingRecruiter?.email}. A company profile must retain at least one recruiter account. To remove this company completely, delete the company profile.`
            : deletingRecruiter?.isPrimary
            ? `Are you sure you want to delete ${deletingRecruiter?.email}? As this is the primary recruiter, primary contact status will be automatically reassigned to another active recruiter.`
            : `Are you sure you want to delete recruiter account ${deletingRecruiter?.email}? This action cannot be undone.`
        }
        confirmLabel={recruiters.length <= 1 ? 'OK' : 'Delete Recruiter'}
        danger={recruiters.length > 1}
        loading={deleteLoading}
        onConfirm={recruiters.length <= 1 ? () => setDeletingRecruiter(null) : handleDelete}
      />

      {/* TEMPORARY PASSWORD NOTICE MODAL */}
      <ConfirmModal
        isOpen={Boolean(tempPasswordNotice)}
        onClose={() => setTempPasswordNotice(null)}
        title="Recruiter Account Created"
        message={`Temporary password generated for this recruiter: ${tempPasswordNotice}`}
        confirmLabel="OK"
        onConfirm={() => setTempPasswordNotice(null)}
      />
    </>
  );
}
