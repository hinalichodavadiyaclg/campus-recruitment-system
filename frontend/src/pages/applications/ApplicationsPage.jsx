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
  ExternalLinkIcon
} from '../../components/common/Icons.jsx';
import {
  formatDate,
  APPLICATION_STATUS_INFO,
  ALLOWED_STATUS_TRANSITIONS
} from '../../utils/job-helpers.js';

import { ApplicationDetailsModal } from './ApplicationDetailsModal.jsx';
import { ApplicationStatusModal } from './ApplicationStatusModal.jsx';
import { ApplicationWithdrawModal } from './ApplicationWithdrawModal.jsx';
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
  const [page, setPage] = useState(1);
  const limit = 15;

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

  // Load available jobs for filter dropdown if company or placement admin
  useEffect(() => {
    if (isStudent) return;
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
  }, [isStudent]);

  // Main application list fetch
  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        jobId: selectedJobId || undefined,
        status: selectedStatus || undefined
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
  }, [page, limit, selectedJobId, selectedStatus]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

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
    (isCompany || isPlacementHead || isSuperAdmin) &&
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
      {/* Filters Bar (For Recruiters and Placement Cell) */}
      {!isStudent && (
        <div className="app-filters-card">
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

          {/* Reset Filters */}
          {(selectedJobId || selectedStatus) && (
            <button
              type="button"
              className="ghost"
              style={{ alignSelf: 'flex-end', height: '40px' }}
              onClick={() => {
                setSelectedJobId('');
                setSelectedStatus('');
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
              : selectedJobId || selectedStatus
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>Application ID</th>
                  {!isStudent && <th>Candidate</th>}
                  {!isStudent && <th>Academic Info</th>}
                  <th>Job Title & Company</th>
                  <th>Round</th>
                  <th>Applied Date</th>
                  <th>Current Stage</th>
                  {!isStudent && <th>Resume</th>}
                  <th>Actions</th>
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
                    <tr key={app._id}>
                      {/* ID */}
                      <td>
                        <strong style={{ fontFamily: 'monospace', color: 'var(--navy)' }}>
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
                      <td>
                        <span className="badge neutral">
                          R{app.recruitmentRound || 1}
                        </span>
                      </td>

                      {/* Applied Date */}
                      <td style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                        {formatDate(app.createdAt)}
                      </td>

                      {/* Current Stage */}
                      <td>
                        <span className={`badge ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Resume Document Link (For recruiters/placement) */}
                      {!isStudent && (
                        <td>
                          {resumeUrl ? (
                            <a
                              href={resumeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link-button"
                              title="Preview candidate verified resume"
                            >
                              <DocumentIcon size={14} /> Resume ↗
                            </a>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>None</span>
                          )}
                        </td>
                      )}

                      {/* Actions */}
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => setSelectedAppForDetails(app)}
                          >
                            Details
                          </button>

                          {/* Candidate Withdrawal Action */}
                          {canCandidateWithdraw(app) && (
                            <button
                              type="button"
                              className="link-button"
                              style={{ color: 'var(--red)' }}
                              onClick={() => setSelectedAppForWithdraw(app)}
                            >
                              Withdraw
                            </button>
                          )}

                          {/* Recruiter / Placement Stage Advancement */}
                          {canAdvanceStage(app) && (
                            <button
                              type="button"
                              className="link-button"
                              style={{ color: 'var(--teal)', fontWeight: 700 }}
                              onClick={() => setSelectedAppForStatus(app)}
                            >
                              Update Stage →
                            </button>
                          )}
                        </div>
                      </td>
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
    </PortalLayout>
  );
}
