import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { studentService } from '../../services/student.service.js';
import { applicationService } from '../../services/application.service.js';
import {
  BriefcaseIcon,
  DocumentIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalLinkIcon
} from '../../components/common/Icons.jsx';
import { formatSalary, formatDate, getJobTypeLabel } from '../../utils/job-helpers.js';

export function JobApplyModal({
  isOpen,
  onClose,
  job,
  onSuccess
}) {
  const [studentProfile, setStudentProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    async function loadStudent() {
      try {
        setLoadingProfile(true);
        const data = await studentService.getMyProfile();
        if (mounted) setStudentProfile(data);
      } catch (err) {
        console.error('Failed to load student profile for application:', err);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    }
    loadStudent();
    setErrorInfo(null);
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen || !job) return null;

  const hasResume = Boolean(studentProfile?.resume?.url);
  const companyName = job.companyId?.companyName || 'Recruiting Company';

  const handleSubmitApplication = async () => {
    try {
      setSubmitting(true);
      setErrorInfo(null);
      const application = await applicationService.submitApplication(job._id);
      onSuccess?.(application);
      onClose();
    } catch (err) {
      setErrorInfo({
        code: err.code,
        message: err.message,
        details: err.details
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="560px">
      <div style={{ marginBottom: '16px' }}>
        <span className="job-id-pill">{job.jobId}</span>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '6px 0 2px', color: 'var(--ink)' }}>
          Apply for {job.title}
        </h2>
        <span style={{ fontSize: '0.88rem', color: 'var(--muted)', fontWeight: 600 }}>
          {companyName} &bull; Round {job.recruitmentRound || 1}
        </span>
      </div>

      {/* Error / Ineligibility Feedback Alert */}
      {errorInfo && (
        <div className="notice error" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <AlertCircleIcon size={20} color="var(--red)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '4px' }}>
                {errorInfo.code === 'INELIGIBLE_FOR_JOB'
                  ? 'Application Blocked — Eligibility Criteria Not Met'
                  : errorInfo.code === 'DUPLICATE_APPLICATION'
                  ? 'Application Already Submitted'
                  : 'Application Error'}
              </strong>
              <p style={{ margin: '0 0 6px', fontSize: '0.84rem' }}>{errorInfo.message}</p>

              {/* Ineligibility Details */}
              {errorInfo.details?.reasons && errorInfo.details.reasons.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.82rem' }}>
                  {errorInfo.details.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}

              {/* Naandi Training guidance */}
              {errorInfo.details?.checks?.naandiTraining === false && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  background: '#fff',
                  borderRadius: '6px',
                  border: '1px solid #fca5a5',
                  fontSize: '0.8rem',
                  color: '#991b1b'
                }}>
                  <b>Action Required:</b> Complete the mandatory Naandi Training workshop and verify completion with the Placement Cell or coordinator before submitting.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Confirmation Box */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
        <h4 style={{ margin: '0 0 10px', fontSize: '0.88rem', color: 'var(--navy)' }}>
          Application Snapshot Terms
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.84rem' }}>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.76rem' }}>Role & Type</span>
            <strong>{getJobTypeLabel(job.jobType)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.76rem' }}>Offered Compensation</span>
            <strong>{formatSalary(job.compensation)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.76rem' }}>Work Mode</span>
            <strong>{job.workMode} {job.location ? `(${job.location})` : ''}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.76rem' }}>Application Deadline</span>
            <strong>{formatDate(job.deadline)}</strong>
          </div>
        </div>
      </div>

      {/* Resume Attachment Verification */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: '6px' }}>
          Submitted Resume Snapshot
        </label>
        {loadingProfile ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>Checking verified resume…</div>
        ) : hasResume ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DocumentIcon size={20} color="var(--teal)" />
              <div>
                <strong style={{ fontSize: '0.86rem', display: 'block' }}>
                  {studentProfile.resume.fileName || 'Candidate_Resume.pdf'}
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                  Active resume from your verified student profile
                </span>
              </div>
            </div>
            {studentProfile.resume.url && (
              <a
                href={studentProfile.resume.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
                style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                Preview <ExternalLinkIcon size={13} />
              </a>
            )}
          </div>
        ) : (
          <div className="notice warn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircleIcon size={18} color="var(--amber)" />
            <div style={{ fontSize: '0.84rem' }}>
              No verified resume uploaded to your profile.{' '}
              <a href="#/profile" className="text-link" onClick={onClose}>
                Upload Resume in My Profile →
              </a>
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45, marginBottom: '18px' }}>
        By clicking <b>Submit Application</b>, an immutable snapshot of your academic records, resume, and eligibility verification will be transmitted to {companyName} and university placement officers.
      </div>

      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleSubmitApplication}
          disabled={submitting || loadingProfile || !hasResume}
        >
          {submitting ? 'Submitting Application…' : 'Confirm & Submit Application'}
        </button>
      </div>
    </Modal>
  );
}
