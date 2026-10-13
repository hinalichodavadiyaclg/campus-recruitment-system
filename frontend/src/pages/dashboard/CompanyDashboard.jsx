import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { companyService } from '../../services/company.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';

function calculateCompanyProfileCompletion(company) {
  if (!company) return { percentage: 0, missingItems: [] };

  const checks = [
    { label: 'Company Name & Business Identifier', complete: Boolean(company.companyName && company.companyId) },
    { label: 'Industry Sector', complete: Boolean(company.industryType) },
    { label: 'HR / Recruiter Contact Name', complete: Boolean(company.hrRecruiterName) },
    { label: 'Recruiter Contact Email', complete: Boolean(company.email) },
    { label: 'Corporate Website URL', complete: Boolean(company.website) },
    { label: 'Office Address / Location', complete: Boolean(company.officeAddress || company.location) },
    { label: 'Company Overview Description', complete: Boolean(company.description) },
    { label: 'Contact Telephone / Mobile', complete: Boolean(company.mobileNumber) },
    { label: 'Year Established', complete: Boolean(company.yearEstablished) }
  ];

  const completed = checks.filter((c) => c.complete).length;
  const percentage = Math.round((completed / checks.length) * 100);
  const missingItems = checks.filter((c) => !c.complete).map((c) => c.label);

  return { percentage, missingItems };
}

export function CompanyDashboard() {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await companyService.getMyProfile();
        if (mounted) {
          setCompany(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || 'Unable to load company profile.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const recruiterName = company?.hrRecruiterName || user?.name || user?.email?.split('@')[0] || 'Recruiter';
  const companyName = company?.companyName || 'Your Company';
  const { percentage, missingItems } = calculateCompanyProfileCompletion(company);

  return (
    <PortalLayout
      title="Company Dashboard"
      subtitle={`Welcome back, ${recruiterName}! Recruitment overview and applicant status for ${companyName}.`}
      currentPath="/dashboard"
      hideEyebrow={true}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href="#/company-profile"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#1e293b',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              textDecoration: 'none'
            }}
          >
            <span>🏢</span>
            <span>Company Profile</span>
          </a>
        </div>
      }
    >
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {loading ? (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              color: '#64748b',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              marginBottom: '20px'
            }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>⏳</div>
            <div style={{ fontWeight: 600, color: '#334155' }}>Loading company recruitment portal…</div>
          </div>
        ) : error ? (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px'
            }}
          >
            <span style={{ fontSize: '1.8rem' }}>⚠️</span>
            <div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#92400e', fontWeight: 700 }}>
                Company Account Notice
              </h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.88rem', color: '#b45309' }}>
                {error}
              </p>
              <a
                href="#/company-profile"
                style={{
                  display: 'inline-block',
                  background: '#d97706',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                Go to Company Profile
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* ROW 1: Company Profile Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              {/* Card 1: Registered Company Identifier */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '10px',
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      flexShrink: 0
                    }}
                  >
                    🏢
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Registered Company
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {company?.companyName || 'Corporate Partner'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    <strong style={{ color: '#1e293b' }}>Business ID:</strong> {company?.companyId || '—'}
                  </div>
                  <div>
                    <strong style={{ color: '#1e293b' }}>Industry:</strong> {company?.industryType || 'Corporate'}
                  </div>
                </div>
              </div>

              {/* Card 2: Recruiter Contact Information */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '10px',
                      background: '#dcfce7',
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      flexShrink: 0
                    }}
                  >
                    👤
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      HR Recruiter
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {company?.hrRecruiterName || 'HR Lead'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    <strong style={{ color: '#1e293b' }}>Email:</strong> {company?.email || user?.email || '—'}
                  </div>
                  <div>
                    <strong style={{ color: '#1e293b' }}>Phone:</strong> {company?.mobileNumber || '—'}
                  </div>
                </div>
              </div>

              {/* Card 3: Location & Corporate Presence */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '10px',
                      background: '#fef3c7',
                      color: '#d97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      flexShrink: 0
                    }}
                  >
                    📍
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Location & Web
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {company?.officeAddress || company?.location || 'Location Not Specified'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                  <strong style={{ color: '#1e293b' }}>Website:</strong>{' '}
                  {company?.website ? (
                    <a
                      href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'none' }}
                    >
                      {company.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              {/* Card 4: Company Profile Completion */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Profile Completion
                    </div>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: percentage === 100 ? '#16a34a' : '#2563eb' }}>
                      {percentage}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: '100%',
                        background: percentage === 100 ? '#16a34a' : percentage >= 75 ? '#2563eb' : '#d97706',
                        borderRadius: '4px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {percentage === 100 ? 'Company profile complete' : `${missingItems.length} detail(s) recommended`}
                  </span>
                  <a
                    href="#/company-profile"
                    style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Edit →
                  </a>
                </div>
              </div>
            </div>

            {/* ROW 2: Recruitment Pipeline Metrics (Scoped to authorized company) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              {/* Metric 1: Company Job Openings */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.3rem' }}>💼</span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Active Job Drives
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  0 Openings posted
                </div>
              </div>

              {/* Metric 2: Total Applicants Received */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.3rem' }}>👥</span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Total Applicants
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  0 Candidates applied
                </div>
              </div>

              {/* Metric 3: Scheduled Interviews */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.3rem' }}>📅</span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Candidate Interviews
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  0 Interviews scheduled
                </div>
              </div>

              {/* Metric 4: Shortlisted Candidates */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.3rem' }}>⭐</span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Shortlisted Candidates
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  0 Candidates shortlisted
                </div>
              </div>
            </div>

            {/* ROW 3: Recruitment Panels & Actions */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1.15fr) minmax(280px, 0.9fr)',
                gap: '20px'
              }}
            >
              {/* Panel 1: Company Postings & Pipeline */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ marginBottom: '18px' }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    Recruitment Drives & Postings
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Active job drives published for ${companyName}
                  </p>
                </div>

                <div
                  style={{
                    padding: '44px 16px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ fontSize: '2rem', opacity: 0.6 }}>💼</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                    No job drives published
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: '300px' }}>
                    Job postings and candidate applications for ${companyName} will be monitored here once recruitment drives begin.
                  </div>
                </div>
              </div>

              {/* Panel 2: Scheduled Interviews & Coordination */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ marginBottom: '18px' }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    Interviews & Notifications
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Candidate interview sessions and placement notices
                  </p>
                </div>

                <div
                  style={{
                    padding: '44px 16px',
                    textAlign: 'center',
                    color: '#94a3b8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ fontSize: '2rem', opacity: 0.6 }}>📅</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                    No interviews scheduled
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: '300px' }}>
                    Candidate assessment schedules and placement cell coordination alerts will appear here.
                  </div>
                </div>
              </div>

              {/* Panel 3: Recruiter Quick Actions */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ marginBottom: '18px' }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                    Recruiter Actions
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Company management shortcuts
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  <a
                    href="#/company-profile"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#93c5fd';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        flexShrink: 0
                      }}
                    >
                      🏢
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        View Company Profile
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Review details and recruiter team
                      </div>
                    </div>
                  </a>

                  <a
                    href="#/company-profile"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#93c5fd';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        flexShrink: 0
                      }}
                    >
                      ✏️
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        Edit Company Details
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Update contact and description
                      </div>
                    </div>
                  </a>

                  <a
                    href="#/students"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#86efac';
                      e.currentTarget.style.background = '#f0fdf4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#dcfce7',
                        color: '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        flexShrink: 0
                      }}
                    >
                      👥
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        Browse Eligible Candidates
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Review registered student profiles
                      </div>
                    </div>
                  </a>

                  <a
                    href="#/profile"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#93c5fd';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#f1f5f9',
                        color: '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        flexShrink: 0
                      }}
                    >
                      ⚙️
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        My Account
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Recruiter login credentials
                      </div>
                    </div>
                  </a>

                  <a
                    href="#/change-password"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#93c5fd';
                      e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.background = '#ffffff';
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#fef3c7',
                        color: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        flexShrink: 0
                      }}
                    >
                      🔑
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        Change Password
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Manage recruiter account security
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
