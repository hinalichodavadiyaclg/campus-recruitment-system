import React from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import {
  DocumentIcon,
  BuildingIcon,
  UserIcon,
  CalendarIcon,
  MapPinIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
  ClockIcon,
  XIcon
} from '../../components/common/Icons.jsx';
import {
  formatDate,
  formatDateTime,
  formatSalary,
  getJobTypeLabel,
  getWorkModeLabel,
  APPLICATION_STATUS_INFO
} from '../../utils/job-helpers.js';

export function ApplicationDetailsModal({
  isOpen,
  onClose,
  application,
  onUpdateStatusClick,
  onWithdrawClick,
  canUpdateStatus,
  canWithdraw
}) {
  if (!isOpen || !application) return null;

  const jobSnap = application.jobSnapshot || {};
  const resumeSnap = application.resumeSnapshot || {};
  const eligSnap = application.eligibilitySnapshot || {};
  const statusHistory = application.statusHistory || [];

  const jobTitle = jobSnap.title || application.jobId?.title || 'Job Opportunity';
  const companyName =
    application.companyId?.companyName || application.jobId?.companyId?.companyName || 'Recruiting Company';
  const student = application.studentId || {};
  const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Candidate';

  const statusMeta = APPLICATION_STATUS_INFO[application.status] || {
    label: application.status,
    badgeClass: 'neutral'
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="780px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span className="job-id-pill">{application.applicationId}</span>
            <span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            <span className="badge neutral">Round {application.recruitmentRound || 1}</span>
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--ink)' }}>
            {jobTitle}
          </h2>
          <div style={{ fontSize: '0.88rem', color: 'var(--muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--navy)' }}>
              <BuildingIcon size={15} /> {companyName}
            </span>
            <span>
              Applied on {formatDate(application.createdAt)}
            </span>
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

      {/* Candidate Profile Details (For Recruiters / Placement) */}
      <div className="app-snapshot-box">
        <div className="app-snapshot-title">
          <UserIcon size={15} color="var(--teal)" /> Candidate Profile
        </div>
        <div className="app-snapshot-grid">
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Candidate Name</span>
            <strong>{studentName}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>University ID</span>
            <strong>{student.universityId || '—'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Department</span>
            <strong>{student.department || '—'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Academic CGPA</span>
            <strong>{student.cgpa !== undefined && student.cgpa !== null ? `${student.cgpa} CGPA` : '—'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Contact Email</span>
            <strong>{student.email || '—'}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Contact Mobile</span>
            <strong>{student.mobileNumber || '—'}</strong>
          </div>
        </div>
      </div>

      {/* Application-Time Resume Snapshot */}
      <div className="app-snapshot-box">
        <div className="app-snapshot-title">
          <DocumentIcon size={15} color="var(--teal)" /> Submitted Resume Snapshot
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong style={{ fontSize: '0.88rem', display: 'block' }}>
              {resumeSnap.fileName || 'Candidate_Resume.pdf'}
            </strong>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
              Submitted on {formatDateTime(resumeSnap.submittedAt || application.createdAt)}
            </span>
          </div>
          {resumeSnap.url ? (
            <a
              href={resumeSnap.url}
              target="_blank"
              rel="noopener noreferrer"
              className="primary"
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            >
              View Document <ExternalLinkIcon size={13} />
            </a>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Document URL not recorded</span>
          )}
        </div>
      </div>

      {/* Application-Time Job Snapshot */}
      <div className="app-snapshot-box">
        <div className="app-snapshot-title">
          <ClockIcon size={15} color="var(--teal)" /> Application-Time Job Terms (Snapshot)
        </div>
        <div className="app-snapshot-grid">
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Job Type</span>
            <strong>{getJobTypeLabel(jobSnap.jobType)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Work Mode</span>
            <strong>{getWorkModeLabel(jobSnap.workMode)} {jobSnap.location ? `(${jobSnap.location})` : ''}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Offered Compensation</span>
            <strong>{formatSalary(jobSnap.compensation)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Vacancies</span>
            <strong>{jobSnap.vacancies || 1}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Drive Deadline</span>
            <strong>{formatDate(jobSnap.deadline)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Recruitment Round</span>
            <strong>Round {jobSnap.recruitmentRound || 1}</strong>
          </div>
        </div>
      </div>

      {/* Eligibility Verification Snapshot */}
      {eligSnap.isEligible && (
        <div className="notice success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleIcon size={18} color="var(--green)" />
          <div style={{ fontSize: '0.82rem' }}>
            <b>Verified Academic & Training Eligibility:</b> Candidate satisfied all department, CGPA, and mandatory Naandi training requirements upon submission.
          </div>
        </div>
      )}

      {/* Stage Progression & Status History Timeline */}
      <div style={{ marginTop: '20px' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', color: 'var(--navy)' }}>
          Application Status History & Audit Trail
        </h4>
        <div className="audit-timeline">
          {statusHistory.map((step, idx) => {
            const stepInfo = APPLICATION_STATUS_INFO[step.newStatus] || {
              label: step.newStatus,
              badgeClass: 'neutral'
            };
            return (
              <div key={idx} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <strong style={{ fontSize: '0.86rem' }}>
                      <span className={`badge ${stepInfo.badgeClass}`} style={{ marginRight: '6px' }}>
                        {stepInfo.label}
                      </span>
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                      {formatDateTime(step.changedAt)}
                    </span>
                  </div>
                  {step.note && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--ink)', marginTop: '4px' }}>
                      {step.note}
                    </div>
                  )}
                  {step.changedBy && (
                    <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '2px' }}>
                      By: {step.changedBy.email || step.changedBy.userType || 'System'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="modal-actions" style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>

        {canWithdraw && (
          <button
            type="button"
            className="danger"
            onClick={() => onWithdrawClick?.(application)}
          >
            Withdraw Application
          </button>
        )}

        {canUpdateStatus && (
          <button
            type="button"
            className="primary"
            onClick={() => onUpdateStatusClick?.(application)}
          >
            Update Recruitment Stage →
          </button>
        )}
      </div>
    </Modal>
  );
}
