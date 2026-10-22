import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { studentService } from '../../services/student.service.js';
import { applicationService } from '../../services/application.service.js';
import { getAssetUrl } from '../../services/api.js';
import {
  DocumentIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalLinkIcon,
  UploadIcon,
  XIcon
} from '../../components/common/Icons.jsx';
import { formatSalary, formatDate, getJobTypeLabel } from '../../utils/job-helpers.js';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

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

  // Job-specific custom resume (replaces profile resume for this application only)
  const [customResumeFile, setCustomResumeFile] = useState(null);
  const [customResumePreviewUrl, setCustomResumePreviewUrl] = useState(null);
  const [fileValidationError, setFileValidationError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    async function loadStudent() {
      try {
        setLoadingProfile(true);
        const data = await studentService.getMyProfile();
        if (mounted) {
          setStudentProfile(data);
        }
      } catch (err) {
        console.error('Failed to load student profile for application:', err);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    }
    loadStudent();
    setErrorInfo(null);
    setFileValidationError('');
    setCustomResumeFile(null);
    setCustomResumePreviewUrl(null);

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (customResumePreviewUrl) {
        URL.revokeObjectURL(customResumePreviewUrl);
      }
    };
  }, [customResumePreviewUrl]);

  if (!isOpen || !job) return null;

  const hasProfileResume = Boolean(studentProfile?.resume?.url && studentProfile.resume.url.trim());
  const isCustomResume = Boolean(customResumeFile);
  const hasActiveResume = isCustomResume || hasProfileResume;
  const companyName = job.companyId?.companyName || 'Recruiting Company';

  // Active resume metadata
  const displayedFileName = isCustomResume
    ? customResumeFile.name
    : (hasProfileResume ? (studentProfile.resume.fileName || 'Candidate_Resume.pdf') : '');

  const displayedFileSize = isCustomResume
    ? formatFileSize(customResumeFile.size)
    : (hasProfileResume && studentProfile.resume.fileSize ? formatFileSize(studentProfile.resume.fileSize) : '');

  // Skills Evaluation
  const criteria = job.eligibilityCriteria || {};
  const requiredSkills = Array.isArray(criteria.requiredSkills) ? criteria.requiredSkills : [];
  const preferredSkills = Array.isArray(criteria.preferredSkills) ? criteria.preferredSkills : [];
  const studentSkillSet = new Set((studentProfile?.skills || []).map((s) => s.toLowerCase().trim()));

  const matchedRequiredSkills = requiredSkills.filter((s) => studentSkillSet.has(s.toLowerCase().trim()));
  const unmatchedRequiredSkills = requiredSkills.filter((s) => !studentSkillSet.has(s.toLowerCase().trim()));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileValidationError('');

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const isPdf = file.type === 'application/pdf' || ext === '.pdf';
    if (!isPdf) {
      setFileValidationError('Invalid file type. Only PDF documents (.pdf) are permitted.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFileValidationError('File size exceeds the 5MB limit. Please upload a smaller PDF resume.');
      e.target.value = '';
      return;
    }

    if (customResumePreviewUrl) {
      URL.revokeObjectURL(customResumePreviewUrl);
    }

    setCustomResumeFile(file);
    setCustomResumePreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveCustomFile = () => {
    if (customResumePreviewUrl) {
      URL.revokeObjectURL(customResumePreviewUrl);
    }
    setCustomResumeFile(null);
    setCustomResumePreviewUrl(null);
    setFileValidationError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePreview = () => {
    if (isCustomResume && customResumePreviewUrl) {
      window.open(customResumePreviewUrl, '_blank');
    } else if (hasProfileResume && studentProfile.resume.url) {
      window.open(getAssetUrl(studentProfile.resume.url), '_blank');
    }
  };

  const handleSubmitApplication = async () => {
    try {
      setSubmitting(true);
      setErrorInfo(null);
      setFileValidationError('');

      let customResume = null;
      if (isCustomResume) {
        const fd = new FormData();
        fd.append('file', customResumeFile);
        const uploadResult = await applicationService.uploadResume(fd);
        customResume = {
          url: uploadResult.url,
          fileName: uploadResult.fileName || customResumeFile.name,
          fileSize: uploadResult.fileSize || customResumeFile.size,
          source: 'JOB_SPECIFIC'
        };
      } else if (!hasProfileResume) {
        setFileValidationError('Please upload a valid PDF resume before submitting.');
        setSubmitting(false);
        return;
      }

      const application = await applicationService.submitApplication({
        jobId: job._id,
        customResume
      });
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
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="600px">
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
            <div style={{ flex: 1 }}>
              {(() => {
                const failureReasons = errorInfo.details?.failureReasons || [];
                const isNaandiOnly =
                  (errorInfo.details?.checks?.naandiTraining?.passed === false ||
                    /naandi/i.test(errorInfo.message || '')) &&
                  failureReasons.length <= 1;

                if (isNaandiOnly) {
                  return (
                    <div>
                      <strong style={{ display: 'block', marginBottom: '2px', fontSize: '0.88rem' }}>
                        Naandi Certificate Required
                      </strong>
                      <p style={{ margin: '0 0 6px', fontSize: '0.84rem' }}>
                        A verified Naandi Training certificate is required to apply for this job.
                      </p>
                      <a
                        href="#/profile?tab=certificates&action=upload-naandi"
                        className="text-link"
                        onClick={onClose}
                        style={{ fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        Upload Certificate in My Profile &rarr;
                      </a>
                    </div>
                  );
                }

                return (
                  <div>
                    <strong style={{ display: 'block', marginBottom: '4px', fontSize: '0.88rem' }}>
                      {errorInfo.code === 'INELIGIBLE_FOR_JOB'
                        ? 'Eligibility Criteria Not Met'
                        : errorInfo.code === 'DUPLICATE_APPLICATION'
                        ? 'Application Already Submitted'
                        : 'Application Error'}
                    </strong>
                    {failureReasons.length > 0 ? (
                      <ul style={{ margin: '4px 0 0', paddingLeft: '18px', fontSize: '0.82rem' }}>
                        {failureReasons.map((r, i) => (
                          <li key={i} style={{ marginBottom: '2px' }}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.84rem' }}>{errorInfo.message}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Confirmation Box */}
      <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
        <h4 style={{ margin: '0 0 10px', fontSize: '0.88rem', color: 'var(--navy)' }}>
          Job Details
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

      {/* Skill Match Breakdown (Informational) */}
      {(requiredSkills.length > 0 || preferredSkills.length > 0) && (
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#1e3a8a' }}>
              Skills & Profile Matching
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#64748b' }}>
              <span>{matchedRequiredSkills.length} of {requiredSkills.length} listed</span>
              {unmatchedRequiredSkills.length > 0 && (
                <>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '13px',
                      height: '13px',
                      borderRadius: '50%',
                      border: '1.5px solid #94a3b8',
                      color: '#94a3b8',
                      fontSize: '0.6rem',
                      fontWeight: 700
                    }}>
                      •
                    </span>
                    Not on profile
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '24px', rowGap: '12px', fontSize: '0.84rem' }}>
            {matchedRequiredSkills.map((skill) => (
              <div
                key={skill}
                title="Listed on your profile"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <CheckCircleIcon size={16} color="#15803d" strokeWidth={1.9} />
                <strong>{skill}</strong>
              </div>
            ))}
            {unmatchedRequiredSkills.map((skill) => (
              <div
                key={skill}
                title="Not listed on your profile"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '15px',
                  height: '15px',
                  borderRadius: '50%',
                  border: '1.8px solid #94a3b8',
                  color: '#94a3b8',
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}>
                  •
                </span>
                <strong style={{ color: '#475569' }}>{skill}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume Section with Direct Card & Replace Option */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: '8px' }}>
          Resume
        </label>

        {/* Hidden File Input for Replace / Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {loadingProfile ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--muted)', padding: '12px' }}>
            Checking your verified profile resume…
          </div>
        ) : (
          <div style={{
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '10px',
            padding: '12px'
          }}>
            {hasActiveResume ? (
              <div>
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}>
                  {/* Left: Document Icon & Details */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <DocumentIcon size={24} color="var(--teal)" />
                    <div style={{ overflow: 'hidden' }}>
                      <strong style={{
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        color: 'var(--ink)',
                        display: 'block',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '280px'
                      }}>
                        {displayedFileName}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                        {displayedFileSize ? `${displayedFileSize} \u2022 ` : ''}
                        Ready for submission
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions (Preview, Replace, X) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={handlePreview}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '5px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#334155',
                        background: '#ffffff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Preview <ExternalLinkIcon size={12} />
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '5px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#334155',
                        background: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      Replace
                    </button>

                    {isCustomResume && (
                      <button
                        type="button"
                        onClick={handleRemoveCustomFile}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          width: '28px',
                          height: '28px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ef4444',
                          background: '#ffffff',
                          cursor: 'pointer',
                          padding: 0
                        }}
                        aria-label="Remove custom resume and revert"
                        title="Revert to default resume"
                      >
                        <XIcon size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* If student has no profile resume and hasn't uploaded one yet */
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: '16px 12px'
                }}
              >
                <UploadIcon size={26} color="var(--teal)" style={{ marginBottom: '6px' }} />
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--ink)' }}>
                  Click to choose a PDF resume
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: '2px' }}>
                  PDF document up to 5MB
                </div>
              </div>
            )}

            {fileValidationError && (
              <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '8px' }}>
                {fileValidationError}
              </div>
            )}
          </div>
        )}

        {/* Warning if no resume at all */}
        {!hasActiveResume && !loadingProfile && (
          <div className="notice warn" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <AlertCircleIcon size={18} color="var(--amber)" />
            <div style={{ fontSize: '0.82rem' }}>
              Please upload a resume for this job before submitting.
            </div>
          </div>
        )}
      </div>

      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleSubmitApplication}
          disabled={submitting || loadingProfile || !hasActiveResume}
        >
          {submitting ? 'Submitting Application…' : 'Confirm & Submit Application'}
        </button>
      </div>
    </Modal>
  );
}
