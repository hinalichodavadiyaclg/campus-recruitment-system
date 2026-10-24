import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { studentService } from '../../services/student.service.js';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { notificationService } from '../../services/notification.service.js';
import { formatTimeAgo } from '../../utils/time-helpers.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import {
  UserIcon,
  BriefcaseIcon,
  DocumentIcon,
  CalendarIcon,
  TrophyIcon,
  MegaphoneIcon,
  EditIcon,
  SettingsIcon,
  KeyIcon,
  LinkIcon,
  ChevronRightIcon,
  CheckCircleIcon
} from '../../components/common/Icons.jsx';
import './StudentDashboard.css';

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
    { label: 'Naandi Training Certificate', complete: Boolean(student.naandiCertificate?.url || student.certificates?.some(c => c.name?.toLowerCase().includes('naandi') || c.type === 'NAANDI')) },
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
  const [toastMessage, setToastMessage] = useState('');

  // Real data collections loaded from backend (clean empty states when no records exist)
  const [recentJobs, setRecentJobs] = useState([]);
  const [jobPostingsCount, setJobPostingsCount] = useState(0);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [offersCount, setOffersCount] = useState(0);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [interviewsCount, setInterviewsCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [profileRes, jobsRes, appsRes, placedRes, interviewRes, notifRes] = await Promise.allSettled([
          studentService.getMyProfile(),
          jobService.listJobs({ limit: 5 }),
          applicationService.listApplications({ limit: 50 }),
          applicationService.listApplications({ status: 'SELECTED', limit: 1 }),
          applicationService.listApplications({ status: 'INTERVIEW', limit: 10 }),
          notificationService.getNotifications({ limit: 5 })
        ]);

        if (mounted) {
          if (profileRes.status === 'fulfilled') {
            setStudent(profileRes.value);
          }
          if (jobsRes.status === 'fulfilled') {
            const jList = jobsRes.value?.jobs || jobsRes.value?.items || [];
            setRecentJobs(jList);
            setJobPostingsCount(jobsRes.value?.total ?? jobsRes.value?.pagination?.total ?? jList.length);
          }
          if (appsRes.status === 'fulfilled') {
            const aList = appsRes.value?.items || [];
            setApplicationsCount(appsRes.value?.total ?? aList.length);
          }
          if (placedRes.status === 'fulfilled') {
            setOffersCount(placedRes.value?.total ?? 0);
          } else if (appsRes.status === 'fulfilled') {
            const offers = (appsRes.value?.items || []).filter((a) => a.status === 'SELECTED').length;
            setOffersCount(offers);
          }
          if (interviewRes.status === 'fulfilled') {
            const intList = interviewRes.value?.items || [];
            setUpcomingInterviews(intList);
            setInterviewsCount(interviewRes.value?.total ?? intList.length);
          } else if (appsRes.status === 'fulfilled') {
            const intList = (appsRes.value?.items || []).filter((a) => a.status === 'INTERVIEW');
            setUpcomingInterviews(intList);
            setInterviewsCount(intList.length);
          }
          if (notifRes.status === 'fulfilled') {
            const notifs = notifRes.value?.items || notifRes.value?.data || [];
            setAnnouncements(
              notifs.map((n) => ({
                id: n._id || n.id,
                title: n.title || 'Campus Notification',
                message: n.message || '',
                date: n.createdAt ? formatTimeAgo(n.createdAt) : 'Recently'
              }))
            );
          }
        }
      } catch (_err) {
        // Fallback gracefully
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

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleCopyPublicProfile = (e) => {
    e.preventDefault();
    const studentId = student?.universityId || user?.universityId || 'STU2026010';
    const publicUrl = `${window.location.origin}/#/public/student/${studentId}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(publicUrl);
      showToast('Public profile link copied to clipboard!');
    } else {
      window.location.hash = `#/my-profile`;
    }
  };

  // Dynamic Greeting based on current time
  const currentHour = new Date().getHours();
  const greetingText =
    currentHour < 12 ? 'Good Morning' : currentHour < 17 ? 'Good Afternoon' : 'Good Evening';

  const firstName = student?.firstName || user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Student';
  const lastName = student?.lastName || (user?.name?.split(' ').slice(1).join(' ') || '');
  const fullName = `${firstName} ${lastName}`.trim();
  const initials = `${firstName.charAt(0)}${lastName ? lastName.charAt(0) : ''}`.toUpperCase() || 'ST';

  const degree = student?.course || student?.courseName || '';
  const branch = student?.branch || student?.department || '';
  const studentId = student?.universityId || user?.universityId || user?.employeeId || '—';

  const { percentage } = calculateProfileCompletion(student);

  // Radial progress calculations
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Calendar Date Formats
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const fullDate = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

  return (
    <PortalLayout currentPath="/dashboard" hideEyebrow={true}>
      <div className="student-dashboard-container">
        {toastMessage && (
          <div
            style={{
              position: 'fixed',
              top: '20px',
              right: '24px',
              zIndex: 9999,
              background: '#0f172a',
              color: '#ffffff',
              padding: '10px 18px',
              borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
              fontSize: '0.88rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'fadeIn 0.2s ease-in-out'
            }}
          >
            <CheckCircleIcon size={16} color="#10b981" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. TOP GREETING & DATE BAR */}
        <div className="student-greeting-bar">
          <h1 className="student-greeting-text">
            {greetingText}, {firstName}! ☀️
          </h1>
          <div className="student-date-card">
            <div className="student-date-icon">
              <CalendarIcon size={20} color="#2563eb" />
            </div>
            <div className="student-date-info">
              <span className="student-date-weekday">{weekday}</span>
              <span className="student-date-full">{fullDate}</span>
            </div>
          </div>
        </div>

        {/* 2. HERO PROFILE CARD */}
        <div className="student-hero-card">
          {/* Left: Avatar & Profile Details */}
          <div className="student-hero-left">
            <div className="student-hero-avatar">
              {initials}
            </div>
            <div className="student-hero-info">
              <div className="student-hero-name-row">
                <h2 className="student-hero-name">{fullName}</h2>
                <span className="student-hero-status-badge">
                  <CheckCircleIcon size={13} color="#059669" />
                  {student ? 'Active Candidate' : 'Candidate'}
                </span>
              </div>
              <div className="student-hero-academic">
                {degree && branch ? (
                  <>
                    <span>{degree}</span>
                    <span className="sep">|</span>
                    <span>{branch}</span>
                  </>
                ) : degree || branch ? (
                  <span>{degree || branch}</span>
                ) : (
                  <span>Academic details not specified</span>
                )}
              </div>
              <div className="student-hero-id">
                ID: {studentId}
              </div>
            </div>
          </div>

          {/* Middle: Profile Completion Gauge */}
          <div className="student-hero-middle">
            <div className="student-radial-ring-container">
              <svg className="student-radial-ring-svg" viewBox="0 0 76 76">
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  stroke="#e2e8f0"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="38"
                  cy="38"
                  r={radius}
                  stroke="#10b981"
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <span className="student-radial-ring-percent">{percentage}%</span>
            </div>
            <span className="student-radial-label">Profile Completion</span>
            <a href="#/my-profile" className="student-edit-profile-btn">
              <span>Edit Profile</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          {/* Right: Graduation Cap & Books Artwork */}
          <div className="student-hero-illustration" aria-hidden="true">
            <svg viewBox="0 0 160 110" width="160" height="110" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Soft decorative background leaves */}
              <path d="M130 90C130 90 145 75 140 55C135 68 125 74 125 74" fill="#dbeafe" opacity="0.6"/>
              <path d="M142 85C142 85 152 70 145 58C142 66 136 71 136 71" fill="#bfdbfe" opacity="0.5"/>
              <path d="M25 80C25 80 15 65 22 50C25 60 32 66 32 66" fill="#dbeafe" opacity="0.6"/>
              <path d="M15 75C15 75 8 62 16 52C18 60 24 64 24 64" fill="#bfdbfe" opacity="0.5"/>

              {/* Bottom Book */}
              <rect x="35" y="86" width="90" height="12" rx="3" fill="#2563eb" />
              <rect x="38" y="88" width="84" height="2" fill="#60a5fa" opacity="0.6"/>
              <rect x="40" y="93" width="78" height="3" fill="#ffffff" opacity="0.8"/>
              <rect x="33" y="85" width="6" height="14" rx="2" fill="#1d4ed8"/>

              {/* Middle Book */}
              <rect x="42" y="72" width="76" height="12" rx="3" fill="#3b82f6" />
              <rect x="45" y="74" width="70" height="2" fill="#93c5fd" opacity="0.6"/>
              <rect x="46" y="79" width="68" height="3" fill="#ffffff" opacity="0.8"/>
              <rect x="40" y="71" width="5" height="14" rx="2" fill="#2563eb"/>

              {/* Graduation Cap Base */}
              <path d="M60 52C60 52 60 62 80 62C100 62 100 52 100 52Z" fill="#1e3a8a"/>
              <path d="M62 53C62 53 62 60 80 60C98 60 98 53 98 53Z" fill="#1d4ed8"/>

              {/* Diamond Cap Top */}
              <polygon points="80,32 125,44 80,56 35,44" fill="#1e40af"/>
              <polygon points="80,32 125,44 80,47 35,44" fill="#3b82f6" opacity="0.5"/>
              <polygon points="80,32 35,44 80,56" fill="#1d4ed8" opacity="0.8"/>

              {/* Tassel Button & String */}
              <ellipse cx="80" cy="44" rx="3.5" ry="2" fill="#f59e0b"/>
              <path d="M80 44C88 47 96 52 98 58C99 61 99 66 99 70" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <rect x="96" y="68" width="6" height="10" rx="1.5" fill="#f59e0b"/>
              <line x1="97" y1="78" x2="97" y2="82" stroke="#d97706" strokeWidth="1"/>
              <line x1="99" y1="78" x2="99" y2="82" stroke="#d97706" strokeWidth="1"/>
              <line x1="101" y1="78" x2="101" y2="82" stroke="#d97706" strokeWidth="1"/>
            </svg>
          </div>
        </div>

        {/* 3. FOUR METRICS CARDS ROW */}
        <div className="student-metrics-grid">
          {/* Card 1: Opportunities */}
          <a href="#/jobs" className="student-metric-card" title="Available Job Opportunities">
            <div className="student-metric-left">
              <div className="student-metric-icon-box blue">
                <BriefcaseIcon size={22} color="#0284c7" />
              </div>
              <div className="student-metric-details">
                <span className="student-metric-value">{jobPostingsCount}</span>
                <span className="student-metric-label">Opportunities</span>
              </div>
            </div>
            <div className="student-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>

          {/* Card 2: Applications */}
          <a href="#/applications" className="student-metric-card" title="Submitted Applications">
            <div className="student-metric-left">
              <div className="student-metric-icon-box purple">
                <DocumentIcon size={22} color="#9333ea" />
              </div>
              <div className="student-metric-details">
                <span className="student-metric-value">{applicationsCount}</span>
                <span className="student-metric-label">Applications</span>
              </div>
            </div>
            <div className="student-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>

          {/* Card 3: Interviews */}
          <a href="#/interviews" className="student-metric-card" title="Scheduled Interviews">
            <div className="student-metric-left">
              <div className="student-metric-icon-box green">
                <CalendarIcon size={22} color="#16a34a" />
              </div>
              <div className="student-metric-details">
                <span className="student-metric-value">{interviewsCount}</span>
                <span className="student-metric-label">Interviews</span>
              </div>
            </div>
            <div className="student-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>

          {/* Card 4: Offers */}
          <a href="#/placements" className="student-metric-card" title="Received Job Offers">
            <div className="student-metric-left">
              <div className="student-metric-icon-box orange">
                <TrophyIcon size={22} color="#d97706" />
              </div>
              <div className="student-metric-details">
                <span className="student-metric-value">{offersCount}</span>
                <span className="student-metric-label">Offers</span>
              </div>
            </div>
            <div className="student-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>
        </div>

        {/* 4. MIDDLE TWO-COLUMN GRID: Recent Opportunities & Upcoming Interviews */}
        <div className="student-two-col-grid">
          {/* Column 1: Recent Opportunities */}
          <div className="student-section-col">
            <div className="student-section-header">
              <h3 className="student-section-title">Recent Opportunities</h3>
              <a href="#/jobs" className="student-view-all-link">
                <span>View All</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="student-card-list">
              {recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <a key={job._id || job.id} href="#/jobs" className="student-list-row">
                    <div className="student-list-left">
                      <div className="student-company-avatar tn">
                        {((job.companyId?.companyName || job.companyName || 'CO')).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="student-list-info">
                        <span className="student-list-primary">{job.companyId?.companyName || job.companyName || 'Company'}</span>
                        <span className="student-list-secondary">{job.title || job.role}</span>
                      </div>
                    </div>
                    <div className="student-list-right">
                      <span className={`student-pill-badge ${job.status?.toLowerCase() || 'open'}`}>{job.status || 'Open'}</span>
                      <div className="student-chevron-arrow">
                        <ChevronRightIcon size={16} />
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="student-empty-state">
                  <div className="student-empty-icon">
                    <BriefcaseIcon size={20} />
                  </div>
                  <p className="student-empty-title">No data found</p>
                  <p className="student-empty-desc">No active job opportunities are available at this time.</p>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Upcoming Interviews */}
          <div className="student-section-col">
            <div className="student-section-header">
              <h3 className="student-section-title">Upcoming Interviews</h3>
              <a href="#/applications" className="student-view-all-link">
                <span>View All</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="student-card-list">
              {upcomingInterviews.length > 0 ? (
                upcomingInterviews.map((interview) => {
                  const compName = interview.companyId?.companyName || interview.jobSnapshot?.companyName || 'Company';
                  const roleTitle = interview.jobSnapshot?.title || interview.jobId?.title || 'Recruitment Interview';
                  return (
                    <a key={interview._id || interview.id} href="#/applications" className="student-list-row">
                      <div className="student-list-left">
                        <div className="student-company-avatar tn">
                          {compName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="student-list-info">
                          <span className="student-list-primary">{compName}</span>
                          <span className="student-list-secondary">{roleTitle} • Round {interview.recruitmentRound || 1}</span>
                        </div>
                      </div>
                      <div className="student-list-right">
                        <span className="student-pill-badge online">Interview</span>
                        <div className="student-chevron-arrow">
                          <ChevronRightIcon size={16} />
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="student-empty-state">
                  <div className="student-empty-icon">
                    <CalendarIcon size={20} />
                  </div>
                  <p className="student-empty-title">No data found</p>
                  <p className="student-empty-desc">You have no scheduled interviews at this time.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. BOTTOM TWO-COLUMN GRID: Announcements & Quick Actions */}
        <div className="student-two-col-grid">
          {/* Column 1: Announcements */}
          <div className="student-section-col">
            <div className="student-section-header">
              <h3 className="student-section-title">Announcements</h3>
              <a href="#/notifications" className="student-view-all-link">
                <span>View All</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="student-card-list">
              {announcements.length > 0 ? (
                announcements.map((item) => (
                  <a key={item.id} href="#/notifications" className="student-list-row">
                    <div className="student-list-left">
                      <div className="student-announcement-icon-box">
                        <MegaphoneIcon size={20} color="#2563eb" />
                      </div>
                      <div className="student-list-info">
                        <span className="student-list-primary">{item.title}</span>
                        <span className="student-list-secondary">
                          {item.message ? `${item.message.slice(0, 48)}... • ` : ''}{item.date}
                        </span>
                      </div>
                    </div>
                    <div className="student-chevron-arrow">
                      <ChevronRightIcon size={16} />
                    </div>
                  </a>
                ))
              ) : (
                <div className="student-empty-state">
                  <div className="student-empty-icon">
                    <MegaphoneIcon size={20} />
                  </div>
                  <p className="student-empty-title">No data found</p>
                  <p className="student-empty-desc">No campus announcements or notifications have been posted yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Quick Actions */}
          <div className="student-section-col">
            <div className="student-section-header">
              <h3 className="student-section-title">Quick Actions</h3>
            </div>
            <div className="student-quick-actions-grid">
              {/* Action 1: View Profile */}
              <a href="#/my-profile" className="student-action-card view-profile">
                <UserIcon size={22} color="#2563eb" />
                <span className="student-action-label">View Profile</span>
              </a>

              {/* Action 2: Edit Profile */}
              <a href="#/my-profile" className="student-action-card edit-profile">
                <EditIcon size={22} color="#9333ea" />
                <span className="student-action-label">Edit Profile</span>
              </a>

              {/* Action 3: My Account */}
              <a href="#/profile" className="student-action-card my-account">
                <SettingsIcon size={22} color="#16a34a" />
                <span className="student-action-label">My Account</span>
              </a>

              {/* Action 4: Change Password */}
              <a href="#/profile" className="student-action-card change-pwd">
                <KeyIcon size={22} color="#d97706" />
                <span className="student-action-label">Change Password</span>
              </a>

              {/* Action 5: Public Profile */}
              <button
                type="button"
                onClick={handleCopyPublicProfile}
                className="student-action-card public-profile"
                style={{ background: '#fff1f2', border: '1px solid #ffe4e6', width: '100%' }}
              >
                <LinkIcon size={22} color="#e11d48" />
                <span className="student-action-label">Public Profile</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
