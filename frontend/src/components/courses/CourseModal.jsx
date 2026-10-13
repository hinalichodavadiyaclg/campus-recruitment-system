import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { departmentService } from '../../services/department.service.js';

export const COURSE_LEVEL_OPTIONS = [
  { value: 'UNDERGRADUATE', label: 'Undergraduate' },
  { value: 'POSTGRADUATE', label: 'Postgraduate' },
  { value: 'DIPLOMA', label: 'Diploma' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'DOCTORAL', label: 'Doctoral' }
];

export function CourseModal({ isOpen, course = null, onClose, onSubmit, isProcessing }) {
  const isEdit = Boolean(course?._id);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    departmentId: '',
    level: '',
    durationYears: '',
    description: ''
  });

  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [deptError, setDeptError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  // Fetch active departments when modal opens
  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setGeneralError('');
      setDeptError('');
      setLoadingDepartments(true);

      departmentService
        .listDepartments({ limit: 100 })
        .then((res) => {
          let list = res.items || [];
          // If editing and assigned department is inactive or missing from active list, include it
          if (course && course.departmentId) {
            const assignedId = typeof course.departmentId === 'object' ? course.departmentId._id : course.departmentId;
            const exists = list.some((d) => String(d._id) === String(assignedId));
            if (!exists && typeof course.departmentId === 'object') {
              list = [
                ...list,
                {
                  _id: course.departmentId._id,
                  name: `${course.departmentId.name} (Inactive)`,
                  code: course.departmentId.code,
                  isActive: false
                }
              ];
            }
          }
          setDepartments(list);
        })
        .catch((err) => {
          setDeptError(err.message || 'Failed to load departments.');
        })
        .finally(() => {
          setLoadingDepartments(false);
        });

      if (course) {
        const deptId = typeof course.departmentId === 'object' ? course.departmentId._id : course.departmentId || '';
        setFormData({
          name: course.name || '',
          code: course.code || '',
          departmentId: deptId,
          level: course.level || '',
          durationYears: course.durationYears ? String(course.durationYears) : '',
          description: course.description || ''
        });
      } else {
        setFormData({
          name: '',
          code: '',
          departmentId: '',
          level: '',
          durationYears: '',
          description: ''
        });
      }
    }
  }, [isOpen, course]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'code' ? value.toUpperCase() : value
    }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Course Name is required.';
    }
    if (!formData.code.trim()) {
      errors.code = 'Course Code is required.';
    }
    if (!formData.departmentId) {
      errors.departmentId = 'Department selection is required.';
    }
    if (!formData.level) {
      errors.level = 'Course Level selection is required.';
    }
    if (formData.durationYears) {
      const dur = Number(formData.durationYears);
      if (isNaN(dur) || dur < 0.5 || dur > 10) {
        errors.durationYears = 'Duration must be between 0.5 and 10 years.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setGeneralError('');

    try {
      await onSubmit({
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        departmentId: formData.departmentId,
        level: formData.level,
        durationYears: formData.durationYears ? Number(formData.durationYears) : undefined,
        description: formData.description.trim()
      });
    } catch (err) {
      const msg = err.message || 'Failed to save course.';
      if (msg.toLowerCase().includes('code')) {
        setFieldErrors((prev) => ({ ...prev, code: msg }));
      } else if (msg.toLowerCase().includes('name')) {
        setFieldErrors((prev) => ({ ...prev, name: msg }));
      } else {
        setGeneralError(msg);
      }
    }
  };

  const activeDeptCount = departments.filter((d) => d.isActive !== false).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Course' : 'Create New Course'}
      maxWidth="760px"
    >
      <form
        id="course-modal-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
        onSubmit={handleSubmit}
      >
        {activeDeptCount === 0 && !loadingDepartments && !isEdit && (
          <div
            className="notice error"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>No active departments found. Please create an active department first.</span>
            <a href="#/departments" onClick={onClose} className="link-button" style={{ fontWeight: 'bold' }}>
              Go to Departments &rarr;
            </a>
          </div>
        )}

        {/* Section 1: Course Identification */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📚 Course Identification
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Core course naming and official university code
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'start' }}>
            <div className="field">
              <label htmlFor="course-name">
                Course Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="course-name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Bachelor of Technology (CSE)"
                disabled={isProcessing}
                style={fieldErrors.name ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.name}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="course-code">
                Course Code <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="course-code"
                name="code"
                value={formData.code}
                onChange={handleChange}
                placeholder="e.g. BTECH-CSE"
                disabled={isProcessing}
                style={fieldErrors.code ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                aria-invalid={Boolean(fieldErrors.code)}
              />
              {fieldErrors.code ? (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.code}
                </span>
              ) : (
                <span className="hint" style={{ fontSize: '0.8rem', color: 'var(--muted, #718096)', marginTop: '4px' }}>
                  Auto-converted to uppercase.
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Department & Academic Level */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🏛️ Department & Academic Level
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Parent department and academic qualification degree
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'start' }}>
            <div className="field">
              <label htmlFor="course-department">
                Department <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="course-department"
                name="departmentId"
                value={formData.departmentId}
                onChange={handleChange}
                disabled={isProcessing || loadingDepartments}
                style={fieldErrors.departmentId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                aria-invalid={Boolean(fieldErrors.departmentId)}
              >
                <option value="">{loadingDepartments ? 'Loading departments…' : '-- Select Department --'}</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id} disabled={dept.isActive === false && String(dept._id) !== String(formData.departmentId)}>
                    {dept.name} ({dept.code}){dept.isActive === false ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.departmentId ? (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.departmentId}
                </span>
              ) : deptError ? (
                <span className="hint error">{deptError}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="course-level">
                Course Level <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="course-level"
                name="level"
                value={formData.level}
                onChange={handleChange}
                disabled={isProcessing}
                style={fieldErrors.level ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                aria-invalid={Boolean(fieldErrors.level)}
              >
                <option value="">-- Select Course Level --</option>
                {COURSE_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {fieldErrors.level && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.level}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Section 3: Duration & Additional Details */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⏱️ Duration & Additional Details
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Program length and optional course overview
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'start' }}>
            <div className="field" style={{ maxWidth: '350px' }}>
              <label htmlFor="course-duration">Duration (in Years)</label>
              <input
                id="course-duration"
                type="number"
                name="durationYears"
                step="0.5"
                min="0.5"
                max="10"
                value={formData.durationYears}
                onChange={handleChange}
                placeholder="e.g. 4 (or 2.5)"
                disabled={isProcessing}
                style={fieldErrors.durationYears ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                aria-invalid={Boolean(fieldErrors.durationYears)}
              />
              {fieldErrors.durationYears && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.durationYears}
                </span>
              )}
            </div>
          </div>

          <div className="field" style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="course-description">Description</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {(formData.description ? formData.description.length : 0)}/500
              </span>
            </div>
            <textarea
              id="course-description"
              name="description"
              rows={3}
              maxLength={500}
              value={formData.description}
              onChange={handleChange}
              placeholder="Description of the course..."
              disabled={isProcessing}
              style={{ resize: 'vertical' }}
            />
          </div>
        </section>

        {generalError && (
          <p className="notice error">
            {generalError}
          </p>
        )}

        <div className="modal-actions" style={{ marginTop: '8px' }}>
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
            disabled={isProcessing || (activeDeptCount === 0 && !isEdit)}
          >
            {isProcessing ? 'Saving…' : isEdit ? 'Update Course' : 'Create Course'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
