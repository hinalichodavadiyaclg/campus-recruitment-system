import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { getAssetUrl } from '../../services/api.js';
import { applicationService } from '../../services/application.service.js';
import {
  DocumentIcon,
  BuildingIcon,
  UserIcon,
  CalendarIcon,
  MapPinIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertCircleIcon,
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

function getAttemptBadgeInfo(attemptNumber = 1) {
  if (attemptNumber <= 1) {
    return { label: 'Attempt 1', badgeClass: 'neutral' };
  }
  if (attemptNumber === 2) {
    return { label: 'Reapplied (Attempt 2)', badgeClass: 'warning' };
  }
  return { label: 'Attempt 3 (Final)', badgeClass: 'danger' };
}

export function ApplicationDetailsModal({
  isOpen,
  onClose,
  application,
  onUpdateStatusClick,
  onWithdrawClick,
  canUpdateStatus,
  canWithdraw
}) {
  const [detailedApp, setDetailedApp] = useState(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState(null);

  // Load complete attempt history from server if not already fully attached
  useEffect(() => {
    if (!isOpen || !application?._id) {
      setDetailedApp(null);
      setSelectedAttemptId(null);
      return;
    }

    let mounted = true;
    if (!application.attemptHistory || application.attemptHistory.length === 0) {
      applicationService.getApplicationById(application._id)
        .then((full) => {
          if (mounted) {
            setDetailedApp(full);
            if (full.attemptHistory && full.attemptHistory.length > 0) {
              setSelectedAttemptId(full.attemptHistory[0]._id);
            }
          }
        })
        .catch((err) => {
          console.warn('Could not load enriched attempt history:', err);
          if (mounted) setDetailedApp(application);
        });
    } else {
      setDetailedApp(application);
      setSelectedAttemptId(application.attemptHistory[0]?._id || application._id);
    }

    return () => {
      mounted = false;
    };
  }, [isOpen, application]);

  const currentApp = detailedApp || application;
  if (!isOpen || !currentApp) return null;

  // Build sorted list of all attempts in descending order (Attempt 3, Attempt 2, Attempt 1)
  const attempts = useMemo(() => {
    const list = currentApp.attemptHistory?.length
      ? [...currentApp.attemptHistory]
      : currentApp.allAttempts?.length
      ? [...currentApp.allAttempts]
      : [currentApp];
    return list.sort((a, b) => {
      const roundDiff = (b.recruitmentRound || 1) - (a.recruitmentRound || 1);
      if (roundDiff !== 0) return roundDiff;
      const attemptDiff = (b.attemptNumber || 1) - (a.attemptNumber || 1);
      if (attemptDiff !== 0) return attemptDiff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [currentApp]);

  const latestAttempt = attempts[0] || currentApp;
  const activeAttempt = attempts.find((a) => String(a._id) === String(selectedAttemptId)) || latestAttempt;
  const isLatestAttempt = String(activeAttempt._id) === String(latestAttempt._id);

  // Data snapshots for the currently inspected attempt
  const jobSnap = activeAttempt.jobSnapshot || currentApp.jobSnapshot || {};
  const resumeSnap = activeAttempt.resumeSnapshot || {};
  const eligSnap = activeAttempt.eligibilitySnapshot || currentApp.eligibilitySnapshot || {};
  const statusHistory = activeAttempt.statusHistory || [];

  const jobTitle = jobSnap.title || currentApp.jobId?.title || 'Job Opportunity';
  const companyName =
    currentApp.companyId?.companyName || currentApp.jobId?.companyId?.companyName || 'Recruiting Company';
  const student = currentApp.studentId || {};
  const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Candidate';

  const activeStatusMeta = APPLICATION_STATUS_INFO[activeAttempt.status] || {
    label: activeAttempt.status,
    badgeClass: 'neutral'
  };

  const attemptBadge = getAttemptBadgeInfo(activeAttempt.attemptNumber || 1);

  // Find withdrawal reason & timestamp if current attempt was withdrawn
  const withdrawalRecord = activeAttempt.status === 'WITHDRAWN'
    ? [...statusHistory].reverse().find((s) => s.newStatus === 'WITHDRAWN')
    : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="820px">
      {/* Modal Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span className="job-id-pill" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
              {activeAttempt.applicationId || currentApp.applicationId}
            </span>
            <span className={`badge ${activeStatusMeta.badgeClass}`}>
              {activeStatusMeta.label}
            </span>
            <span className="badge neutral">Round {activeAttempt.recruitmentRound || currentApp.recruitmentRound || 1}</span>
            <span className={`badge ${attemptBadge.badgeClass}`}>
              {attemptBadge.label}
            </span>
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 4px', color: 'var(--ink)' }}>
            {jobTitle}
          </h2>
          <div style={{ fontSize: '0.88rem', color: 'var(--muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--navy)' }}>
              <BuildingIcon size={15} /> {companyName}
            </span>
            <span>
              Submitted on {formatDateTime(activeAttempt.createdAt || currentApp.createdAt)}
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

      {/* Multi-Attempt Navigation Tabs (Descending: Attempt 3, Attempt 2, Attempt 1) */}
      {attempts.length > 1 && (
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
            Application Attempts ({attempts.length})
          </div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {attempts.map((att) => {
              const isSelected = String(att._id) === String(activeAttempt._id);
              const isLatest = String(att._id) === String(latestAttempt._id);
              const attStatusInfo = APPLICATION_STATUS_INFO[att.status] || { label: att.status, badgeClass: 'neutral' };

              return (
                <button
                  key={att._id}
                  type="button"
                  onClick={() => setSelectedAttemptId(att._id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid var(--teal, #0f766e)' : '1px solid var(--line, #e2e8f0)',
                    background: isSelected ? '#f0fdfa' : '#f8fafc',
                    cursor: 'pointer',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: '0.82rem',
                    color: isSelected ? 'var(--teal, #0f766e)' : 'var(--ink, #1e293b)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    Attempt #{att.attemptNumber || 1}
                  </span>
                  <span className={`badge ${attStatusInfo.badgeClass}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                    {attStatusInfo.label}
                  </span>
                  {isLatest && (
                    <span className="badge teal" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                      Latest
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Historical Attempt Read-Only Notification Banner */}
      {!isLatestAttempt && (
        <div className="notice info" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircleIcon size={16} color="var(--blue, #2563eb)" />
            <span style={{ fontSize: '0.84rem' }}>
              Viewing historical <b>Attempt #{activeAttempt.attemptNumber}</b> ({activeAttempt.applicationId}). This record is locked and read-only.
            </span>
          </div>
          <button
            type="button"
            className="link-button"
            style={{ fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}
            onClick={() => setSelectedAttemptId(latestAttempt._id)}
          >
            Switch to Latest (Attempt #{latestAttempt.attemptNumber}) →
          </button>
        </div>
      )}

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
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.74rem' }}>Graduating Batch</span>
            <strong>{student.passingYear ? `${student.passingYear} Batch` : '—'}</strong>
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

      {/* Withdrawal Details Banner (if this attempt was withdrawn) */}
      {withdrawalRecord && (
        <div className="notice warning" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertCircleIcon size={18} color="var(--amber, #d97706)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.88rem', color: 'var(--amber-dark, #b45309)' }}>
                Application Withdrawn by Candidate
              </strong>
              <div style={{ fontSize: '0.82rem', marginTop: '2px', color: 'var(--ink)' }}>
                <b>Reason:</b> {withdrawalRecord.note || 'No reason provided.'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '4px' }}>
                Withdrawn on {formatDateTime(withdrawalRecord.changedAt)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attempt-Specific Submitted Resume Snapshot */}
      <div className="app-snapshot-box">
        <div className="app-snapshot-title">
          <DocumentIcon size={15} color="var(--teal)" /> Submitted Resume Snapshot (Attempt #{activeAttempt.attemptNumber || 1})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.88rem' }}>
                {resumeSnap.fileName || 'Candidate_Resume.pdf'}
              </strong>
              {resumeSnap.source === 'JOB_SPECIFIC' ? (
                <span className="badge teal" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  Job-Specific Resume
                </span>
              ) : (
                <span className="badge neutral" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  Profile Resume
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.76rem', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
              Submitted on {formatDateTime(resumeSnap.submittedAt || activeAttempt.createdAt || currentApp.createdAt)}
            </span>
          </div>
          {resumeSnap.url ? (
            <a
              href={getAssetUrl(resumeSnap.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="primary"
              style={{ padding: '6px 14px', fontSize: '0.82rem', textDecoration: 'none' }}
            >
              View Document <ExternalLinkIcon size={13} />
            </a>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Document URL not recorded</span>
          )}
        </div>
      </div>

      {/* Attempt-Specific Job Terms Snapshot */}
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
            <strong>Round {jobSnap.recruitmentRound || activeAttempt.recruitmentRound || 1}</strong>
          </div>
        </div>
      </div>

      {/* Attempt-Specific Eligibility Verification Snapshot */}
      {eligSnap.isEligible && (
        <div className="notice success" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleIcon size={18} color="var(--green)" />
          <div style={{ fontSize: '0.82rem' }}>
            <b>Verified Academic & Training Eligibility:</b> Candidate satisfied all department, CGPA, and mandatory Naandi training requirements upon Attempt #{activeAttempt.attemptNumber || 1} submission.
          </div>
        </div>
      )}

      {/* Attempt-Specific Status Progression History Timeline */}
      <div style={{ marginTop: '20px' }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', color: 'var(--navy)' }}>
          Status History & Audit Trail (Attempt #{activeAttempt.attemptNumber || 1})
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

      {/* Action Buttons Footer */}
      <div className="modal-actions" style={{ marginTop: '24px', borderTop: '1px solid var(--line)', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
        {!isLatestAttempt && (
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)', marginRight: 'auto' }}>
            (Historical attempt record locked — read only)
          </span>
        )}

        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>

        {isLatestAttempt && canWithdraw && (
          <button
            type="button"
            className="danger"
            onClick={() => onWithdrawClick?.(latestAttempt)}
          >
            Withdraw Application
          </button>
        )}

        {isLatestAttempt && canUpdateStatus && (
          <button
            type="button"
            className="primary"
            onClick={() => onUpdateStatusClick?.(latestAttempt)}
          >
            Update Recruitment Stage →
          </button>
        )}
      </div>
    </Modal>
  );
}
