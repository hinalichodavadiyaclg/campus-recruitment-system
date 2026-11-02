import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { applicationService } from '../../services/application.service.js';
import { jobService } from '../../services/job.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import {
  DocumentIcon,
  FilterIcon,
  BuildingIcon,
  UserIcon,
  SearchIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  XIcon,
  MoreVerticalIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon
} from '../../components/common/Icons.jsx';
import {
  formatDate,
  APPLICATION_STATUS_INFO,
  ALLOWED_STATUS_TRANSITIONS
} from '../../utils/job-helpers.js';

import { ApplicationDetailsModal } from './ApplicationDetailsModal.jsx';
import { ApplicationStatusModal } from './ApplicationStatusModal.jsx';
import { ApplicationWithdrawModal } from './ApplicationWithdrawModal.jsx';
import { JobApplyModal } from '../jobs/JobApplyModal.jsx';
import './Applications.css';

export function ApplicationsPage() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  const isStudent = user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT';
  const isCompany = user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY';
  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR';
  const isPlacementHead = role?.id === 'ROLE_PLACEMENT_HEAD' || user?.roleId === 'ROLE_PLACEMENT_HEAD';
  const isSuperAdmin = role?.id === 'ROLE_SUPER_ADMIN' || user?.roleId === 'ROLE_SUPER_ADMIN';

  // Helper to extract jobId from location hash (e.g. #/applications?jobId=xyz)
  const getInitialJobId = () => {
    try {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const searchParams = new URLSearchParams(hash.slice(qIndex));
        return searchParams.get('jobId') || '';
      }
    } catch {
      // fallback
    }
    return '';
  };

  // Filters
  const [selectedJobId, setSelectedJobId] = useState(getInitialJobId);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPassingYear, setSelectedPassingYear] = useState('');
  const [selectedMinCgpa, setSelectedMinCgpa] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Active 3-dots action menu id
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const toggleActionMenu = (appId) => {
    setOpenActionMenuId((prev) => (prev === appId ? null : appId));
  };

  // Sync selectedJobId if route hash updates
  useEffect(() => {
    const handleHashChange = () => {
      const nextJobId = getInitialJobId();
      if (nextJobId !== selectedJobId) {
        setSelectedJobId(nextJobId);
        setPage(1);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [selectedJobId]);

  // Data
  const [applications, setApplications] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [selectedAppForDetails, setSelectedAppForDetails] = useState(null);
  const [selectedAppForStatus, setSelectedAppForStatus] = useState(null);
  const [selectedAppForWithdraw, setSelectedAppForWithdraw] = useState(null);
  const [selectedJobForReapply, setSelectedJobForReapply] = useState(null);

  // Load available jobs for filter dropdown if user has JOB_READ and is non-student
  useEffect(() => {
    if (isStudent || !has('JOB_READ')) return;
    let mounted = true;
    async function loadJobs() {
      try {
        const res = await jobService.listJobs({ limit: 100 });
        if (mounted) setAvailableJobs(res?.jobs || res?.items || []);
      } catch (err) {
        console.error('Failed to load filter jobs:', err);
      }
    }
    loadJobs();
    return () => {
      mounted = false;
    };
  }, [isStudent, has]);

  // Main application list fetch
  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        jobId: selectedJobId || undefined,
        status: selectedStatus || undefined,
        passingYear: selectedPassingYear || undefined,
        minCgpa: selectedMinCgpa || undefined,
        search: searchQuery.trim() || undefined
      };

      const res = await applicationService.listApplications(params);
      const items = res?.items || [];
      const total = res?.total || items.length;

      setApplications(items);
      setTotalCount(total);
      setTotalPages(Math.max(1, Math.ceil(total / limit)));
    } catch (err) {
      setError(err.message || 'Failed to load applications.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedJobId, selectedStatus, selectedPassingYear, selectedMinCgpa, searchQuery]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Enriched details opening
  const handleOpenDetails = async (app) => {
    setSelectedAppForDetails(app);
    try {
      const full = await applicationService.getApplicationById(app._id);
      setSelectedAppForDetails(full);
    } catch (err) {
      console.warn('Could not enrich application details:', err);
    }
  };

  // Reapply action handler
  const handleReapplyClick = async (app) => {
    try {
      const fullJob = await jobService.getJobById(app.jobId?._id || app.jobId);
      setSelectedJobForReapply(fullJob);
    } catch (err) {
      setSelectedJobForReapply(app.jobId);
    }
  };

  // Status Update action
  const handleConfirmStatusUpdate = async (id, payload) => {
    await applicationService.updateApplicationStatus(id, payload);
    toast('Application recruitment stage updated successfully.');
    fetchApplications();
    if (selectedAppForDetails?._id === id) {
      setSelectedAppForDetails(null);
    }
  };

  // Withdraw action
  const handleConfirmWithdraw = async (id, payload) => {
    await applicationService.withdrawApplication(id, payload);
    toast('Application withdrawn successfully.');
    fetchApplications();
    if (selectedAppForDetails?._id === id) {
      setSelectedAppForDetails(null);
    }
  };

  // Permission checks
  const canCandidateWithdraw = (app) =>
    isStudent && !['SELECTED', 'REJECTED', 'WITHDRAWN'].includes(app.status);

  const canAdvanceStage = (app) =>
    has('APPLICATION_UPDATE') &&
    ALLOWED_STATUS_TRANSITIONS[app.status]?.length > 0;

  return (
    <PortalLayout
      title="Application Management"
      subtitle={
        isStudent
          ? 'Track your submitted job applications, interview schedules, and placement status.'
          : isCompany
            ? 'Review qualified applicants, verify resumes, and advance candidates through recruitment stages.'
            : isCoordinator
              ? 'Oversee department-scoped recruitment applications and placement progression.'
              : 'Portal-wide placement application oversight, verification, and audit logs.'
      }
      category="Recruitment Module"
      section="Recruitment"
      currentPath="/applications"
    >
      {/* Filters Bar (For Students) */}
      {isStudent && (
        <div className="app-filters-card" style={{ marginBottom: '20px' }}>
          <div className="app-filter-item" style={{ minWidth: '240px', flex: '1 1 240px' }}>
            <span className="app-filter-label">Search Applications</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                className="app-filter-input"
                placeholder="Search by job title or company…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '8px 12px 8px 34px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, #fff)',
                  fontSize: '0.86rem',
                  color: 'var(--ink)'
                }}
              />
              <span style={{ position: 'absolute', left: '10px', color: 'var(--muted)', pointerEvents: 'none' }}>
                <SearchIcon size={15} />
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--muted)'
                  }}
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="app-filter-item">
            <span className="app-filter-label">Application Status</span>
            <select
              className="app-filter-select"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="APPLIED">Applied</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="ASSESSMENT">Assessment</option>
              <option value="INTERVIEW">Interview</option>
              <option value="SELECTED">Selected</option>
              <option value="REJECTED">Not Selected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>

          {(searchQuery || selectedStatus) && (
            <button
              type="button"
              className="ghost"
              style={{ alignSelf: 'flex-end', height: '40px' }}
              onClick={() => {
                setSearchQuery('');
                setSelectedStatus('');
                setPage(1);
              }}
            >
              Clear
            </button>
          )}

          <button
            type="button"
            className="ghost"
            style={{ alignSelf: 'flex-end', height: '40px', marginLeft: 'auto' }}
            onClick={fetchApplications}
            title="Refresh application records"
          >
            <RefreshCwIcon size={14} /> Refresh
          </button>
        </div>
      )}

      {/* Filters Bar (For Recruiters and Placement Cell) */}
      {!isStudent && (
        <div className="app-filters-card">
          {/* Search Box */}
          <div className="app-filter-item" style={{ minWidth: '220px', flex: '1 1 200px' }}>
            <span className="app-filter-label">Search Candidates / Jobs</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                className="app-filter-input"
                placeholder="Search by name, roll no, job…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '8px 12px 8px 34px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, #fff)',
                  fontSize: '0.86rem',
                  color: 'var(--ink)'
                }}
              />
              <span style={{ position: 'absolute', left: '10px', color: 'var(--muted)', pointerEvents: 'none' }}>
                <SearchIcon size={15} />
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--muted)'
                  }}
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Job Filter Dropdown */}
          <div className="app-filter-item">
            <span className="app-filter-label">Filter By Job Posting</span>
            <select
              className="app-filter-select"
              value={selectedJobId}
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Job Postings</option>
              {availableJobs.map((j) => (
                <option key={j._id} value={j._id}>
                  {j.jobId} - {j.title}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div className="app-filter-item">
            <span className="app-filter-label">Recruitment Stage</span>
            <select
              className="app-filter-select"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Stages</option>
              <option value="APPLIED">Applied</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="SHORTLISTED">Shortlisted</option>
              <option value="ASSESSMENT">Assessment</option>
              <option value="INTERVIEW">Interview</option>
              <option value="SELECTED">Selected</option>
              <option value="REJECTED">Not Selected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>

          {/* Passing Batch Filter */}
          <div className="app-filter-item">
            <span className="app-filter-label">Passing Batch</span>
            <select
              className="app-filter-select"
              value={selectedPassingYear}
              onChange={(e) => {
                setSelectedPassingYear(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Batches</option>
              {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map((yr) => (
                <option key={yr} value={yr}>
                  {yr} Batch
                </option>
              ))}
            </select>
          </div>

          {/* Min CGPA Screening Filter */}
          <div className="app-filter-item">
            <span className="app-filter-label">Min CGPA</span>
            <select
              className="app-filter-select"
              value={selectedMinCgpa}
              onChange={(e) => {
                setSelectedMinCgpa(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any CGPA</option>
              <option value="6.0">6.0+ CGPA</option>
              <option value="6.5">6.5+ CGPA</option>
              <option value="7.0">7.0+ CGPA</option>
              <option value="7.5">7.5+ CGPA</option>
              <option value="8.0">8.0+ CGPA</option>
              <option value="8.5">8.5+ CGPA</option>
              <option value="9.0">9.0+ CGPA</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(selectedJobId || selectedStatus || selectedPassingYear || selectedMinCgpa || searchQuery) && (
            <button
              type="button"
              className="ghost"
              style={{ alignSelf: 'flex-end', height: '40px' }}
              onClick={() => {
                setSelectedJobId('');
                setSelectedStatus('');
                setSelectedPassingYear('');
                setSelectedMinCgpa('');
                setSearchQuery('');
                setPage(1);
              }}
            >
              Clear Filters
            </button>
          )}

          <button
            type="button"
            className="ghost"
            style={{ alignSelf: 'flex-end', height: '40px', marginLeft: 'auto' }}
            onClick={fetchApplications}
            title="Refresh application records"
          >
            <RefreshCwIcon size={14} /> Refresh
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <Loading message="Loading application records…" />
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="notice error" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircleIcon size={20} color="var(--red)" />
            <span>{error}</span>
          </div>
          <button type="button" className="secondary" onClick={fetchApplications}>
            Retry
          </button>
        </div>
      )}

      {/* Clean Empty State (Zero Mock Seeding) */}
      {!loading && !error && applications.length === 0 && (
        <div className="card empty" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#f1f5f9',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 16px',
            color: 'var(--muted)'
          }}>
            <DocumentIcon size={30} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>
            No Applications Found
          </h3>
          <p style={{ margin: '0 auto 20px', maxWidth: '440px', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            {isStudent
              ? 'You have not submitted any job applications yet. Visit Job Postings to explore eligible campus drives and apply.'
              : (selectedJobId || selectedStatus || selectedPassingYear || selectedMinCgpa)
                ? 'No applicant records match your current filter selections.'
                : 'No student applications have been received yet for your active recruitment drives.'}
          </p>
          {isStudent && (
            <a href="#/job-postings" className="primary" style={{ display: 'inline-flex' }}>
              Explore Job Postings →
            </a>
          )}
        </div>
      )}

      {/* Applications Data Table */}
      {!loading && !error && applications.length > 0 && (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data-table applications-table">
              <thead>
                <tr>
                  <th>Application ID</th>
                  {!isStudent && <th>Candidate</th>}
                  {!isStudent && <th>Academic Info</th>}
                  <th>Job Title & Company</th>
                  <th style={{ textAlign: 'center' }}>Round</th>
                  <th style={{ textAlign: 'center' }}>{isStudent ? 'Attempt' : 'Attempts'}</th>
                  <th>Applied Date</th>
                  <th>Current Stage</th>
                  {!isStudent && <th>Resume</th>}
                  <th style={{ textAlign: isStudent ? 'left' : 'center', width: isStudent ? 'auto' : '48px' }}>
                    {isStudent ? 'Actions' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const studentInfo = app.studentId || {};
                  const studentFullName = `${studentInfo.firstName || ''} ${studentInfo.lastName || ''}`.trim() || 'Candidate';
                  const jobTitle = app.jobSnapshot?.title || app.jobId?.title || 'Job Posting';
                  const companyName =
                    app.companyId?.companyName || app.jobId?.companyId?.companyName || 'Recruiter';
                  const statusInfo = APPLICATION_STATUS_INFO[app.status] || {
                    label: app.status,
                    badgeClass: 'neutral'
                  };
                  const resumeUrl = app.resumeSnapshot?.url || studentInfo.resume?.url;

                  return (
                    <tr
                      key={app._id}
                      className="clickable-app-row"
                      onClick={() => handleOpenDetails(app)}
                      title="Click anywhere on this row to view application details"
                    >
                      {/* ID */}
                      <td>
                        <strong
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: 'var(--teal, #0f766e)',
                            fontSize: '0.86rem'
                          }}
                        >
                          {app.applicationId}
                        </strong>
                      </td>

                      {/* Candidate Name (For recruiters/placement) */}
                      {!isStudent && (
                        <td>
                          <strong>{studentFullName}</strong>
                          <div style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                            {studentInfo.universityId || studentInfo.email}
                          </div>
                        </td>
                      )}

                      {/* Academic Info */}
                      {!isStudent && (
                        <td>
                          <div style={{ fontSize: '0.82rem' }}>
                            {studentInfo.department || '—'}
                          </div>
                          <span style={{ fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 600 }}>
                            {studentInfo.cgpa !== undefined && studentInfo.cgpa !== null ? `${studentInfo.cgpa} CGPA` : ''}
                            {studentInfo.passingYear ? ` • ${studentInfo.passingYear} Batch` : ''}
                          </span>
                        </td>
                      )}

                      {/* Job Title & Company */}
                      <td>
                        <strong>{jobTitle}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <BuildingIcon size={12} /> {companyName}
                        </div>
                      </td>

                      {/* Round */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge neutral">
                          R{app.recruitmentRound || 1}
                        </span>
                      </td>

                      {/* Attempt Info */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isStudent ? (
                          (app.totalAttempts > 1 || app.attemptNumber > 1) ? (
                            <span
                              className={`badge ${(app.attemptNumber === 2 || app.totalAttempts === 2)
                                  ? 'warning'
                                  : 'danger'
                                }`}
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
                            >
                              {(app.attemptNumber === 2 || app.totalAttempts === 2)
                                ? 'Attempt 2'
                                : 'Attempt 3'}
                            </span>
                          ) : (
                            <span
                              className="badge neutral"
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
                            >
                              Attempt 1
                            </span>
                          )
                        ) : (
                          (app.totalAttempts > 1) ? (
                            <span
                              className={`badge ${app.totalAttempts === 2 ? 'warning' : 'danger'}`}
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
                            >
                              {app.totalAttempts === 2 ? 'Reapplied (2)' : `Attempt ${app.totalAttempts}`}
                            </span>
                          ) : (
                            <span
                              className="badge neutral"
                              style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
                            >
                              Attempt 1
                            </span>
                          )
                        )}
                      </td>

                      {/* Applied Date */}
                      <td style={{ color: 'var(--muted)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {formatDate(app.createdAt)}
                      </td>

                      {/* Current Stage */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className={`badge ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Resume Document Link (For recruiters/placement) */}
                      {!isStudent && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {resumeUrl ? (
                            <a
                              href={resumeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="app-resume-link"
                              title="Preview candidate verified resume"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DocumentIcon size={13} />
                              <span>Resume</span>
                              <ExternalLinkIcon size={11} />
                            </a>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>—</span>
                          )}
                        </td>
                      )}

                      {/* Actions */}
                      {isStudent ? (
                        /* Student Direct Action Buttons */
                        <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <div className="app-table-actions">
                            <button
                              type="button"
                              className="app-btn-action ghost"
                              onClick={() => handleOpenDetails(app)}
                              title="View application details"
                            >
                              <EyeIcon size={13} color="var(--teal)" />
                              <span>View Details</span>
                            </button>

                            {/* Reapply button if application is withdrawn and attempts remain */}
                            {app.status === 'WITHDRAWN' && (app.attemptNumber || app.totalAttempts || 1) < 3 && (
                              <button
                                type="button"
                                className="app-btn-action primary"
                                onClick={() => handleReapplyClick(app)}
                                title="Reapply to this job posting"
                              >
                                <ExternalLinkIcon size={12} />
                                <span>Reapply</span>
                              </button>
                            )}

                            {/* Candidate Withdrawal Action if active */}
                            {canCandidateWithdraw(app) && (
                              <button
                                type="button"
                                className="app-btn-action danger"
                                onClick={() => setSelectedAppForWithdraw(app)}
                                title="Withdraw this application"
                              >
                                Withdraw
                              </button>
                            )}
                          </div>
                        </td>
                      ) : (
                        /* Company / Recruiter / Placement: 3-Dots Action Dropdown Menu */
                        <td style={{ textAlign: 'center', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                          <div className="app-action-dropdown-wrap">
                            <button
                              type="button"
                              className="app-dots-btn"
                              onClick={() => toggleActionMenu(app._id)}
                              aria-expanded={openActionMenuId === app._id}
                              title="Actions"
                            >
                              <MoreVerticalIcon size={16} />
                            </button>

                            {openActionMenuId === app._id && (
                              <>
                                <div
                                  className="app-action-menu-backdrop"
                                  onClick={() => setOpenActionMenuId(null)}
                                />
                                <div className="app-action-dropdown-menu">
                                  <button
                                    type="button"
                                    className="app-action-menu-item"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      handleOpenDetails(app);
                                    }}
                                  >
                                    <EyeIcon size={14} color="var(--teal)" />
                                    <span>View Details</span>
                                  </button>

                                  {canAdvanceStage(app) && (
                                    <button
                                      type="button"
                                      className="app-action-menu-item"
                                      onClick={() => {
                                        setOpenActionMenuId(null);
                                        setSelectedAppForStatus(app);
                                      }}
                                    >
                                      <CheckCircleIcon size={14} color="var(--teal)" />
                                      <span>Update Stage</span>
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="job-pagination-bar" style={{ padding: '14px 20px' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                Page {page} of {totalPages} ({totalCount} total)
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn ${p === page ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {selectedAppForDetails && (
        <ApplicationDetailsModal
          isOpen={Boolean(selectedAppForDetails)}
          onClose={() => setSelectedAppForDetails(null)}
          application={selectedAppForDetails}
          canUpdateStatus={canAdvanceStage(selectedAppForDetails)}
          canWithdraw={canCandidateWithdraw(selectedAppForDetails)}
          onUpdateStatusClick={(app) => {
            setSelectedAppForDetails(null);
            setSelectedAppForStatus(app);
          }}
          onWithdrawClick={(app) => {
            setSelectedAppForDetails(null);
            setSelectedAppForWithdraw(app);
          }}
        />
      )}

      {selectedAppForStatus && (
        <ApplicationStatusModal
          isOpen={Boolean(selectedAppForStatus)}
          onClose={() => setSelectedAppForStatus(null)}
          application={selectedAppForStatus}
          onConfirm={handleConfirmStatusUpdate}
        />
      )}

      {selectedAppForWithdraw && (
        <ApplicationWithdrawModal
          isOpen={Boolean(selectedAppForWithdraw)}
          onClose={() => setSelectedAppForWithdraw(null)}
          application={selectedAppForWithdraw}
          onConfirm={handleConfirmWithdraw}
        />
      )}

      {selectedJobForReapply && (
        <JobApplyModal
          isOpen={Boolean(selectedJobForReapply)}
          onClose={() => setSelectedJobForReapply(null)}
          job={selectedJobForReapply}
          onSuccess={() => {
            setSelectedJobForReapply(null);
            toast('Application re-submitted successfully!');
            fetchApplications();
          }}
        />
      )}
    </PortalLayout>
  );
}
