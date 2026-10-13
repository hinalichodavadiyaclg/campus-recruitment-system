import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { companyService } from '../../services/company.service.js';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';

const INITIAL_FORM_STATE = {
  companyName: '',
  industryType: '',
  hrRecruiterName: '',
  email: '',
  yearEstablished: '',
  designation: '',
  mobileNumber: '',
  website: '',
  officeAddress: '',
  description: ''
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENT_YEAR = new Date().getFullYear();
const COMPANY_YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1800 + 1 },
  (_, i) => CURRENT_YEAR - i
);

export function CompanyModal({ isOpen, company = null, onClose, onSuccess }) {
  const isEdit = Boolean(company?._id);

  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setServerError('');
      if (company) {
        setFormData({
          companyName: company.companyName || '',
          industryType: company.industryType || '',
          hrRecruiterName: company.hrRecruiterName || '',
          email: company.email || '',
          yearEstablished: company.yearEstablished ? String(company.yearEstablished) : '',
          designation: company.designation || '',
          mobileNumber: company.mobileNumber || '',
          website: company.website || '',
          officeAddress: company.officeAddress || '',
          description: company.description || ''
        });
      } else {
        setFormData(INITIAL_FORM_STATE);
      }
    }
  }, [isOpen, company]);

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

  const validateForm = () => {
    const errors = {};

    // 1. Company Name (Required, 1-200)
    const name = formData.companyName.trim();
    if (!name) {
      errors.companyName = 'Company Name is required.';
    } else if (name.length > 200) {
      errors.companyName = 'Company Name cannot exceed 200 characters.';
    }

    // 2. Industry Type (Required, 1-100)
    const industry = formData.industryType.trim();
    if (!industry) {
      errors.industryType = 'Industry Type is required.';
    } else if (industry.length > 100) {
      errors.industryType = 'Industry Type cannot exceed 100 characters.';
    }

    // 3. HR / Recruiter Name (Required, 1-100)
    const hr = formData.hrRecruiterName.trim();
    if (!hr) {
      errors.hrRecruiterName = 'HR / Recruiter Name is required.';
    } else if (hr.length > 100) {
      errors.hrRecruiterName = 'HR / Recruiter Name cannot exceed 100 characters.';
    }

    // 4. Email Address (Required, valid email, max 254)
    const emailVal = formData.email.trim();
    if (!emailVal) {
      errors.email = 'Email Address is required.';
    } else if (!EMAIL_REGEX.test(emailVal)) {
      errors.email = 'Please enter a valid email address (e.g. recruiter@company.com).';
    } else if (emailVal.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    // 5. Year Established (Required, 1800-2100 integer)
    const yearVal = formData.yearEstablished !== '' ? Number(formData.yearEstablished) : NaN;
    if (formData.yearEstablished === '' || Number.isNaN(yearVal) || !Number.isInteger(yearVal)) {
      errors.yearEstablished = 'Year Established is required and must be a whole year (1800–2100).';
    } else if (yearVal < 1800 || yearVal > 2100) {
      errors.yearEstablished = 'Year Established must be between 1800 and 2100.';
    }

    // 6. Designation (Required, 1-100)
    const desig = formData.designation.trim();
    if (!desig) {
      errors.designation = 'Designation is required.';
    } else if (desig.length > 100) {
      errors.designation = 'Designation cannot exceed 100 characters.';
    }

    // 7. Mobile Number (Required, 10-15 digits)
    const mobile = formData.mobileNumber.trim();
    if (!mobile) {
      errors.mobileNumber = 'Mobile number is required.';
    } else if (mobile.length > 50) {
      errors.mobileNumber = 'Mobile number cannot exceed 50 characters.';
    } else if (!isValidMobile(mobile)) {
      errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;
    }

    // 8. Website URL (Optional, max 300)
    const web = formData.website.trim();
    if (web) {
      if (web.length > 300) {
        errors.website = 'Website URL cannot exceed 300 characters.';
      } else {
        try {
          const testUrl = web.startsWith('http://') || web.startsWith('https://') ? web : `https://${web}`;
          const parsed = new URL(testUrl);
          if (!parsed.hostname || !parsed.hostname.includes('.')) {
            errors.website = 'Please enter a valid URL (e.g. https://company.example.com).';
          }
        } catch (_) {
          errors.website = 'Please enter a valid URL (e.g. https://company.example.com).';
        }
      }
    }

    // 9. Office Address (Required, 1-500)
    const addr = formData.officeAddress.trim();
    if (!addr) {
      errors.officeAddress = 'Office Address is required.';
    } else if (addr.length > 500) {
      errors.officeAddress = 'Office Address cannot exceed 500 characters.';
    }

    // 10. Description (Required, 1-1000)
    const desc = formData.description.trim();
    if (!desc) {
      errors.description = 'Company Description is required.';
    } else if (desc.length > 1000) {
      errors.description = 'Description cannot exceed 1000 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    const payload = {
      companyName: formData.companyName.trim(),
      industryType: formData.industryType.trim(),
      hrRecruiterName: formData.hrRecruiterName.trim(),
      email: formData.email.trim().toLowerCase(),
      yearEstablished: Number(formData.yearEstablished),
      designation: formData.designation.trim(),
      mobileNumber: formData.mobileNumber.trim(),
      website: formData.website.trim(),
      officeAddress: formData.officeAddress.trim(),
      description: formData.description.trim()
    };

    try {
      let result;
      if (isEdit) {
        result = await companyService.updateCompany(company._id, payload);
      } else {
        result = await companyService.createCompany(payload);
      }
      onClose();
      onSuccess(result);
    } catch (err) {
      const errMsg = err.message || 'Operation failed. Please review the form and try again.';
      setServerError(errMsg);

      if (err.details) {
        if (err.details.companyName) {
          setFieldErrors((prev) => ({ ...prev, companyName: err.details.companyName }));
        }
        if (err.details.email) {
          setFieldErrors((prev) => ({ ...prev, email: err.details.email }));
        }
      }

      const lower = errMsg.toLowerCase();
      if (lower.includes('company with this name') || lower.includes('company name')) {
        setFieldErrors((prev) => ({ ...prev, companyName: err.details?.companyName || errMsg }));
      }
      if (lower.includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: err.details?.email || errMsg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Company Profile' : 'Register New Company'}
      maxWidth="760px"
    >
      <form
        id="company-modal-form"
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
          <div
            className="notice error"
            role="alert"
            style={{ marginBottom: '4px' }}
          >
            {serverError}
          </div>
        )}

        {/* SECTION 1: Company Identity */}
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
              🏢 Company Identity
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Organization name, industry domain, and founding year
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 1. Company Name */}
            <div className="field">
              <label htmlFor="co-name">
                Company Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="co-name"
                name="companyName"
                type="text"
                value={formData.companyName}
                onChange={handleChange}
                placeholder="e.g. Acme Innovations Corp"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.companyName)}
                style={fieldErrors.companyName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={200}
              />
              {fieldErrors.companyName && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.companyName}
                </span>
              )}
            </div>

            {/* 2. Industry Type */}
            <div className="field">
              <label htmlFor="co-industry">
                Industry Type <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="co-industry"
                name="industryType"
                type="text"
                value={formData.industryType}
                onChange={handleChange}
                placeholder="e.g. Software & Technology, Finance, Healthcare"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.industryType)}
                style={fieldErrors.industryType ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
              />
              {fieldErrors.industryType && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.industryType}
                </span>
              )}
            </div>

            {/* 3. Year Established */}
            <div className="field">
              <label htmlFor="co-year">
                Year Established <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="co-year"
                name="yearEstablished"
                value={formData.yearEstablished}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.yearEstablished)}
                style={fieldErrors.yearEstablished ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              >
                <option value="">— Select Year Established —</option>
                {COMPANY_YEAR_OPTIONS.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
              {fieldErrors.yearEstablished && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.yearEstablished}
                </span>
              )}
            </div>

            {/* 4. Website URL */}
            <div className="field">
              <label htmlFor="co-website">Website URL</label>
              <input
                id="co-website"
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://company.example.com"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.website)}
                style={fieldErrors.website ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={300}
              />
              {fieldErrors.website && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.website}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: Recruiter Contact Details */}
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
              👤 Recruiter Contact
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Primary point of contact for placement rounds and official communication
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 5. HR / Recruiter Name */}
            <div className="field">
              <label htmlFor="co-hr">
                HR / Recruiter Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="co-hr"
                name="hrRecruiterName"
                type="text"
                value={formData.hrRecruiterName}
                onChange={handleChange}
                placeholder="Full Name of Lead Recruiter"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.hrRecruiterName)}
                style={fieldErrors.hrRecruiterName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
              />
              {fieldErrors.hrRecruiterName && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.hrRecruiterName}
                </span>
              )}
            </div>

            {/* 6. Designation */}
            <div className="field">
              <label htmlFor="co-designation">
                Designation / Role <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="co-designation"
                name="designation"
                type="text"
                value={formData.designation}
                onChange={handleChange}
                placeholder="e.g. Campus Talent Acquisition Lead"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.designation)}
                style={fieldErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={100}
              />
              {fieldErrors.designation && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.designation}
                </span>
              )}
            </div>

            {/* 7. Email Address */}
            <div className="field">
              <label htmlFor="co-email">
                Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="co-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="recruiter@company.example.com"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.email)}
                style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={254}
              />
              {fieldErrors.email && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.email}
                </span>
              )}
            </div>

            {/* 8. Mobile Number */}
            <div className="field">
              <label htmlFor="co-mobile">
                Mobile Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="co-mobile"
                name="mobileNumber"
                type="tel"
                value={formData.mobileNumber}
                onChange={handleChange}
                placeholder="+91 98765 43210"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.mobileNumber)}
                style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={15}
              />
              {fieldErrors.mobileNumber && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.mobileNumber}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 3: Overview & Location */}
        <section className="form-section-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
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
              📍 Overview & Location
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Physical office address and descriptive overview visible to candidates
            </p>
          </div>

          {/* 9. Office Address */}
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="co-address">
                Office Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {formData.officeAddress.length}/500
              </span>
            </div>
            <textarea
              id="co-address"
              name="officeAddress"
              rows={3}
              value={formData.officeAddress}
              onChange={handleChange}
              placeholder="Headquarters or regional office address"
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.officeAddress)}
              aria-required="true"
              style={fieldErrors.officeAddress ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              maxLength={500}
            />
            {fieldErrors.officeAddress && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem' }}>
                {fieldErrors.officeAddress}
              </span>
            )}
          </div>

          {/* 10. Description */}
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="co-desc">
                Company Description <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {formData.description.length}/1000
              </span>
            </div>
            <textarea
              id="co-desc"
              name="description"
              rows={4}
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief overview of company culture, work domains, products, and hiring initiatives"
              disabled={submitting}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-required="true"
              style={fieldErrors.description ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              maxLength={1000}
            />
            {fieldErrors.description && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem' }}>
                {fieldErrors.description}
              </span>
            )}
          </div>
        </section>

        {/* Modal Actions */}
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
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="primary"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? 'Saving…'
              : isEdit
              ? 'Update Company Profile'
              : 'Register Company'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
