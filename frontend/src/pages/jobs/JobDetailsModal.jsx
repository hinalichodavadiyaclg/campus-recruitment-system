import React from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import {
  BriefcaseIcon,
  BuildingIcon,
  MapPinIcon,
  CalendarIcon,
  AwardIcon,
  GraduationCapIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  EditIcon,
  XIcon
} from '../../components/common/Icons.jsx';
import {
  formatSalary,
  formatDate,
  formatDateTime,
  getJobTypeLabel,
  getWorkModeLabel
} from '../../utils/job-helpers.js';

export function JobDetailsModal({
  isOpen,
  onClose,
  job,
  user,
  role,
  has,
  appliedApp,
  onApplyClick,
  onEditClick,
  onStatusClick,
  onReopenClick,
  onSuspendClick
}) {
  if (!isOpen || !job) return null;

  const isStudent = user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT';
  const isCompany = user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY';
  const isPlacementAdmin =
    role?.id === 'ROLE_PLACEMENT_HEAD' ||
    role?.id === 'ROLE_SUPER_ADMIN' ||
    user?.roleId === 'ROLE_PLACEMENT_HEAD' ||
    user?.roleId === 'ROLE_SUPER_ADMIN';

  const isDeadlinePassed = new Date(job.deadline) < new Date();
  const isSuspended = Boolean(job.isSuspended);
  const isOpenStatus = job.status === 'OPEN';

  // Eligibility evaluation from student view or job criteria
  const eligibility = job.eligibility;
  const isEligible = eligibility ? eligibility.isEligible : true;

  const companyName = job.companyId?.companyName || 'Company';
  const companyLocation = job.companyId?.officeAddress || '';
  const companyWebsite = job.companyId?.website || '';

  const criteria = job.eligibilityCriteria || {};
  const allowedDepts = criteria.allowedDepartmentIds || [];
  const allowedCourses = criteria.allowedCourseIds || [];
  const passingYears = criteria.allowedPassingYears || [];
  const minCgpa = criteria.minCgpa ?? 0;
  const maxBacklogs = criteria.maxActiveBacklogs ?? 'None / Unrestricted';
  const requiresNaandi = criteria.requiresNaandiTraining !== false;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="840px">
      <div className="job-details-modal-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <span className="job-id-pill">{job.jobId}</span>
              {isSuspended ? (
                <span className="badge inactive">SUSPENDED BY PLACEMENT CELL</span>
              ) : (
                <span className={`badge ${job.status?.toLowerCase()}`}>{job.status}</span>
              )}
              <span className="badge neutral">{getWorkModeLabel(job.workMode)}</span>
              {job.recruitmentRound > 1 && (
                <span className="badge neutral">Round {job.recruitmentRound}</span>
              )}
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>
              {job.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--muted)', fontSize: '0.9rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: 'var(--navy)' }}>
                <BuildingIcon size={16} /> {companyName}
              </span>
              {companyLocation && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <MapPinIcon size={14} /> {companyLocation}
                </span>
              )}
              {companyWebsite && (
                <a
                  href={companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link"
                  style={{ fontSize: '0.85rem' }}
                >
                  Visit Website ↗
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            style={{ padding: '6px', borderRadius: '50%', minWidth: '32px', height: '32px' }}
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Quick highlight bar */}
        <div className="job-meta-highlight-grid">
          <div className="job-meta-item">
            <span className="meta-label">Job Type</span>
            <strong className="meta-value">{getJobTypeLabel(job.jobType)}</strong>
          </div>
          <div className="job-meta-item">
            <span className="meta-label">Compensation</span>
            <strong className="meta-value">{formatSalary(job.compensation)}</strong>
          </div>
          <div className="job-meta-item">
            <span className="meta-label">Vacancies</span>
            <strong className="meta-value">{job.vacancies} Position{job.vacancies > 1 ? 's' : ''}</strong>
          </div>
          <div className="job-meta-item">
            <span className="meta-label">Application Deadline</span>
            <strong className="meta-value" style={{ color: isDeadlinePassed ? 'var(--red)' : 'var(--ink)' }}>
              {formatDate(job.deadline)} {isDeadlinePassed ? '(Expired)' : ''}
            </strong>
          </div>
        </div>
      </div>

      <div className="job-details-modal-body" style={{ marginTop: '20px' }}>
        {/* Student Application / Eligibility Status Banner */}
        {isStudent && (
          <div style={{ marginBottom: '20px' }}>
            {appliedApp ? (
              <div className="notice success" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircleIcon size={20} color="var(--green)" />
                <div>
                  <strong>You have applied for this job posting in Round {appliedApp.recruitmentRound || 1}.</strong>
                  <div style={{ fontSize: '0.82rem', marginTop: '3px' }}>
                    Application ID: <b>{appliedApp.applicationId}</b> &bull; Status:{' '}
                    <span className={`badge ${appliedApp.status?.toLowerCase()}`}>{appliedApp.status}</span>
                  </div>
                </div>
              </div>
            ) : isSuspended ? (
              <div className="notice error" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircleIcon size={20} color="var(--red)" />
                <div>
                  <strong>Job Posting Temporarily Suspended</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
                    Applications are not currently being accepted. Reason: {job.suspensionReason || 'Administrative review.'}
                  </p>
                </div>
              </div>
            ) : isDeadlinePassed ? (
              <div className="notice warn" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ClockIcon size={20} color="var(--amber)" />
                <div>
                  <strong>Application Deadline Has Passed</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
                    The deadline for this recruitment round ended on {formatDate(job.deadline)}.
                  </p>
                </div>
              </div>
            ) : eligibility && !isEligible ? (
              <div className="notice error" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <AlertCircleIcon size={20} color="var(--red)" style={{ marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <strong>Eligibility Requirements Not Met</strong>
                  <p style={{ margin: '4px 0 6px', fontSize: '0.84rem' }}>
                    {eligibility.ineligibleReason || 'You do not currently satisfy one or more eligibility criteria for this job posting.'}
                  </p>
                  {eligibility.reasons && eligibility.reasons.length > 0 && (
                    <ul style={{ margin: '0', paddingLeft: '18px', fontSize: '0.82rem' }}>
                      {eligibility.reasons.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {eligibility.checks?.naandiTraining === false && (
                    <div style={{ marginTop: '8px', padding: '8px', background: '#fff', borderRadius: '6px', border: '1px solid #fed7d7', fontSize: '0.8rem', color: '#742a2a' }}>
                      <b>Naandi Training Requirement:</b> Successful completion of mandatory Naandi soft-skills training must be verified in the institutional training module before applying.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="notice success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircleIcon size={20} color="var(--green)" />
                  <div>
                    <strong>You are eligible to apply for this position!</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      Your profile matches department, CGPA, and training requirements.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={() => onApplyClick?.(job)}
                  style={{ padding: '8px 18px', fontSize: '0.9rem' }}
                >
                  Apply Now →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Suspension notice for placement/company */}
        {!isStudent && isSuspended && (
          <div className="notice error" style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircleIcon size={20} color="var(--red)" />
            <div>
              <strong>Job Posting Suspended by Placement Cell</strong>
              <div style={{ fontSize: '0.84rem', marginTop: '2px' }}>
                Reason: {job.suspensionReason} {job.suspendedAt ? `(on ${formatDate(job.suspendedAt)})` : ''}
              </div>
            </div>
          </div>
        )}

        {/* Job Description (Role Overview, Purpose & Team Context) */}
        <section className="job-details-section">
          <h3 className="section-heading">Job Description & Role Overview</h3>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--ink)', fontSize: '0.92rem' }}>
            {job.description}
          </div>
        </section>

        {/* Job Responsibilities (Day-to-day duties & deliverables) */}
        {((Array.isArray(job.responsibilities) && job.responsibilities.length > 0) || (typeof job.responsibilities === 'string' && job.responsibilities.trim())) && (
          <section className="job-details-section" style={{ marginTop: '20px' }}>
            <h3 className="section-heading">Job Responsibilities & Deliverables</h3>
            <ul className="job-responsibilities-bullets">
              {Array.isArray(job.responsibilities)
                ? job.responsibilities.map((resp, i) => (
                    <li key={i}>{resp}</li>
                  ))
                : job.responsibilities
                    .split('\n')
                    .map((r) => r.trim())
                    .filter(Boolean)
                    .map((resp, i) => (
                      <li key={i}>{resp.replace(/^[-*•]\s*/, '')}</li>
                    ))
              }
            </ul>
          </section>
        )}

        {/* Eligibility Criteria Breakdown */}
        <section className="job-details-section" style={{ marginTop: '24px' }}>
          <h3 className="section-heading">Eligibility Criteria</h3>
          <div className="criteria-grid">
            <div className="criteria-card">
              <span className="criteria-label">Eligibility Mode</span>
              <strong>{job.eligibilityMode === 'ALL_STUDENTS' ? 'Open to All Students' : 'Restricted by Department / Criteria'}</strong>
            </div>
            <div className="criteria-card">
              <span className="criteria-label">Minimum CGPA</span>
              <strong>{minCgpa > 0 ? `${minCgpa} CGPA` : 'No Minimum CGPA'}</strong>
            </div>
            <div className="criteria-card">
              <span className="criteria-label">Active Backlogs Allowed</span>
              <strong>{maxBacklogs === null || maxBacklogs === undefined ? 'Any' : `${maxBacklogs} max`}</strong>
            </div>
            <div className="criteria-card">
              <span className="criteria-label">Mandatory Naandi Training</span>
              <strong style={{ color: requiresNaandi ? 'var(--navy)' : 'var(--muted)' }}>
                {requiresNaandi ? 'Yes (Verified Certificate Required)' : 'Not Required'}
              </strong>
            </div>
            <div className="criteria-card full-width">
              <span className="criteria-label">Allowed Passing Years</span>
              {passingYears.length > 0 ? (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {passingYears.map((yr) => (
                    <span key={yr} className="badge neutral">{yr}</span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '0.88rem', color: 'var(--navy)', fontWeight: 600, marginTop: '2px', display: 'block' }}>
                  Any Passing Year (All batches eligible)
                </span>
              )}
            </div>
            {allowedDepts.length > 0 && (
              <div className="criteria-card full-width">
                <span className="criteria-label">Eligible Departments</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {allowedDepts.map((d) => (
                    <span key={d._id || d.name} className="badge neutral">
                      {d.name || d.code || d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {allowedCourses.length > 0 && (
              <div className="criteria-card full-width">
                <span className="criteria-label">Eligible Courses</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {allowedCourses.map((c) => (
                    <span key={c._id || c.name} className="badge neutral">
                      {c.name || c.code || c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {criteria.requiredSkills?.length > 0 && (
              <div className="criteria-card full-width">
                <span className="criteria-label">Required Skills</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {criteria.requiredSkills.map((sk) => (
                    <span key={sk} className="badge neutral" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {criteria.preferredSkills?.length > 0 && (
              <div className="criteria-card full-width">
                <span className="criteria-label">Preferred Skills</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {criteria.preferredSkills.map((sk) => (
                    <span key={sk} className="badge neutral">{sk}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Selection Process */}
        {job.selectionProcess && job.selectionProcess.length > 0 && (
          <section className="job-details-section" style={{ marginTop: '24px' }}>
            <h3 className="section-heading">Selection Process</h3>
            <ol className="selection-steps-list">
              {job.selectionProcess.map((step, idx) => (
                <li key={idx} className="selection-step-item">
                  <span className="step-number">{idx + 1}</span>
                  <span className="step-name">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Additional Perks */}
        {job.compensation?.additionalPerks && (
          <section className="job-details-section" style={{ marginTop: '20px' }}>
            <h3 className="section-heading">Additional Perks & Benefits</h3>
            <p style={{ margin: 0, color: 'var(--ink)', fontSize: '0.9rem' }}>
              {job.compensation.additionalPerks}
            </p>
          </section>
        )}

        {/* History Audit Timeline (For Company & Placement Officers) */}
        {!isStudent && job.history && job.history.length > 0 && (
          <section className="job-details-section" style={{ marginTop: '26px' }}>
            <h3 className="section-heading">Lifecycle & Audit Timeline</h3>
            <div className="audit-timeline">
              {job.history.map((h, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{h.action}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        {formatDateTime(h.changedAt)}
                      </span>
                    </div>
                    {h.note && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                        {h.note}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer Actions */}
      <div className="modal-actions" style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>

        {/* Student Action */}
        {isStudent && !appliedApp && isEligible && isOpenStatus && !isSuspended && !isDeadlinePassed && (
          <button
            type="button"
            className="primary"
            onClick={() => onApplyClick?.(job)}
          >
            Apply for this Job →
          </button>
        )}

        {/* Company Actions */}
        {isCompany && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {has('JOB_UPDATE') && (
              <button
                type="button"
                className="secondary"
                onClick={() => onEditClick?.(job)}
                disabled={isSuspended}
                title={isSuspended ? 'Cannot edit suspended job' : 'Edit job details'}
              >
                <EditIcon size={15} /> Edit Job
              </button>
            )}
            {job.status === 'OPEN' && has('JOB_UPDATE') && (
              <button
                type="button"
                className="ghost"
                onClick={() => onStatusClick?.(job, 'PAUSED')}
                disabled={isSuspended}
              >
                Pause Job
              </button>
            )}
            {job.status === 'PAUSED' && has('JOB_UPDATE') && (
              <button
                type="button"
                className="secondary"
                onClick={() => onStatusClick?.(job, 'OPEN')}
                disabled={isSuspended}
              >
                Resume (Open)
              </button>
            )}
            {job.status === 'DRAFT' && has('JOB_UPDATE') && (
              <button
                type="button"
                className="primary"
                onClick={() => onStatusClick?.(job, 'OPEN')}
                disabled={isSuspended}
              >
                Publish Job
              </button>
            )}
            {['OPEN', 'PAUSED'].includes(job.status) && has('JOB_UPDATE') && (
              <button
                type="button"
                className="danger"
                onClick={() => onStatusClick?.(job, 'CLOSED')}
                disabled={isSuspended}
              >
                Close Job
              </button>
            )}
            {job.status === 'CLOSED' && has('JOB_UPDATE') && (
              <button
                type="button"
                className="primary"
                onClick={() => onReopenClick?.(job)}
                disabled={isSuspended}
              >
                Reopen Job (New Round)
              </button>
            )}
          </div>
        )}

        {/* Placement Cell Actions */}
        {isPlacementAdmin && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {has('JOB_UPDATE') && (
              <button
                type="button"
                className="secondary"
                onClick={() => onEditClick?.(job)}
              >
                <EditIcon size={15} /> Edit
              </button>
            )}
            {has('JOB_MANAGE') && (
              <button
                type="button"
                className={isSuspended ? 'secondary' : 'danger'}
                onClick={() => onSuspendClick?.(job)}
              >
                {isSuspended ? 'Restore Job Posting' : 'Suspend Job Posting'}
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
