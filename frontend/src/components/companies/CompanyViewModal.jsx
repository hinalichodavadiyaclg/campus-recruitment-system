import React from 'react';
import { Modal } from '../common/Modal.jsx';

export function CompanyViewModal({
  isOpen,
  company,
  onClose,
  onEdit,
  onManageRecruiters
}) {
  if (!company) return null;

  const websiteHref = company.website
    ? company.website.startsWith('http://') || company.website.startsWith('https://')
      ? company.website
      : `https://${company.website}`
    : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={company.companyName ? `🏢 ${company.companyName}` : 'Company Details'}
      maxWidth="760px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
        {/* Header ID Pill & Subcopy */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted, #64748b)' }}>
            Full organizational profile and registered contact details.
          </p>
          {company.companyId && (
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.82rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: '#e2e8f0',
                color: 'var(--navy, #173b76)'
              }}
            >
              {company.companyId}
            </span>
          )}
        </div>

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
              Organization naming, industry classification, and establishment
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Company Name
              </label>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--ink, #0f172a)' }}>
                {company.companyName || '—'}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Industry Type
              </label>
              <div style={{ fontSize: '0.92rem', color: 'var(--ink, #0f172a)' }}>
                {company.industryType || '—'}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Year Established
              </label>
              <div style={{ fontSize: '0.92rem', color: 'var(--ink, #0f172a)' }}>
                {company.yearEstablished || '—'}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Official Website
              </label>
              <div style={{ fontSize: '0.92rem' }}>
                {websiteHref ? (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link"
                    style={{ wordBreak: 'break-all' }}
                  >
                    {company.website} ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--muted, #64748b)' }}>—</span>
                )}
              </div>
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
              👤 Primary Recruiter Contact
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Primary talent acquisition contact and communication channels
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                HR / Recruiter Name
              </label>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--ink, #0f172a)' }}>
                {company.hrRecruiterName || '—'}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Designation / Role
              </label>
              <div style={{ fontSize: '0.92rem', color: 'var(--ink, #0f172a)' }}>
                {company.designation || '—'}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Email Address
              </label>
              <div style={{ fontSize: '0.92rem' }}>
                {company.email ? (
                  <a href={`mailto:${company.email}`} className="text-link">
                    {company.email}
                  </a>
                ) : (
                  <span style={{ color: 'var(--muted, #64748b)' }}>—</span>
                )}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Mobile Number
              </label>
              <div style={{ fontSize: '0.92rem', color: 'var(--ink, #0f172a)' }}>
                {company.mobileNumber || '—'}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Overview & Location */}
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
              📍 Overview & Office Location
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Registered office address and corporate introduction
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Registered Office Address
              </label>
              <div style={{ fontSize: '0.9rem', color: 'var(--ink, #0f172a)', whiteSpace: 'pre-line' }}>
                {company.officeAddress || '—'}
              </div>
            </div>

            <div className="field">
              <label style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Company Description
              </label>
              <div style={{ fontSize: '0.9rem', color: 'var(--ink, #0f172a)', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                {company.description || '—'}
              </div>
            </div>
          </div>
        </section>

        {/* Modal Actions */}
        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px'
          }}
        >
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
          {onManageRecruiters && (
            <button
              className="secondary"
              type="button"
              onClick={() => {
                onClose();
                onManageRecruiters(company);
              }}
            >
              Manage Recruiters
            </button>
          )}
          {onEdit && (
            <button
              className="primary"
              type="button"
              onClick={() => {
                onClose();
                onEdit(company);
              }}
            >
              Edit Company
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
