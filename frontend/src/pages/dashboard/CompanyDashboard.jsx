import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { companyService } from '../../services/company.service.js';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import {
  BuildingIcon,
  BriefcaseIcon,
  DocumentIcon,
  CalendarIcon,
  AwardIcon,
  UsersIcon,
  PlusIcon,
  MapPinIcon,
  GlobeIcon,
  ChevronRightIcon
} from '../../components/common/Icons.jsx';
import './CompanyDashboard.css';

export function CompanyDashboard() {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  // Real data collections loaded from backend (clean empty states when no records exist)
  const [recentJobs, setRecentJobs] = useState([]);
  const [recentApplications, setRecentApplications] = useState([]);
  const [jobPostingsCount, setJobPostingsCount] = useState(0);
  const [applicationsCount, setApplicationsCount] = useState(0);
  const [placementsCount, setPlacementsCount] = useState(0);
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [interviewsCount, setInterviewsCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [profileRes, jobsRes, appsRes, placedRes, interviewRes] = await Promise.allSettled([
          companyService.getMyProfile(),
          jobService.listJobs({ limit: 5 }),
          applicationService.listApplications({ limit: 50 }),
          applicationService.listApplications({ status: 'SELECTED', limit: 1 }),
          applicationService.listApplications({ status: 'INTERVIEW', limit: 10 })
        ]);

        if (mounted) {
          if (profileRes.status === 'fulfilled') {
            setCompany(profileRes.value);
          }
          if (jobsRes.status === 'fulfilled') {
            const jList = jobsRes.value?.jobs || jobsRes.value?.items || [];
            setRecentJobs(jList);
            setJobPostingsCount(jobsRes.value?.total ?? jobsRes.value?.pagination?.total ?? jList.length);
          }
          if (appsRes.status === 'fulfilled') {
            const aList = appsRes.value?.items || [];
            setRecentApplications(aList.slice(0, 5));
            setApplicationsCount(appsRes.value?.total ?? aList.length);
          }
          if (placedRes.status === 'fulfilled') {
            setPlacementsCount(placedRes.value?.total ?? 0);
          } else if (appsRes.status === 'fulfilled') {
            const placed = (appsRes.value?.items || []).filter((a) => a.status === 'SELECTED').length;
            setPlacementsCount(placed);
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
        }
      } catch (_err) {
        // Fallback gracefully to authenticated session details
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

  // Dynamic Greeting based on current time
  const currentHour = new Date().getHours();
  const greetingText =
    currentHour < 12 ? 'Good Morning' : currentHour < 17 ? 'Good Afternoon' : 'Good Evening';

  const recruiterFirstName =
    company?.hrRecruiterName?.split(' ')[0] ||
    user?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'Recruiter';

  const companyName = company?.companyName || 'Company Profile';
  const companyId = company?.companyId || user?.companyId || '—';
  const industry = company?.industryType || 'Corporate';
  const establishedYear = company?.yearEstablished || '—';
  const location = company?.officeAddress || company?.location || 'Location Not Specified';
  const website = company?.website || '—';

  // Live Calendar Dates
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

  return (
    <PortalLayout currentPath="/dashboard" hideEyebrow={true}>
      <div className="company-dashboard-container">
        {/* Breadcrumb Navigation */}
        <div className="company-breadcrumb">
          <span>Campus Recruit</span>
          <span>/</span>
          <span className="current">Company Recruiter Dashboard</span>
        </div>

        {/* 1. GREETING & DATE BAR */}
        <div className="company-greeting-bar">
          <div className="company-greeting-left">
            <h1 className="company-greeting-text">
              {greetingText}, {recruiterFirstName}! 👋
            </h1>
            <p className="company-greeting-sub">
              Here's an overview of your recruitment activity.
            </p>
          </div>
          <div className="company-date-card">
            <div className="company-date-icon">
              <CalendarIcon size={20} color="#2563eb" />
            </div>
            <div className="company-date-info">
              <span className="company-date-weekday">{weekday}</span>
              <span className="company-date-full">{fullDate}</span>
            </div>
          </div>
        </div>

        {/* 2. HERO COMPANY CARD */}
        <div className="company-hero-card">
          <div className="company-hero-main">
            <div className="company-hero-header-left">
              <div className="company-hero-logo-box">
                <BuildingIcon size={28} color="#2563eb" />
              </div>
              <div>
                <div className="company-hero-title-row">
                  <h2 className="company-hero-name">{companyName}</h2>
                  {companyId !== '—' && (
                    <span className="company-hero-id-badge">{companyId}</span>
                  )}
                </div>
              </div>
            </div>
            <a href="#/company-profile" className="company-hero-view-profile-btn">
              <span>View Company Profile</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          {/* Metadata Row */}
          <div className="company-hero-metadata-row">
            {/* Industry */}
            <div className="company-meta-item">
              <div className="company-meta-icon">
                <BuildingIcon size={18} color="#2563eb" />
              </div>
              <div className="company-meta-text">
                <span className="company-meta-label">Industry</span>
                <span className="company-meta-value">{industry}</span>
              </div>
            </div>

            {/* Established */}
            <div className="company-meta-item">
              <div className="company-meta-icon">
                <CalendarIcon size={18} color="#2563eb" />
              </div>
              <div className="company-meta-text">
                <span className="company-meta-label">Established</span>
                <span className="company-meta-value">{establishedYear}</span>
              </div>
            </div>

            {/* Location */}
            <div className="company-meta-item">
              <div className="company-meta-icon">
                <MapPinIcon size={18} color="#2563eb" />
              </div>
              <div className="company-meta-text">
                <span className="company-meta-label">Location</span>
                <span className="company-meta-value">{location}</span>
              </div>
            </div>

            {/* Website */}
            <div className="company-meta-item">
              <div className="company-meta-icon">
                <GlobeIcon size={18} color="#2563eb" />
              </div>
              <div className="company-meta-text">
                <span className="company-meta-label">Website</span>
                <span className="company-meta-value">
                  {website !== '—' ? (
                    <a
                      href={website.startsWith('http') ? website : `https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#0f172a', textDecoration: 'none' }}
                    >
                      {website}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* City Skyline Background Illustration */}
          <div className="company-hero-illustration" aria-hidden="true">
            <svg viewBox="0 0 170 110" width="170" height="110" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="135" cy="45" r="32" fill="#eff6ff" opacity="0.8"/>
              <circle cx="135" cy="45" r="22" fill="#dbeafe" opacity="0.6"/>

              {/* Background Buildings */}
              <rect x="75" y="48" width="22" height="62" rx="2" fill="#cbd5e1" opacity="0.5"/>
              <rect x="135" y="40" width="24" height="70" rx="2" fill="#cbd5e1" opacity="0.6"/>
              <rect x="140" y="48" width="4" height="6" rx="1" fill="#ffffff" opacity="0.7"/>
              <rect x="148" y="48" width="4" height="6" rx="1" fill="#ffffff" opacity="0.7"/>
              <rect x="140" y="60" width="4" height="6" rx="1" fill="#ffffff" opacity="0.7"/>
              <rect x="148" y="60" width="4" height="6" rx="1" fill="#ffffff" opacity="0.7"/>

              {/* Midground Tall Blue Building */}
              <rect x="100" y="24" width="28" height="86" rx="3" fill="#60a5fa"/>
              <path d="M100 24L114 14L128 24Z" fill="#3b82f6"/>
              <rect x="106" y="32" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="117" y="32" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="106" y="45" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="117" y="45" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="106" y="58" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="117" y="58" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="106" y="71" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="117" y="71" width="5" height="7" rx="1" fill="#ffffff" opacity="0.9"/>

              {/* Foreground Shorter Blue Building */}
              <rect x="82" y="54" width="22" height="56" rx="2" fill="#93c5fd"/>
              <rect x="87" y="62" width="4" height="6" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="94" y="62" width="4" height="6" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="87" y="74" width="4" height="6" rx="1" fill="#ffffff" opacity="0.9"/>
              <rect x="94" y="74" width="4" height="6" rx="1" fill="#ffffff" opacity="0.9"/>

              {/* Green Stylized Tree */}
              <rect x="156" y="76" width="4" height="34" rx="2" fill="#a16207" opacity="0.7"/>
              <ellipse cx="158" cy="68" rx="12" ry="16" fill="#34d399"/>
              <ellipse cx="158" cy="68" rx="8" ry="11" fill="#10b981"/>
            </svg>
          </div>
        </div>

        {/* 3. FOUR METRICS CARDS ROW */}
        <div className="company-metrics-grid">
          {/* Card 1: Job Postings */}
          <a href="#/jobs" className="company-metric-card">
            <div className="company-metric-left">
              <div className="company-metric-icon-box blue">
                <BriefcaseIcon size={22} color="#0284c7" />
              </div>
              <div className="company-metric-details">
                <span className="company-metric-value">{jobPostingsCount}</span>
                <span className="company-metric-label">Job Postings</span>
              </div>
            </div>
            <div className="company-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>

          {/* Card 2: Applications */}
          <a href="#/applications" className="company-metric-card">
            <div className="company-metric-left">
              <div className="company-metric-icon-box purple">
                <DocumentIcon size={22} color="#9333ea" />
              </div>
              <div className="company-metric-details">
                <span className="company-metric-value">{applicationsCount}</span>
                <span className="company-metric-label">Applications</span>
              </div>
            </div>
            <div className="company-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>

          {/* Card 3: Interviews */}
          <a href="#/interviews" className="company-metric-card" title="Scheduled Interviews">
            <div className="company-metric-left">
              <div className="company-metric-icon-box green">
                <CalendarIcon size={22} color="#16a34a" />
              </div>
              <div className="company-metric-details">
                <span className="company-metric-value">{interviewsCount}</span>
                <span className="company-metric-label">Interviews</span>
              </div>
            </div>
            <div className="company-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>

          {/* Card 4: Placements */}
          <a href="#/placements" className="company-metric-card">
            <div className="company-metric-left">
              <div className="company-metric-icon-box orange">
                <AwardIcon size={22} color="#d97706" />
              </div>
              <div className="company-metric-details">
                <span className="company-metric-value">{placementsCount}</span>
                <span className="company-metric-label">Placements</span>
              </div>
            </div>
            <div className="company-chevron-arrow">
              <ChevronRightIcon size={18} />
            </div>
          </a>
        </div>

        {/* 4. MIDDLE TWO-COLUMN GRID: Recent Job Postings & Recent Applications */}
        <div className="company-two-col-grid">
          {/* Column 1: Recent Job Postings */}
          <div className="company-section-col">
            <div className="company-section-header">
              <h3 className="company-section-title">Recent Job Postings</h3>
              <a href="#/jobs" className="company-view-all-link">
                <span>View All</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="company-card-list">
              {recentJobs.length > 0 ? (
                recentJobs.map((job) => (
                  <a key={job._id || job.id} href="#/jobs" className="company-list-row">
                    <div className="company-list-left">
                      <div className="company-avatar-circle">
                        {(job.title || 'JB').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="company-list-info">
                        <span className="company-list-primary">{job.title}</span>
                        <span className="company-list-secondary">
                          <span>{job.jobType || 'Full Time'}</span>
                          <span>{job.location || 'Remote'}</span>
                        </span>
                      </div>
                    </div>
                    <div className="company-list-right">
                      <span className={`company-pill-badge ${job.status?.toLowerCase() || 'active'}`}>{job.status || 'Active'}</span>
                      <div className="company-chevron-arrow">
                        <ChevronRightIcon size={16} />
                      </div>
                    </div>
                  </a>
                ))
              ) : (
                <div className="company-empty-state">
                  <div className="company-empty-icon">
                    <BriefcaseIcon size={20} />
                  </div>
                  <p className="company-empty-title">No data found</p>
                  <p className="company-empty-desc">No active job postings found. Create a new job opening to start recruiting.</p>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Recent Applications */}
          <div className="company-section-col">
            <div className="company-section-header">
              <h3 className="company-section-title">Recent Applications</h3>
              <a href="#/applications" className="company-view-all-link">
                <span>View All</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="company-card-list">
              {recentApplications.length > 0 ? (
                recentApplications.map((app) => {
                  const candName = `${app.studentId?.firstName || ''} ${app.studentId?.lastName || ''}`.trim() || app.candidateName || 'Candidate';
                  const jobTitle = app.jobSnapshot?.title || app.jobId?.title || app.roleTitle || 'Applicant';
                  return (
                    <a key={app._id || app.id} href="#/applications" className="company-list-row">
                      <div className="company-list-left">
                        <div className="company-avatar-circle">
                          {candName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="company-list-info">
                          <span className="company-list-primary">{candName}</span>
                          <span className="company-list-secondary">{jobTitle}</span>
                        </div>
                      </div>
                      <div className="company-list-right">
                        <span className={`company-pill-badge ${app.status?.toLowerCase() || 'new'}`}>{app.status || 'New'}</span>
                        <div className="company-chevron-arrow">
                          <ChevronRightIcon size={16} />
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="company-empty-state">
                  <div className="company-empty-icon">
                    <DocumentIcon size={20} />
                  </div>
                  <p className="company-empty-title">No data found</p>
                  <p className="company-empty-desc">No candidate applications have been received yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. BOTTOM TWO-COLUMN GRID: Upcoming Interviews & Quick Actions */}
        <div className="company-two-col-grid">
          {/* Column 1: Upcoming Interviews */}
          <div className="company-section-col">
            <div className="company-section-header">
              <h3 className="company-section-title">Upcoming Interviews</h3>
              <a href="#/applications" className="company-view-all-link">
                <span>View All</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="company-card-list">
              {upcomingInterviews.length > 0 ? (
                upcomingInterviews.map((interview) => {
                  const candName =
                    `${interview.studentId?.firstName || ''} ${interview.studentId?.lastName || ''}`.trim() ||
                    interview.candidateName ||
                    'Candidate';
                  const roleTitle = interview.jobSnapshot?.title || interview.jobId?.title || interview.roleTitle || 'Applicant';
                  return (
                    <a key={interview._id || interview.id} href="#/applications" className="company-list-row">
                      <div className="company-list-left">
                        <div className="company-avatar-circle">
                          {candName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="company-list-info">
                          <span className="company-list-primary">{candName}</span>
                          <span className="company-list-secondary">{roleTitle} • Round {interview.recruitmentRound || 1}</span>
                        </div>
                      </div>
                      <div className="company-list-right">
                        <span className="company-pill-badge online">Interview</span>
                        <div className="company-chevron-arrow">
                          <ChevronRightIcon size={16} />
                        </div>
                      </div>
                    </a>
                  );
                })
              ) : (
                <div className="company-empty-state">
                  <div className="company-empty-icon">
                    <CalendarIcon size={20} />
                  </div>
                  <p className="company-empty-title">No data found</p>
                  <p className="company-empty-desc">No candidate interviews are currently scheduled.</p>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Quick Actions */}
          <div className="company-section-col">
            <div className="company-section-header">
              <h3 className="company-section-title">Quick Actions</h3>
            </div>
            <div className="company-quick-actions-grid">
              {/* Action 1: Create Job Posting */}
              <a href="#/jobs" className="company-action-card create-job">
                <div className="company-action-top">
                  <PlusIcon size={22} color="#2563eb" />
                  <ChevronRightIcon size={16} />
                </div>
                <span className="company-action-label">Create Job Posting</span>
              </a>

              {/* Action 2: View Applications */}
              <a href="#/applications" className="company-action-card view-apps">
                <div className="company-action-top">
                  <DocumentIcon size={22} color="#9333ea" />
                  <ChevronRightIcon size={16} />
                </div>
                <span className="company-action-label">View Applications</span>
              </a>

              {/* Action 3: Manage Interviews */}
              <a href="#/applications?status=INTERVIEW" className="company-action-card manage-interviews">
                <div className="company-action-top">
                  <CalendarIcon size={22} color="#16a34a" />
                  <ChevronRightIcon size={16} />
                </div>
                <span className="company-action-label">Manage Interviews</span>
              </a>

              {/* Action 4: View Placements */}
              <a href="#/applications?status=SELECTED" className="company-action-card view-placements">
                <div className="company-action-top">
                  <UsersIcon size={22} color="#d97706" />
                  <ChevronRightIcon size={16} />
                </div>
                <span className="company-action-label">View Placements</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
