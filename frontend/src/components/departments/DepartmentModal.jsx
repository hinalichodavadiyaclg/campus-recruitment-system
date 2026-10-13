import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';

export function DepartmentModal({ isOpen, department = null, onClose, onSubmit, isProcessing }) {
  const isEdit = Boolean(department?._id);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setServerError('');
      if (department) {
        setFormData({
          name: department.name || '',
          code: department.code || '',
          description: department.description || ''
        });
      } else {
        setFormData({
          name: '',
          code: '',
          description: ''
        });
      }
    }
  }, [isOpen, department]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'code' ? value.toUpperCase() : value
    }));
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

    const nameVal = formData.name.trim();
    if (!nameVal) {
      errors.name = 'Department Name is required.';
    } else if (nameVal.length > 100) {
      errors.name = 'Department Name cannot exceed 100 characters.';
    }

    const codeVal = formData.code.trim().toUpperCase();
    if (!codeVal) {
      errors.code = 'Department Code is required.';
    } else if (codeVal.length > 20) {
      errors.code = 'Department Code cannot exceed 20 characters.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await onSubmit({
        name: nameVal,
        code: codeVal,
        description: formData.description.trim()
      });
    } catch (err) {
      const msg = err.message || 'Failed to save department.';
      setServerError(msg);
      if (msg.toLowerCase().includes('code')) {
        setFieldErrors((prev) => ({ ...prev, code: msg }));
      } else if (msg.toLowerCase().includes('name')) {
        setFieldErrors((prev) => ({ ...prev, name: msg }));
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Department' : 'Add New Department'}
      maxWidth="760px"
    >
      <form
        id="department-modal-form"
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

        {/* SECTION 1: Department Information */}
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
              🏛️ Department Information
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Academic division name, official code, and optional description
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'start' }}>
            <div className="field">
              <label htmlFor="dept-name">
                Department Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="dept-name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Computer Science"
                disabled={isProcessing}
                aria-invalid={Boolean(fieldErrors.name)}
                style={fieldErrors.name ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
              />
              {fieldErrors.name && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.name}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="dept-code">
                Department Code <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="dept-code"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="e.g. CSE"
                disabled={isProcessing}
                aria-invalid={Boolean(fieldErrors.code)}
                style={fieldErrors.code ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={20}
              />
              <span className="hint" style={{ fontSize: '0.78rem', color: 'var(--muted, #718096)', marginTop: '3px' }}>
                Codes are automatically converted to uppercase.
              </span>
              {fieldErrors.code && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.code}
                </span>
              )}
            </div>
          </div>

          <div className="field" style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="dept-description">Description</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {formData.description ? formData.description.length : 0}/500
              </span>
            </div>
            <textarea
              id="dept-description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              placeholder="Description of the department..."
              disabled={isProcessing}
              maxLength={500}
            />
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
          <button
            className="ghost"
            type="button"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            disabled={isProcessing}
          >
            {isProcessing ? 'Saving…' : isEdit ? 'Update Department' : 'Create Department'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
