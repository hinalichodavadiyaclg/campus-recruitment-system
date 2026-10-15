import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { companyService } from '../../services/company.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import {
  BuildingIcon,
  UserIcon,
  MapPinIcon,
  CalendarIcon,
  LinkIcon,
  EditIcon,
  EyeIcon,
  ExternalLinkIcon,
  MailIcon,
  PhoneIcon,
  DocumentIcon
} from '../../components/common/Icons.jsx';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';
import './CompanyProfile.css';

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
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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

  const handleOpenEdit = () => {
    if (company) {
      setFormData({
        companyName: company.companyName || '',
        industryType: company.industryType || '',
        hrRecruiterName: company.hrRecruiterName || '',
        designation: company.designation || '',
        email: company.email || '',
        mobileNumber: company.mobileNumber || '',
        website: company.website || '',
        yearEstablished: company.yearEstablished ? String(company.yearEstablished) : '',
        officeAddress: company.officeAddress || '',
        description: company.description || ''
      });
    }
    setFieldErrors({});
    setGeneralError('');
    setIsEditModalOpen(true);
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

    const cName = formData.companyName.trim();
    if (!cName) {
      errors.companyName = 'Company Name is required.';
    } else if (cName.length > 150) {
      errors.companyName = 'Company Name cannot exceed 150 characters.';
    }

    const ind = formData.industryType.trim();
    if (!ind) {
      errors.industryType = 'Industry Type is required.';
    } else if (ind.length > 100) {
      errors.industryType = 'Industry Type cannot exceed 100 characters.';
    }

    const hr = formData.hrRecruiterName.trim();
    if (!hr) {
      errors.hrRecruiterName = 'HR / Recruiter Name is required.';
    } else if (hr.length > 100) {
      errors.hrRecruiterName = 'HR / Recruiter Name cannot exceed 100 characters.';
    }

    const desig = formData.designation.trim();
    if (!desig) {
      errors.designation = 'Designation is required.';
    } else if (desig.length > 100) {
      errors.designation = 'Designation cannot exceed 100 characters.';
    }

    const emailVal = formData.email.trim();
    if (!emailVal) {
      errors.email = 'Email Address is required.';
    } else if (!EMAIL_REGEX.test(emailVal)) {
      errors.email = 'Please enter a valid email address.';
    } else if (emailVal.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    const mobile = formData.mobileNumber.trim();
    if (!mobile) {
      errors.mobileNumber = 'Mobile number is required.';
    } else if (!isValidMobile(mobile)) {
      errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;
    }

    const yearVal = formData.yearEstablished !== '' ? Number(formData.yearEstablished) : NaN;
    if (formData.yearEstablished === '' || Number.isNaN(yearVal) || !Number.isInteger(yearVal)) {
      errors.yearEstablished = 'Year Established is required (1800–2100).';
    } else if (yearVal < 1800 || yearVal > 2100) {
      errors.yearEstablished = 'Year Established must be between 1800 and 2100.';
    }

    const web = formData.website.trim();
    if (web && web.length > 300) {
      errors.website = 'Website URL cannot exceed 300 characters.';
    }

    const addr = formData.officeAddress.trim();
    if (!addr) {
      errors.officeAddress = 'Office Address is required.';
    } else if (addr.length > 500) {
      errors.officeAddress = 'Office Address cannot exceed 500 characters.';
    }

    const desc = formData.description.trim();
    if (desc && desc.length > 1000) {
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
      setIsEditModalOpen(false);
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

  const handleCopyPublicProfile = () => {
    const companyIdOrSlug = company?.companyId || company?._id || user?.companyId || 'company';
    const publicUrl = `${window.location.origin}/#/companies/${companyIdOrSlug}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(publicUrl);
      toast('Public company profile link copied to clipboard!');
    } else {
      window.location.hash = `#/companies/${companyIdOrSlug}`;
    }
  };

  const companyName = company?.companyName || 'Company Profile';
  const companyId = company?.companyId || user?.companyId || '—';
  const industry = company?.industryType || '—';
  const establishedYear = company?.yearEstablished ? String(company.yearEstablished) : '—';
  const location = company?.officeAddress || '—';
  const website = company?.website || '';
  const hrName = company?.hrRecruiterName || '—';
  const designation = company?.designation || '—';
  const email = company?.email || user?.email || '—';
  const mobile = company?.mobileNumber || '—';
  const description = company?.description || '';

  const cityLabel = (company?.officeAddress || 'Ahmedabad').split(',')[0].trim() || 'Headquarters';

  return (
    <PortalLayout currentPath={window.location.hash.includes('/company-profile') ? '/company-profile' : '/profile'} hideEyebrow={true}>
      <div className="company-profile-page-container">
        {/* Breadcrumb Navigation */}
        <div className="company-profile-breadcrumb">
          <span>Company</span>
          <span>/</span>
          <span className="current">{window.location.hash.includes('/company-profile') ? 'My Company Profile' : 'My Account'}</span>
        </div>

        {/* Top Header Actions */}
        <div className="company-profile-top-header">
          <h1 className="company-profile-title">Company Profile</h1>
          <div className="company-profile-actions">
            <button
              type="button"
              onClick={handleCopyPublicProfile}
              className="company-profile-btn-outline"
            >
              <EyeIcon size={16} />
              <span>View Public Profile</span>
              <ExternalLinkIcon size={14} />
            </button>
            <button
              type="button"
              onClick={handleOpenEdit}
              className="company-profile-btn-primary"
            >
              <EditIcon size={16} />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* Hero Company Card */}
        <div className="company-profile-hero-card">
          <div className="company-profile-hero-content">
            <div className="company-profile-hero-top">
              <div className="company-profile-logo-container">
                <BuildingIcon size={42} color="#2563eb" />
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="company-profile-logo-badge"
                  title="Edit logo/details"
                  aria-label="Edit company profile"
                >
                  <EditIcon size={13} />
                </button>
              </div>
              <div className="company-profile-hero-title-area">
                <h2 className="company-profile-hero-name">{companyName}</h2>
                {companyId !== '—' && (
                  <span className="company-profile-hero-id">{companyId}</span>
                )}
              </div>
            </div>

            {/* Quick Metadata Pills */}
            <div className="company-profile-hero-pills">
              {/* Industry */}
              <div className="company-profile-pill-item">
                <div className="company-profile-pill-icon purple">
                  <BuildingIcon size={18} />
                </div>
                <div className="company-profile-pill-text">
                  <span className="company-profile-pill-value">{industry}</span>
                  <span className="company-profile-pill-label">Industry</span>
                </div>
              </div>

              {/* Established */}
              <div className="company-profile-pill-item">
                <div className="company-profile-pill-icon blue">
                  <CalendarIcon size={18} />
                </div>
                <div className="company-profile-pill-text">
                  <span className="company-profile-pill-value">{establishedYear}</span>
                  <span className="company-profile-pill-label">Established</span>
                </div>
              </div>

              {/* Location */}
              <div className="company-profile-pill-item">
                <div className="company-profile-pill-icon blue">
                  <MapPinIcon size={18} />
                </div>
                <div className="company-profile-pill-text">
                  <span className="company-profile-pill-value">{location}</span>
                  <span className="company-profile-pill-label">Location</span>
                </div>
              </div>

              {/* Website */}
              <div className="company-profile-pill-item">
                <div className="company-profile-pill-icon blue">
                  <LinkIcon size={18} />
                </div>
                <div className="company-profile-pill-text">
                  <span className="company-profile-pill-value">
                    {website ? (
                      <a
                        href={website.startsWith('http') ? website : `https://${website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#2563eb', textDecoration: 'none' }}
                      >
                        {website}
                      </a>
                    ) : (
                      '—'
                    )}
                  </span>
                  <span className="company-profile-pill-label">Website</span>
                </div>
              </div>
            </div>
          </div>

          {/* Modern Glass Architecture Graphic */}
          <div className="company-profile-hero-graphic" aria-hidden="true">
            <svg viewBox="0 0 320 180" width="320" height="180" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="35%" stopColor="#ffffff" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="glassGrad1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1e40af" />
                </linearGradient>
                <linearGradient id="glassGrad2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#93c5fd" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
              </defs>

              <rect width="320" height="180" fill="url(#skyGrad)" />

              {/* Glass Tower 1 */}
              <path d="M120 40L230 15L230 180L120 180Z" fill="url(#glassGrad1)" />
              <path d="M230 15L310 35L310 180L230 180Z" fill="url(#glassGrad2)" />

              {/* Floor Grid Lines */}
              <line x1="120" y1="65" x2="230" y2="40" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6"/>
              <line x1="120" y1="90" x2="230" y2="65" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6"/>
              <line x1="120" y1="115" x2="230" y2="90" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6"/>
              <line x1="120" y1="140" x2="230" y2="115" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6"/>
              <line x1="120" y1="165" x2="230" y2="140" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6"/>

              <line x1="230" y1="40" x2="310" y2="60" stroke="#bfdbfe" strokeWidth="1.5" opacity="0.6"/>
              <line x1="230" y1="65" x2="310" y2="85" stroke="#bfdbfe" strokeWidth="1.5" opacity="0.6"/>
              <line x1="230" y1="90" x2="310" y2="110" stroke="#bfdbfe" strokeWidth="1.5" opacity="0.6"/>
              <line x1="230" y1="115" x2="310" y2="135" stroke="#bfdbfe" strokeWidth="1.5" opacity="0.6"/>
              <line x1="230" y1="140" x2="310" y2="160" stroke="#bfdbfe" strokeWidth="1.5" opacity="0.6"/>

              {/* Vertical Window Mullions */}
              <line x1="150" y1="35" x2="150" y2="180" stroke="#1d4ed8" strokeWidth="1" opacity="0.5"/>
              <line x1="180" y1="30" x2="180" y2="180" stroke="#1d4ed8" strokeWidth="1" opacity="0.5"/>
              <line x1="210" y1="20" x2="210" y2="180" stroke="#1d4ed8" strokeWidth="1" opacity="0.5"/>
              <line x1="260" y1="22" x2="260" y2="180" stroke="#60a5fa" strokeWidth="1" opacity="0.5"/>
              <line x1="290" y1="30" x2="290" y2="180" stroke="#60a5fa" strokeWidth="1" opacity="0.5"/>

              {/* Trees / Greenery at building base */}
              <ellipse cx="140" cy="175" rx="20" ry="12" fill="#15803d" opacity="0.9"/>
              <ellipse cx="180" cy="172" rx="24" ry="14" fill="#16a34a" opacity="0.9"/>
              <ellipse cx="230" cy="174" rx="26" ry="15" fill="#22c55e" opacity="0.85"/>
              <ellipse cx="280" cy="170" rx="30" ry="16" fill="#15803d" opacity="0.9"/>
              <ellipse cx="310" cy="172" rx="20" ry="14" fill="#16a34a" opacity="0.9"/>
            </svg>
          </div>
        </div>

        {/* 2x2 Information Grid */}
        <div className="company-profile-grid">
          {/* Card 1: Company Information */}
          <div className="company-info-card">
            <div className="company-info-card-header">
              <div className="company-info-card-title-group">
                <div className="company-info-card-icon-box">
                  <BuildingIcon size={20} color="#2563eb" />
                </div>
                <h3 className="company-info-card-title">Company Information</h3>
              </div>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="company-info-card-edit-btn"
              >
                <EditIcon size={13} />
                <span>Edit</span>
              </button>
            </div>
            <div className="company-kv-list">
              <div className="company-kv-row">
                <span className="company-kv-key">Company Name</span>
                <span className="company-kv-val">{companyName}</span>
              </div>
              <div className="company-kv-row">
                <span className="company-kv-key">Industry Type</span>
                <span className="company-kv-val">{industry}</span>
              </div>
              <div className="company-kv-row">
                <span className="company-kv-key">Established Year</span>
                <span className="company-kv-val">{establishedYear}</span>
              </div>
              <div className="company-kv-row">
                <span className="company-kv-key">Website URL</span>
                <span className="company-kv-val">
                  {website ? (
                    <a
                      href={website.startsWith('http') ? website : `https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="company-kv-link"
                    >
                      <span>{website}</span>
                      <ExternalLinkIcon size={13} />
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Recruiter Contact */}
          <div className="company-info-card">
            <div className="company-info-card-header">
              <div className="company-info-card-title-group">
                <div className="company-info-card-icon-box">
                  <UserIcon size={20} color="#2563eb" />
                </div>
                <h3 className="company-info-card-title">Recruiter Contact</h3>
              </div>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="company-info-card-edit-btn"
              >
                <EditIcon size={13} />
                <span>Edit</span>
              </button>
            </div>
            <div className="company-kv-list">
              <div className="company-kv-row">
                <span className="company-kv-key">HR / Recruiter Name</span>
                <span className="company-kv-val">{hrName}</span>
              </div>
              <div className="company-kv-row">
                <span className="company-kv-key">Designation / Role</span>
                <span className="company-kv-val">{designation}</span>
              </div>
              <div className="company-kv-row">
                <span className="company-kv-key">Email Address</span>
                <span className="company-kv-val">
                  {email !== '—' ? (
                    <a href={`mailto:${email}`} className="company-kv-link" style={{ color: '#0f172a' }}>
                      <MailIcon size={15} color="#64748b" />
                      <span>{email}</span>
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="company-kv-row">
                <span className="company-kv-key">Mobile Number</span>
                <span className="company-kv-val">
                  {mobile !== '—' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <PhoneIcon size={15} color="#64748b" />
                      <span>{mobile}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Office Location */}
          <div className="company-info-card">
            <div className="company-info-card-header">
              <div className="company-info-card-title-group">
                <div className="company-info-card-icon-box">
                  <MapPinIcon size={20} color="#2563eb" />
                </div>
                <h3 className="company-info-card-title">Office Location</h3>
              </div>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="company-info-card-edit-btn"
              >
                <EditIcon size={13} />
                <span>Edit</span>
              </button>
            </div>
            <div className="company-location-layout">
              <div className="company-location-address-area">
                <span className="company-location-label">Office Address</span>
                <span className="company-location-address">{location}</span>
              </div>

              {/* Map Preview Graphic */}
              <div className="company-map-preview">
                <svg viewBox="0 0 200 110" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="200" height="110" rx="8" fill="#f8fafc" />
                  <path d="M80 0C70 30 110 70 95 110" stroke="#bfdbfe" strokeWidth="18" fill="none" opacity="0.6"/>
                  <path d="M10 10Q35 25 25 50Q15 70 5 80Z" fill="#dcfce7" opacity="0.8"/>
                  <path d="M140 10Q180 20 170 55Q150 75 140 60Z" fill="#dcfce7" opacity="0.8"/>
                  <line x1="0" y1="35" x2="200" y2="35" stroke="#e2e8f0" strokeWidth="3"/>
                  <line x1="0" y1="75" x2="200" y2="75" stroke="#e2e8f0" strokeWidth="3"/>
                  <line x1="45" y1="0" x2="45" y2="110" stroke="#e2e8f0" strokeWidth="3"/>
                  <line x1="145" y1="0" x2="145" y2="110" stroke="#e2e8f0" strokeWidth="3"/>
                  <path d="M0 60Q70 65 100 45Q130 25 200 30" stroke="#fed7aa" strokeWidth="4" fill="none"/>
                  <path d="M30 110Q65 60 120 40Q160 20 180 0" stroke="#fed7aa" strokeWidth="4" fill="none"/>

                  <text x="100" y="22" fontSize="8" fill="#94a3b8" fontWeight="600" textAnchor="middle" letterSpacing="0.05em">CENTRAL DISTRICT</text>

                  {/* Red Location Pin */}
                  <g transform="translate(100, 48)">
                    <ellipse cx="0" cy="18" rx="6" ry="2.5" fill="#000000" opacity="0.18"/>
                    <path d="M0 18L-5 6A7 7 0 1 1 5 6L0 18Z" fill="#ef4444"/>
                    <circle cx="0" cy="4" r="2.5" fill="#ffffff"/>
                    <text x="0" y="27" fontSize="10" fontWeight="800" fill="#0f172a" textAnchor="middle">
                      {cityLabel}
                    </text>
                  </g>
                </svg>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(location !== '—' ? location : cityLabel)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="company-map-expand-btn"
                  title="Open location in Google Maps"
                >
                  <ExternalLinkIcon size={12} />
                </a>
              </div>
            </div>
          </div>

          {/* Card 4: Company Description */}
          <div className="company-info-card">
            <div className="company-info-card-header">
              <div className="company-info-card-title-group">
                <div className="company-info-card-icon-box">
                  <DocumentIcon size={20} color="#2563eb" />
                </div>
                <h3 className="company-info-card-title">Company Description</h3>
              </div>
              <button
                type="button"
                onClick={handleOpenEdit}
                className="company-info-card-edit-btn"
              >
                <EditIcon size={13} />
                <span>Edit</span>
              </button>
            </div>
            <div className="company-desc-box">
              {description ? (
                <p style={{ margin: 0 }}>{description}</p>
              ) : (
                <p className="company-desc-empty" style={{ margin: 0 }}>
                  No corporate overview description provided yet. Click edit to describe your organization.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Edit Company Profile Modal */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Company Profile"
          maxWidth="720px"
        >
          {generalError && (
            <div
              style={{
                background: '#fee2e2',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                marginBottom: '14px'
              }}
            >
              {generalError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="company-edit-modal-form">
            <div className="company-form-grid-2">
              {/* Company Name */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-companyName">
                  Company Name *
                </label>
                <input
                  id="edit-companyName"
                  name="companyName"
                  type="text"
                  className="company-form-input"
                  value={formData.companyName}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.companyName && (
                  <span className="company-form-error">{fieldErrors.companyName}</span>
                )}
              </div>

              {/* Industry Type */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-industryType">
                  Industry Type *
                </label>
                <input
                  id="edit-industryType"
                  name="industryType"
                  type="text"
                  className="company-form-input"
                  value={formData.industryType}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.industryType && (
                  <span className="company-form-error">{fieldErrors.industryType}</span>
                )}
              </div>
            </div>

            <div className="company-form-grid-2">
              {/* Year Established */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-yearEstablished">
                  Year Established *
                </label>
                <select
                  id="edit-yearEstablished"
                  name="yearEstablished"
                  className="company-form-input"
                  value={formData.yearEstablished}
                  onChange={handleChange}
                  disabled={saving}
                >
                  <option value="">Select Year</option>
                  {COMPANY_YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                {fieldErrors.yearEstablished && (
                  <span className="company-form-error">{fieldErrors.yearEstablished}</span>
                )}
              </div>

              {/* Website URL */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-website">
                  Website URL
                </label>
                <input
                  id="edit-website"
                  name="website"
                  type="text"
                  placeholder="https://company.example.com"
                  className="company-form-input"
                  value={formData.website}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.website && (
                  <span className="company-form-error">{fieldErrors.website}</span>
                )}
              </div>
            </div>

            <div className="company-form-grid-2">
              {/* HR Recruiter Name */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-hrRecruiterName">
                  HR / Recruiter Name *
                </label>
                <input
                  id="edit-hrRecruiterName"
                  name="hrRecruiterName"
                  type="text"
                  className="company-form-input"
                  value={formData.hrRecruiterName}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.hrRecruiterName && (
                  <span className="company-form-error">{fieldErrors.hrRecruiterName}</span>
                )}
              </div>

              {/* Designation */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-designation">
                  Designation / Role *
                </label>
                <input
                  id="edit-designation"
                  name="designation"
                  type="text"
                  className="company-form-input"
                  value={formData.designation}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.designation && (
                  <span className="company-form-error">{fieldErrors.designation}</span>
                )}
              </div>
            </div>

            <div className="company-form-grid-2">
              {/* Email Address */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-email">
                  Email Address *
                </label>
                <input
                  id="edit-email"
                  name="email"
                  type="email"
                  className="company-form-input"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.email && (
                  <span className="company-form-error">{fieldErrors.email}</span>
                )}
              </div>

              {/* Mobile Number */}
              <div className="company-form-group">
                <label className="company-form-label" htmlFor="edit-mobileNumber">
                  Mobile Number *
                </label>
                <input
                  id="edit-mobileNumber"
                  name="mobileNumber"
                  type="text"
                  className="company-form-input"
                  value={formData.mobileNumber}
                  onChange={handleChange}
                  disabled={saving}
                />
                {fieldErrors.mobileNumber && (
                  <span className="company-form-error">{fieldErrors.mobileNumber}</span>
                )}
              </div>
            </div>

            {/* Office Address */}
            <div className="company-form-group">
              <label className="company-form-label" htmlFor="edit-officeAddress">
                Office Address *
              </label>
              <textarea
                id="edit-officeAddress"
                name="officeAddress"
                rows={2}
                className="company-form-textarea"
                value={formData.officeAddress}
                onChange={handleChange}
                disabled={saving}
              />
              {fieldErrors.officeAddress && (
                <span className="company-form-error">{fieldErrors.officeAddress}</span>
              )}
            </div>

            {/* Company Description */}
            <div className="company-form-group">
              <label className="company-form-label" htmlFor="edit-description">
                Company Description
              </label>
              <textarea
                id="edit-description"
                name="description"
                rows={3}
                className="company-form-textarea"
                value={formData.description}
                onChange={handleChange}
                disabled={saving}
              />
              {fieldErrors.description && (
                <span className="company-form-error">{fieldErrors.description}</span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                marginTop: '12px'
              }}
            >
              <button
                type="button"
                className="company-profile-btn-outline"
                onClick={() => setIsEditModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="company-profile-btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving Changes…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </PortalLayout>
  );
}
