import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { companyService } from '../../services/company.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { BuildingIcon, UserIcon, MapPinIcon } from '../../components/common/Icons.jsx';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENT_YEAR = new Date().getFullYear();
const COMPANY_YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1800 + 1 },
  (_, i) => CURRENT_YEAR - i
);

export function CompanyMyProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  const [formData, setFormData] = useState({
    companyName: '',
    industryType: '',
    hrRecruiterName: '',
    designation: '',
    email: '',
    mobileNumber: '',
    website: '',
    yearEstablished: '',
    officeAddress: '',
    description: ''
  });

  useEffect(() => {
    loadCompanyProfile();
  }, []);

  const loadCompanyProfile = async () => {
    setLoading(true);
    setFieldErrors({});
    setGeneralError('');
    try {
      const data = await companyService.getMyProfile();
      setCompany(data);
      setFormData({
        companyName: data.companyName || '',
        industryType: data.industryType || '',
        hrRecruiterName: data.hrRecruiterName || '',
        designation: data.designation || '',
        email: data.email || '',
        mobileNumber: data.mobileNumber || '',
        website: data.website || '',
        yearEstablished: data.yearEstablished ? String(data.yearEstablished) : '',
        officeAddress: data.officeAddress || '',
        description: data.description || ''
      });
    } catch (err) {
      toast(err.message || 'Failed to load company profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const errors = {};

    // 1. Company Name (Required, 1-150)
    const cName = formData.companyName.trim();
    if (!cName) {
      errors.companyName = 'Company Name is required.';
    } else if (cName.length > 150) {
      errors.companyName = 'Company Name cannot exceed 150 characters.';
    }

    // 2. Industry Type (Required, 1-100)
    const ind = formData.industryType.trim();
    if (!ind) {
      errors.industryType = 'Industry Type is required.';
    } else if (ind.length > 100) {
      errors.industryType = 'Industry Type cannot exceed 100 characters.';
    }

    // 3. HR / Recruiter Name (Required, 1-100)
    const hr = formData.hrRecruiterName.trim();
    if (!hr) {
      errors.hrRecruiterName = 'HR / Recruiter Name is required.';
    } else if (hr.length > 100) {
      errors.hrRecruiterName = 'HR / Recruiter Name cannot exceed 100 characters.';
    }

    // 4. Designation (Required, 1-100)
    const desig = formData.designation.trim();
    if (!desig) {
      errors.designation = 'Designation is required.';
    } else if (desig.length > 100) {
      errors.designation = 'Designation cannot exceed 100 characters.';
    }

    // 5. Email Address (Required, valid email, max 254)
    const emailVal = formData.email.trim();
    if (!emailVal) {
      errors.email = 'Email Address is required.';
    } else if (!EMAIL_REGEX.test(emailVal)) {
      errors.email = 'Please enter a valid email address (e.g. recruiter@company.com).';
    } else if (emailVal.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    // 6. Mobile Number (Required, 10-15 digits)
    const mobile = formData.mobileNumber.trim();
    if (!mobile) {
      errors.mobileNumber = 'Mobile number is required.';
    } else if (!isValidMobile(mobile)) {
      errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;
    }

    // 7. Year Established (Required, 1800-2100 integer)
    const yearVal = formData.yearEstablished !== '' ? Number(formData.yearEstablished) : NaN;
    if (formData.yearEstablished === '' || Number.isNaN(yearVal) || !Number.isInteger(yearVal)) {
      errors.yearEstablished = 'Year Established is required and must be a whole year (1800–2100).';
    } else if (yearVal < 1800 || yearVal > 2100) {
      errors.yearEstablished = 'Year Established must be between 1800 and 2100.';
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

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setGeneralError('');
    setSaving(true);
    try {
      const payload = {
        companyName: formData.companyName.trim(),
        industryType: formData.industryType.trim(),
        hrRecruiterName: formData.hrRecruiterName.trim(),
        designation: formData.designation.trim(),
        email: formData.email.trim(),
        mobileNumber: formData.mobileNumber.trim(),
        website: formData.website.trim(),
        yearEstablished: Number(formData.yearEstablished),
        officeAddress: formData.officeAddress.trim(),
        description: formData.description.trim()
      };

      const updated = await companyService.updateMyProfile(payload);
      toast('Company profile updated successfully!');
      setCompany(updated);
    } catch (err) {
      const msg = err.message || 'Failed to update company profile.';
      if (msg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: msg }));
      } else if (msg.toLowerCase().includes('company name')) {
        setFieldErrors((prev) => ({ ...prev, companyName: msg }));
      } else {
        setGeneralError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalLayout title="Company Recruiter Profile">
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <div className="card" style={{ padding: '28px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 6px', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BuildingIcon size={22} color="var(--primary, #0284c7)" /> {company?.companyName || 'Company Profile'}
            {company?.companyId && (
              <span style={{ marginLeft: '10px', fontSize: '0.85rem', fontWeight: '600', color: '#2563eb', backgroundColor: '#eff6ff', padding: '3px 8px', borderRadius: '4px' }}>
                {company.companyId}
              </span>
            )}
          </h2>
          <p style={{ fontSize: '0.88rem', color: 'var(--muted, #64748b)', margin: '0 0 20px' }}>
            Manage official company information and recruiter contact details.
          </p>

          {loading ? (
            <p>Loading company profile...</p>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {/* SECTION 1: Company Identity */}
              <div style={{ marginTop: '4px', marginBottom: '2px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BuildingIcon size={16} color="var(--primary, #0284c7)" /> Company Identity
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Core organization details and founding year
                </p>
              </div>

              <div className="field">
                <label htmlFor="comp-name">Company Name *</label>
                <input
                  id="comp-name"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  placeholder="e.g. Infosys Ltd."
                  disabled={saving}
                  style={fieldErrors.companyName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.companyName)}
                />
                {fieldErrors.companyName && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.companyName}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="comp-industry">Industry Type *</label>
                <input
                  id="comp-industry"
                  name="industryType"
                  value={formData.industryType}
                  onChange={handleChange}
                  placeholder="e.g. Information Technology"
                  disabled={saving}
                  style={fieldErrors.industryType ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.industryType)}
                />
                {fieldErrors.industryType && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.industryType}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="comp-year">
                  Year Established <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                </label>
                <select
                  id="comp-year"
                  name="yearEstablished"
                  value={formData.yearEstablished}
                  onChange={handleChange}
                  disabled={saving}
                  style={fieldErrors.yearEstablished ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.yearEstablished)}
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

              <div className="field">
                <label htmlFor="comp-web">Website URL</label>
                <input
                  id="comp-web"
                  name="website"
                  type="url"
                  placeholder="https://company.example.com"
                  value={formData.website}
                  onChange={handleChange}
                  disabled={saving}
                  style={fieldErrors.website ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.website)}
                />
                {fieldErrors.website && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.website}
                  </span>
                )}
              </div>

              {/* SECTION 2: Recruiter Contact */}
              <div style={{ marginTop: '8px', marginBottom: '2px', borderTop: '1px solid #e9eef3', paddingTop: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserIcon size={16} color="var(--primary, #0284c7)" /> Recruiter Contact
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Primary point of contact for placement rounds and official communication
                </p>
              </div>

              <div className="field">
                <label htmlFor="comp-hr">HR / Recruiter Name *</label>
                <input
                  id="comp-hr"
                  name="hrRecruiterName"
                  value={formData.hrRecruiterName}
                  onChange={handleChange}
                  placeholder="e.g. John Doe"
                  disabled={saving}
                  style={fieldErrors.hrRecruiterName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.hrRecruiterName)}
                />
                {fieldErrors.hrRecruiterName && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.hrRecruiterName}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="comp-desig">Designation / Role *</label>
                <input
                  id="comp-desig"
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  placeholder="e.g. Talent Acquisition Lead"
                  disabled={saving}
                  style={fieldErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.designation)}
                />
                {fieldErrors.designation && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.designation}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="comp-email">Email Address *</label>
                <input
                  id="comp-email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. recruiter@company.com"
                  disabled={saving}
                  style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div className="field">
                <label htmlFor="comp-mob">Mobile Number *</label>
                <input
                  id="comp-mob"
                  name="mobileNumber"
                  type="tel"
                  placeholder="10-digit mobile number"
                  maxLength={15}
                  value={formData.mobileNumber}
                  onChange={handleChange}
                  disabled={saving}
                  style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  aria-invalid={Boolean(fieldErrors.mobileNumber)}
                />
                {fieldErrors.mobileNumber && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.mobileNumber}
                  </span>
                )}
              </div>

              {/* SECTION 3: Overview & Location */}
              <div style={{ marginTop: '8px', marginBottom: '2px', borderTop: '1px solid #e9eef3', paddingTop: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPinIcon size={16} color="var(--primary, #0284c7)" /> Overview & Location
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Physical office address and descriptive overview visible to candidates
                </p>
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="comp-addr">Office Address *</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                    {formData.officeAddress.length}/500
                  </span>
                </div>
                <textarea
                  id="comp-addr"
                  name="officeAddress"
                  rows="3"
                  maxLength={500}
                  value={formData.officeAddress}
                  onChange={handleChange}
                  placeholder="Street, City, State, ZIP code"
                  disabled={saving}
                  style={{
                    resize: 'vertical',
                    ...(fieldErrors.officeAddress ? { borderColor: 'var(--red, #e53e3e)' } : {})
                  }}
                  aria-invalid={Boolean(fieldErrors.officeAddress)}
                />
                {fieldErrors.officeAddress && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.officeAddress}
                  </span>
                )}
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="comp-desc">Description *</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                    {formData.description.length}/1000
                  </span>
                </div>
                <textarea
                  id="comp-desc"
                  name="description"
                  rows="4"
                  maxLength={1000}
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Overview of company history, vision, culture, and recruitment profile..."
                  disabled={saving}
                  style={{
                    resize: 'vertical',
                    ...(fieldErrors.description ? { borderColor: 'var(--red, #e53e3e)' } : {})
                  }}
                  aria-invalid={Boolean(fieldErrors.description)}
                />
                {fieldErrors.description && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.description}
                  </span>
                )}
              </div>

              {generalError && (
                <div className="notice error">
                  {generalError}
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button className="primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
