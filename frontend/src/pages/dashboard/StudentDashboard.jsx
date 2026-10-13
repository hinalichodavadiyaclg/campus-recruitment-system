import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { studentService } from '../../services/student.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';

function calculateProfileCompletion(student) {
  if (!student) return { percentage: 0, missingItems: [] };

  const checks = [
    { label: 'Basic Information (Name & ID)', complete: Boolean(student.firstName && student.universityId) },
    { label: 'Academic Details (Dept, Sem & CGPA)', complete: Boolean(student.department && student.semester && student.cgpa !== undefined && student.cgpa !== null) },
    { label: 'Profile Photo', complete: Boolean(student.profilePhoto) },
    { label: 'Resume / CV Document', complete: Boolean(student.resume?.url) },
    { label: 'Technical & Domain Skills', complete: Boolean(Array.isArray(student.skills) && student.skills.length > 0) },
    { label: 'Bio & Career Objective', complete: Boolean(student.bio || student.careerObjective) },
    { label: 'LinkedIn or Portfolio Link', complete: Boolean(student.linkedinUrl || student.portfolioUrl || student.githubUrl) },
    { label: 'Projects / Internships / Certifications', complete: Boolean((student.projects?.length || 0) + (student.internships?.length || 0) + (student.certificates?.length || 0) > 0) }
  ];

  const completed = checks.filter((c) => c.complete).length;
  const percentage = Math.round((completed / checks.length) * 100);
  const missingItems = checks.filter((c) => !c.complete).map((c) => c.label);

  return { percentage, missingItems };
}

export function StudentDashboard() {
  const { user } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await studentService.getMyProfile();
        if (mounted) {
          setStudent(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || 'Unable to load student profile.');
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

  const fullName = student?.firstName
    ? `${student.firstName} ${student.lastName || ''}`.trim()
    : user?.name || user?.email?.split('@')[0] || 'Student';

  const { percentage, missingItems } = calculateProfileCompletion(student);

  return (
    <PortalLayout
      title="Student Dashboard"
      subtitle={`Welcome back, ${fullName}! Here is your academic overview and campus recruitment status.`}
      currentPath="/dashboard"
      hideEyebrow={true}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href="#/my-profile"
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
            <span>👤</span>
            <span>View Full Profile</span>
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
            <div style={{ fontWeight: 600, color: '#334155' }}>Loading your personalized academic profile…</div>
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
                Student Profile Notice
              </h3>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.88rem', color: '#b45309' }}>
                {error}
              </p>
              <a
                href="#/my-profile"
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
                Go to My Student Profile
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* ROW 1: Personalized Profile & Academic Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              {/* Card 1: Academic Enrollment */}
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
                    🎓
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Enrolled Department
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                      {student?.department || 'Department Not Specified'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    <strong style={{ color: '#1e293b' }}>Course / Branch:</strong> {student?.branch || student?.course || '—'}
                  </div>
                  <div>
                    <strong style={{ color: '#1e293b' }}>University ID:</strong> {student?.universityId || user?.universityId || '—'}
                  </div>
                </div>
              </div>

              {/* Card 2: Academic Standing & Performance */}
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
                    ⭐
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Current CGPA
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                      {student?.cgpa !== undefined && student?.cgpa !== null ? Number(student.cgpa).toFixed(2) : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#475569' }}>
                  <span>
                    <strong style={{ color: '#1e293b' }}>Semester:</strong> {student?.semester ? `Semester ${student.semester}` : '—'}
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: Number(student?.backlogs) > 0 ? '#fee2e2' : '#dcfce7',
                      color: Number(student?.backlogs) > 0 ? '#b91c1c' : '#15803d'
                    }}
                  >
                    {Number(student?.backlogs) > 0 ? `${student.backlogs} Backlog(s)` : '0 Backlogs'}
                  </span>
                </div>
              </div>

              {/* Card 3: Passing Year & Graduation */}
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
                      background: '#f3e8ff',
                      color: '#9333ea',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      flexShrink: 0
                    }}
                  >
                    🗓️
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Passing Year
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                      {student?.passingYear || '—'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                  <strong style={{ color: '#1e293b' }}>Placement Status:</strong>{' '}
                  <span style={{ color: '#059669', fontWeight: 600 }}>Active Candidate</span>
                </div>
              </div>

              {/* Card 4: Profile Completion Readiness */}
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
                    {percentage === 100 ? 'Ready for placement drives' : `${missingItems.length} item(s) pending`}
                  </span>
                  <a
                    href="#/my-profile"
                    style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Edit →
                  </a>
                </div>
              </div>
            </div>

            {/* ROW 2: Recruitment Pipeline Metrics (Scoped to authenticated student) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              {/* Metric 1: Eligible Jobs */}
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
                    Eligible Job Drives
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  No active drives posted yet
                </div>
              </div>

              {/* Metric 2: Applications Submitted */}
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
                  <span style={{ fontSize: '1.3rem' }}>📄</span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    My Applications
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  0 Submitted applications
                </div>
              </div>

              {/* Metric 3: Upcoming Interviews */}
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
                    Upcoming Interviews
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  No interviews scheduled
                </div>
              </div>

              {/* Metric 4: Placement Offers */}
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
                  <span style={{ fontSize: '1.3rem' }}>🎯</span>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Placement Offers
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  0 Job offers received
                </div>
              </div>
            </div>

            {/* ROW 3: Student Details & Quick Actions */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1.15fr) minmax(280px, 0.9fr)',
                gap: '20px'
              }}
            >
              {/* Panel 1: Applications & Job Drives */}
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
                    My Job Applications
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Track your current recruitment application stages
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
                  <div style={{ fontSize: '2rem', opacity: 0.6 }}>📂</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                    No applications submitted yet
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: '300px' }}>
                    Once recruiters publish campus drives and you apply, your application stage and updates will appear here.
                  </div>
                </div>
              </div>

              {/* Panel 2: Placement Announcements & Interviews */}
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
                    Announcements & Interviews
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Notices published by the Campus Placement Cell
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
                  <div style={{ fontSize: '2rem', opacity: 0.6 }}>📢</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#475569' }}>
                    No announcements today
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: '300px' }}>
                    Important drive dates, eligibility guidelines, and interview schedules will be posted here.
                  </div>
                </div>
              </div>

              {/* Panel 3: Student Quick Actions */}
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
                    Quick Actions
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Manage your profile and credentials
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                  <a
                    href="#/my-profile"
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
                      👤
                    </div>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        View My Profile
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Review your academic & resume details
                      </div>
                    </div>
                  </a>

                  <a
                    href="#/my-profile"
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
                        Edit My Profile
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Update photo, skills, and resume
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
                        Manage account email and credentials
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
                        Keep your account secure
                      </div>
                    </div>
                  </a>

                  {student?._id && student?.isPublicProfile !== false && (
                    <a
                      href={`#/student-profile/${student._id}`}
                      target="_blank"
                      rel="noopener noreferrer"
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
                        🌐
                      </div>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                          Public Profile Link
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                          Preview shareable profile card
                        </div>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
