import React, { useState } from 'react';
import {
  BriefcaseIcon,
  MapPinIcon,
  CalendarIcon,
  UsersIcon,
  EditIcon,
  ShieldIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  AlertCircleIcon
} from '../../components/common/Icons.jsx';
import {
  formatDate,
  getJobTypeLabel,
  getWorkModeLabel
} from '../../utils/job-helpers.js';

export function JobTable({
  jobs = [],
  roleType = 'COMPANY', // 'COMPANY' | 'PLACEMENT_HEAD' | 'PLACEMENT_COORDINATOR'
  onViewDetails,
  onEdit,
  onStatusChange,
  onReopen,
  onSuspend,
  onViewApplicants
}) {
  const [openActionMenuId, setOpenActionMenuId] = useState(null);

  const toggleActionMenu = (jobId) => {
    setOpenActionMenuId((prev) => (prev === jobId ? null : jobId));
  };

  const isCompany = roleType === 'COMPANY';
  const isHead = roleType === 'PLACEMENT_HEAD';
  const isCoordinator = roleType === 'PLACEMENT_COORDINATOR';

  return (
    <div className="card table-card job-data-table-card">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '110px' }}>Job ID</th>
              <th>Job Title</th>
              {!isCompany && <th>Company</th>}
              <th>Job Type</th>
              <th>Work Mode</th>
              {isCoordinator && <th>Eligible Scope</th>}
              <th style={{ textAlign: 'center' }}>Vacancies</th>
              <th>Deadline</th>
              <th>Status</th>
              <th style={{ textAlign: isCoordinator ? 'center' : 'right', minWidth: isCoordinator ? '145px' : '85px' }}>
                {isCoordinator ? 'Applications' : 'Actions'}
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, index) => {
              const companyName = job.companyId?.companyName || 'Recruiter';
              const isDeadlinePassed = new Date(job.deadline) < new Date();
              const isSuspended = Boolean(job.isSuspended);
              const appsCount = job.applicationsCount ?? 0;
              const isDropUp = jobs.length > 2 ? index >= jobs.length - 2 : index > 0;

              // Format eligible departments/courses for coordinator
              const depts = job.eligibilityCriteria?.allowedDepartmentIds || [];
              const courses = job.eligibilityCriteria?.allowedCourseIds || [];
              const isAllStudents = job.eligibilityMode === 'ALL_STUDENTS' || (depts.length === 0 && courses.length === 0);

              return (
                <tr
                  key={job._id}
                  className={`job-table-row ${isSuspended ? 'job-row-suspended' : ''}`}
                  onClick={(e) => {
                    if (e.target.closest('button, a, input, select, .job-action-dropdown-wrap')) return;
                    onViewDetails?.(job);
                  }}
                  style={{ cursor: 'pointer' }}
                  title="Click row to view job details"
                >
                  {/* 1. Job ID */}
                  <td>
                    <span className="job-id-pill" title={`System ID: ${job.jobId}`}>
                      {job.jobId}
                    </span>
                  </td>

                  {/* 2. Job Title + Clickable Applications Link */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span
                        className="job-title-text"
                        style={{
                          fontWeight: 700,
                          fontSize: '0.91rem',
                          color: 'var(--navy)',
                          lineHeight: 1.3
                        }}
                      >
                        {job.title}
                      </span>

                      {/* Clearly recognizable clickable link for applications (Recruiter & Placement Head) */}
                      {!isCoordinator && (
                        <button
                          type="button"
                          className="job-applications-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewApplicants?.(job);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onViewApplicants?.(job);
                            }
                          }}
                          title={`View ${appsCount} application${appsCount === 1 ? '' : 's'} for ${job.title}`}
                          aria-label={`View ${appsCount} application${appsCount === 1 ? '' : 's'} for ${job.title}`}
                        >
                          <UsersIcon size={12} />
                          <span>{appsCount} {appsCount === 1 ? 'Application' : 'Applications'}</span>
                          <ChevronRightIcon size={12} className="job-app-link-arrow" />
                        </button>
                      )}

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.74rem', color: 'var(--muted)' }}>
                        {job.category && <span>{job.category}</span>}
                        {job.recruitmentRound > 1 && (
                          <span className="badge neutral" style={{ fontSize: '0.68rem', padding: '1px 5px' }}>
                            Round {job.recruitmentRound}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 3. Company (Head & Coordinator) */}
                  {!isCompany && (
                    <td>
                      <strong style={{ fontSize: '0.86rem', color: 'var(--navy)' }}>
                        {companyName}
                      </strong>
                      {job.companyId?.industryType && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          {job.companyId.industryType}
                        </div>
                      )}
                    </td>
                  )}

                  {/* 4. Job Type */}
                  <td>
                    <span className="job-meta-pill" style={{ fontSize: '0.76rem', padding: '2px 8px' }}>
                      {getJobTypeLabel(job.jobType)}
                    </span>
                  </td>

                  {/* 5. Location / Work Mode */}
                  <td>
                    <div style={{ fontSize: '0.82rem' }}>
                      {getWorkModeLabel(job.workMode)}
                    </div>
                    {job.location && (
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }} title={job.location}>
                        {job.location}
                      </div>
                    )}
                  </td>

                  {/* 6. Eligible Scope (Coordinator only) */}
                  {isCoordinator && (
                    <td>
                      {isAllStudents ? (
                        <span className="badge info" style={{ fontSize: '0.72rem' }}>
                          Open to All
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '180px' }}>
                          {depts.slice(0, 2).map((d) => (
                            <span key={d._id || d.name} className="badge neutral" style={{ fontSize: '0.7rem' }}>
                              {d.code || d.name || 'Dept'}
                            </span>
                          ))}
                          {depts.length > 2 && (
                            <span className="badge neutral" style={{ fontSize: '0.7rem' }}>
                              +{depts.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  )}

                  {/* 7. Vacancies */}
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                      {job.vacancies}
                    </span>
                  </td>

                  {/* 9. Application Deadline */}
                  <td>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: isDeadlinePassed ? 'var(--red)' : 'var(--ink)'
                      }}
                    >
                      {formatDate(job.deadline)}
                    </div>
                    {isDeadlinePassed && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--red)', fontWeight: 700 }}>
                        Expired
                      </span>
                    )}
                  </td>

                  {/* 10. Status */}
                  <td>
                    <span className={`badge ${job.status?.toLowerCase()}`}>
                      {job.status}
                    </span>
                  </td>

                  {/* 11. Suspension Status (Placement Head) */}
                  {isHead && (
                    <td>
                      {isSuspended ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className="badge inactive" title={job.suspensionReason || 'Suspended'}>
                            SUSPENDED
                          </span>
                        </div>
                      ) : (
                        <span className="badge active">ACTIVE</span>
                      )}
                    </td>
                  )}

                  {/* Actions */}
                  <td style={{ textAlign: 'right' }}>
                    <div className="job-table-actions-cell">
                      {/* Company Action Menu */}
                      {isCompany && (
                        <div className="job-action-dropdown-wrap">
                          <button
                            type="button"
                            className="secondary job-action-dropdown-btn"
                            onClick={() => toggleActionMenu(job._id)}
                            aria-expanded={openActionMenuId === job._id}
                          >
                            <span>Manage</span>
                            <ChevronDownIcon size={12} />
                          </button>

                          {openActionMenuId === job._id && (
                            <>
                              <div
                                className="job-action-menu-backdrop"
                                onClick={() => setOpenActionMenuId(null)}
                              />
                              <div className={`job-action-dropdown-menu ${isDropUp ? 'drop-up' : ''}`}>
                                {/* Edit */}
                                <button
                                  type="button"
                                  className="job-action-menu-item"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onEdit?.(job);
                                  }}
                                  disabled={isSuspended}
                                  title={isSuspended ? 'Cannot edit suspended job' : 'Edit Job'}
                                >
                                  <EditIcon size={13} /> Edit Job
                                </button>

                                {/* Publish Draft */}
                                {job.status === 'DRAFT' && !isSuspended && (
                                  <button
                                    type="button"
                                    className="job-action-menu-item"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      onStatusChange?.(job, 'OPEN');
                                    }}
                                  >
                                    Publish Job
                                  </button>
                                )}

                                {/* Pause Open Job */}
                                {job.status === 'OPEN' && !isSuspended && (
                                  <button
                                    type="button"
                                    className="job-action-menu-item"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      onStatusChange?.(job, 'PAUSED');
                                    }}
                                  >
                                    Pause Applications
                                  </button>
                                )}

                                {/* Resume Paused Job */}
                                {job.status === 'PAUSED' && !isSuspended && (
                                  <button
                                    type="button"
                                    className="job-action-menu-item"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      onStatusChange?.(job, 'OPEN');
                                    }}
                                  >
                                    Resume Applications
                                  </button>
                                )}

                                {/* Close Job */}
                                {(job.status === 'OPEN' || job.status === 'PAUSED') && !isSuspended && (
                                  <button
                                    type="button"
                                    className="job-action-menu-item is-danger"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      onStatusChange?.(job, 'CLOSED');
                                    }}
                                  >
                                    Close Job
                                  </button>
                                )}

                                {/* Reopen Closed Job */}
                                {job.status === 'CLOSED' && !isSuspended && (
                                  <button
                                    type="button"
                                    className="job-action-menu-item"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      onReopen?.(job);
                                    }}
                                  >
                                    <RefreshCwIcon size={13} /> Reopen Job
                                  </button>
                                )}

                                {/* View Applicants */}
                                <button
                                  type="button"
                                  className="job-action-menu-item"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onViewApplicants?.(job);
                                  }}
                                >
                                  <UsersIcon size={13} /> Applicants ({appsCount})
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Placement Head Oversight Actions */}
                      {isHead && (
                        <div className="job-action-dropdown-wrap">
                          <button
                            type="button"
                            className="secondary job-action-dropdown-btn"
                            onClick={() => toggleActionMenu(job._id)}
                            aria-expanded={openActionMenuId === job._id}
                          >
                            <span>Manage</span>
                            <ChevronDownIcon size={12} />
                          </button>

                          {openActionMenuId === job._id && (
                            <>
                              <div
                                className="job-action-menu-backdrop"
                                onClick={() => setOpenActionMenuId(null)}
                              />
                              <div className={`job-action-dropdown-menu ${isDropUp ? 'drop-up' : ''}`}>
                                <button
                                  type="button"
                                  className="job-action-menu-item"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onViewDetails?.(job);
                                  }}
                                >
                                  View Details
                                </button>
                                <button
                                  type="button"
                                  className="job-action-menu-item"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onViewApplicants?.(job);
                                  }}
                                >
                                  <UsersIcon size={13} /> Applicants ({appsCount})
                                </button>
                                <button
                                  type="button"
                                  className={`job-action-menu-item ${!isSuspended ? 'is-danger' : ''}`}
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    onSuspend?.(job);
                                  }}
                                >
                                  <ShieldIcon size={13} />
                                  <span>{isSuspended ? 'Restore Job' : 'Suspend Job'}</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Placement Coordinator Scoped Applications Action */}
                      {isCoordinator && (
                        <button
                          type="button"
                          className="secondary job-coord-app-btn"
                          onClick={() => onViewApplicants?.(job)}
                          title="View applicants from your department"
                        >
                          <UsersIcon size={13} />
                          <span>Applicants ({appsCount})</span>
                          <ChevronRightIcon size={12} style={{ opacity: 0.65 }} />
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
    </div>
  );
}
