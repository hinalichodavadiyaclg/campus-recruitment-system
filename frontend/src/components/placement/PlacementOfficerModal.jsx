import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { departmentService } from '../../services/department.service.js';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';

export function PlacementOfficerModal({ isOpen, officer = null, onClose, onSuccess }) {
  const isEdit = Boolean(officer?._id);

  const [formData, setFormData] = useState({
    employeeId: '',
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    designation: '',
    role: '',
    departmentId: '',
    department: ''
  });
  const [departments, setDepartments] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setServerError('');
      departmentService.listDepartments({ limit: 100, isActive: true })
        .then((res) => setDepartments(res.items || []))
        .catch(() => setDepartments([]));

      if (officer) {
        setFormData({
          employeeId: officer.employeeId || '',
          firstName: officer.firstName || '',
          lastName: officer.lastName || '',
          email: officer.email || '',
          mobileNumber: officer.mobileNumber || '',
          designation: officer.designation || '',
          role: officer.role || '',
          departmentId: officer.departmentId?._id || officer.departmentId || '',
          department: officer.department || officer.departmentId?.name || ''
        });
      } else {
        setFormData({
          employeeId: '',
          firstName: '',
          lastName: '',
          email: '',
          mobileNumber: '',
          designation: '',
          role: '',
          departmentId: '',
          department: ''
        });
      }
    }
  }, [isOpen, officer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const errors = {};

    const empId = formData.employeeId.trim();
    if (!empId) errors.employeeId = 'Employee ID is required.';
    else if (empId.length > 50) errors.employeeId = 'Employee ID cannot exceed 50 characters.';

    const emailVal = formData.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal) errors.email = 'Email Address is required.';
    else if (!emailRegex.test(emailVal)) errors.email = 'Please enter a valid email address.';
    else if (emailVal.length > 254) errors.email = 'Email address cannot exceed 254 characters.';

    const mobVal = (formData.mobileNumber || '').trim();
    if (!mobVal) errors.mobileNumber = 'Mobile Number is required.';
    else if (!isValidMobile(mobVal)) errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;

    const fName = formData.firstName.trim();
    if (!fName) errors.firstName = 'First Name is required.';
    else if (fName.length > 100) errors.firstName = 'First Name cannot exceed 100 characters.';

    const lName = formData.lastName.trim();
    if (!lName) errors.lastName = 'Last Name is required.';
    else if (lName.length > 100) errors.lastName = 'Last Name cannot exceed 100 characters.';

    const desig = formData.designation.trim();
    if (!desig) errors.designation = 'Designation is required.';
    else if (desig.length > 100) errors.designation = 'Designation cannot exceed 100 characters.';

    if (!formData.role) {
      errors.role = 'Assigned Role is required. Please select a role.';
    } else if (formData.role === 'ROLE_PLACEMENT_COORDINATOR' && !formData.departmentId) {
      errors.departmentId = 'Department is required for Placement Coordinator.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    const payload = {
      employeeId: empId,
      firstName: fName,
      lastName: lName,
      email: emailVal.toLowerCase(),
      mobileNumber: mobVal,
      designation: desig,
      role: formData.role
    };

    if (formData.role === 'ROLE_PLACEMENT_COORDINATOR' && formData.departmentId) {
      payload.departmentId = formData.departmentId;
      if (formData.department) payload.department = formData.department;
    }

    try {
      let result;
      if (isEdit) {
        result = await placementOfficerService.updatePlacementOfficer(officer._id, payload);
      } else {
        result = await placementOfficerService.createPlacementOfficer(payload);
      }
      onClose();
      onSuccess(result);
    } catch (err) {
      const msg = err.message || 'Operation failed.';
      setServerError(msg);
      if (msg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      } else if (msg.toLowerCase().includes('employee id')) {
        setFieldErrors((prev) => ({ ...prev, employeeId: msg }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Placement Officer' : 'Create Placement Officer'}
      maxWidth="760px"
    >
      <form
        id="placement-officer-modal-form"
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
          <div className="notice error" role="alert" style={{ marginBottom: '4px' }}>
            {serverError}
          </div>
        )}

        {/* SECTION 1: Professional Identity */}
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
              💼 Professional Identity & Credentials
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Staff employee number, job title, and system role
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label htmlFor="po-emp-id">
                Employee ID <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="po-emp-id"
                name="employeeId"
                value={formData.employeeId}
                onChange={handleChange}
                placeholder="e.g. EMP-PL-101"
                aria-invalid={Boolean(fieldErrors.employeeId)}
                style={fieldErrors.employeeId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={50}
                autoComplete="off"
              />
              {fieldErrors.employeeId && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.employeeId}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="po-desig">
                Designation (Job Title) <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="po-desig"
                name="designation"
                value={formData.designation}
                onChange={handleChange}
                placeholder="Placement Head / Coordinator"
                aria-invalid={Boolean(fieldErrors.designation)}
                style={fieldErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
                autoComplete="off"
              />
              {fieldErrors.designation && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.designation}
                </span>
              )}
            </div>

            <div className="field" style={formData.role === 'ROLE_PLACEMENT_COORDINATOR' ? {} : { gridColumn: '1 / -1' }}>
              <label htmlFor="po-role">
                Assigned Authorization Role <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="po-role"
                name="role"
                value={formData.role}
                onChange={(e) => {
                  const newRole = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    role: newRole,
                    departmentId: newRole === 'ROLE_PLACEMENT_COORDINATOR' ? prev.departmentId : '',
                    department: newRole === 'ROLE_PLACEMENT_COORDINATOR' ? prev.department : ''
                  }));
                  if (fieldErrors.role) {
                    setFieldErrors((prev) => ({ ...prev, role: undefined }));
                  }
                }}
                aria-invalid={Boolean(fieldErrors.role)}
                style={fieldErrors.role ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              >
                <option value="">— Select Assigned Role —</option>
                <option value="ROLE_PLACEMENT_COORDINATOR">Placement Coordinator (ROLE_PLACEMENT_COORDINATOR)</option>
                <option value="ROLE_PLACEMENT_HEAD">Placement Head (ROLE_PLACEMENT_HEAD)</option>
              </select>
              {fieldErrors.role && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.role}
                </span>
              )}
            </div>

            {formData.role === 'ROLE_PLACEMENT_COORDINATOR' && (
              <div className="field">
                <label htmlFor="po-dept">
                  Assigned Department <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                </label>
                <select
                  id="po-dept"
                  name="departmentId"
                  value={formData.departmentId || ''}
                  onChange={(e) => {
                    const dId = e.target.value;
                    const matched = departments.find((d) => String(d._id) === String(dId));
                    setFormData((prev) => ({
                      ...prev,
                      departmentId: dId,
                      department: matched ? matched.name : ''
                    }));
                    if (fieldErrors.departmentId) {
                      setFieldErrors((prev) => ({ ...prev, departmentId: undefined }));
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.departmentId)}
                  style={fieldErrors.departmentId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                >
                  <option value="">— Select Department —</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} {d.code ? `(${d.code})` : ''}
                    </option>
                  ))}
                </select>
                {fieldErrors.departmentId && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.departmentId}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* SECTION 2: Personal & Contact Information */}
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
              👤 Personal Details & Contact
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Staff legal name and official contact email
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label htmlFor="po-first-name">
                First Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="po-first-name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Given name"
                aria-invalid={Boolean(fieldErrors.firstName)}
                style={fieldErrors.firstName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
                autoComplete="off"
              />
              {fieldErrors.firstName && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.firstName}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="po-last-name">
                Last Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="po-last-name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Surname / Family name"
                aria-invalid={Boolean(fieldErrors.lastName)}
                style={fieldErrors.lastName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
                autoComplete="off"
              />
              {fieldErrors.lastName && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.lastName}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="po-email">
                Official Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="po-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="officer@university.edu"
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
              <label htmlFor="po-mobile">
                Mobile Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="po-mobile"
                name="mobileNumber"
                type="tel"
                value={formData.mobileNumber}
                onChange={handleChange}
                placeholder="+91 9876543210"
                aria-invalid={Boolean(fieldErrors.mobileNumber)}
                style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={15}
                autoComplete="off"
              />
              {fieldErrors.mobileNumber && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.mobileNumber}
                </span>
              )}
            </div>
          </div>
        </section>

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
            {loading ? 'Saving…' : isEdit ? 'Update Officer' : 'Create Officer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
