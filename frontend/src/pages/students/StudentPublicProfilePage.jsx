import React, { useState, useEffect } from 'react';
import { studentService } from '../../services/student.service.js';
import { getAssetUrl } from '../../services/api.js';
import { Modal } from '../../components/common/Modal.jsx';
import {
  LockIcon,
  GraduationCapIcon,
  DocumentIcon,
  ZapIcon,
  FolderIcon,
  BriefcaseIcon,
  AwardIcon,
  CodeIcon,
  ExternalLinkIcon
} from '../../components/common/Icons.jsx';

export function StudentPublicProfilePage({ studentId }) {
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewCert, setPreviewCert] = useState(null);

  const isImageFile = (url) => {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].toLowerCase();
    if (clean.includes('/uploads/photos/')) return true;
    return (
      clean.endsWith('.png') ||
      clean.endsWith('.jpg') ||
      clean.endsWith('.jpeg') ||
      clean.endsWith('.jfif') ||
      clean.endsWith('.pjpeg') ||
      clean.endsWith('.pjp') ||
      clean.endsWith('.webp') ||
      clean.endsWith('.gif') ||
      clean.endsWith('.svg') ||
      clean.endsWith('.bmp') ||
      clean.endsWith('.ico') ||
      clean.startsWith('data:image/')
    );
  };

  const isPdfFile = (url) => {
    if (!url || typeof url !== 'string') return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.pdf') || clean.startsWith('data:application/pdf');
  };

  useEffect(() => {
    async function fetchPublicProfile() {
      setLoading(true);
      setError('');
      try {
        const id = studentId || window.location.hash.split('/').pop();
        const data = await studentService.getPublicProfile(id);
        setStudent(data);
      } catch (err) {
        setError(err.message || 'Unable to load student profile.');
      } finally {
        setLoading(false);
      }
    }
    fetchPublicProfile();
  }, [studentId]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f8fafc)' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <p>Loading student profile…</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f8fafc)', padding: '20px' }}>
        <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <LockIcon size={48} color="var(--text-muted, #64748b)" />
          </div>
          <h2>Profile Unavailable</h2>
          <p className="notice warning" style={{ marginTop: '12px' }}>
            {error || 'This student profile does not exist or is set to private by the student.'}
          </p>
          <a href="#/login" className="button primary" style={{ marginTop: '20px', display: 'inline-block' }}>
            Return to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f8fafc)', padding: '24px 16px' }}>
      <div style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Header Profile Banner Card */}
        <article className="card" style={{ padding: '32px', borderTop: '4px solid var(--blue, #0284c7)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '96px',
                height: '96px',
                borderRadius: '50%',
                background: 'var(--blue-light, #e0f2fe)',
                color: 'var(--blue, #0284c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                fontWeight: 'bold',
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
            >
              {student.profilePhoto ? (
                <img src={getAssetUrl(student.profilePhoto)} alt={`${student.firstName} ${student.lastName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                `${student.firstName ? student.firstName[0] : ''}${student.lastName ? student.lastName[0] : ''}`
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: '28px', color: 'var(--text-heading, #0f172a)' }}>
                    {student.firstName} {student.lastName}
                  </h1>
                  <p style={{ margin: '4px 0 8px', fontSize: '1.1em', color: 'var(--blue, #0284c7)', fontWeight: 600 }}>
                    {student.branch} • {student.department}
                  </p>
                  <small style={{ color: 'var(--text-muted)' }}>
                    University ID: <strong>{student.universityId}</strong> • Passing Year: <strong>{student.passingYear || 'N/A'}</strong>
                  </small>
                </div>

                {student.resume?.url && (
                  <a href={getAssetUrl(student.resume.url)} target="_blank" rel="noreferrer" className="button primary">
                    <DocumentIcon size={16} /> View Resume
                  </a>
                )}
              </div>

              {student.careerObjective && (
                <p style={{ marginTop: '16px', fontStyle: 'italic', color: 'var(--text-muted)', borderLeft: '3px solid var(--blue, #0284c7)', paddingLeft: '12px' }}>
                  "{student.careerObjective}"
                </p>
              )}

              {/* Social / Link Badges */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
                {student.githubUrl && (
                  <a href={student.githubUrl} target="_blank" rel="noreferrer" className="badge" style={{ background: '#24292e', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <CodeIcon size={14} /> GitHub Profile
                  </a>
                )}
                {student.linkedinUrl && (
                  <a href={student.linkedinUrl} target="_blank" rel="noreferrer" className="badge" style={{ background: '#0a66c2', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <ExternalLinkIcon size={14} /> LinkedIn Profile
                  </a>
                )}
                {student.portfolioUrl && (
                  <a href={student.portfolioUrl} target="_blank" rel="noreferrer" className="badge" style={{ background: 'var(--blue, #0284c7)', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <ExternalLinkIcon size={14} /> Portfolio Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </article>

        {/* Academic Highlights */}
        <article className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GraduationCapIcon size={20} color="var(--primary, #0284c7)" /> Academic Summary
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div>
              <small style={{ color: 'var(--text-muted)' }}>Department</small>
              <div><strong>{student.department}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--text-muted)' }}>Branch</small>
              <div><strong>{student.branch}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--text-muted)' }}>Semester</small>
              <div><strong>Semester {student.semester}</strong></div>
            </div>
            <div>
              <small style={{ color: 'var(--text-muted)' }}>CGPA</small>
              <div><strong style={{ fontSize: '1.2em', color: 'var(--green, #16a34a)' }}>{student.cgpa?.toFixed(2)}</strong> / 10.0</div>
            </div>
            <div>
              <small style={{ color: 'var(--text-muted)' }}>Active Backlogs</small>
              <div><strong>{student.backlogs ?? 0}</strong></div>
            </div>
          </div>
        </article>

        {/* About / Bio */}
        {student.bio && (
          <article className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DocumentIcon size={20} color="var(--primary, #0284c7)" /> About
            </h3>
            <p style={{ lineHeight: 1.6, margin: '12px 0 0' }}>{student.bio}</p>
          </article>
        )}

        {/* Skills */}
        {student.skills?.length > 0 && (
          <article className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ZapIcon size={20} color="#eab308" /> Skills & Technical Expertise
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
              {student.skills.map((s, idx) => (
                <span key={idx} className="badge" style={{ padding: '6px 12px', fontSize: '0.9em', background: 'var(--blue-light, #e0f2fe)', color: 'var(--blue, #0284c7)' }}>
                  {s}
                </span>
              ))}
            </div>
          </article>
        )}

        {/* Projects */}
        {student.projects?.length > 0 && (
          <article className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderIcon size={20} color="#7c3aed" /> Projects
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              {student.projects.map((p) => (
                <div key={p._id} style={{ borderLeft: '3px solid var(--blue, #0284c7)', paddingLeft: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1em' }}>{p.title}</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {p.projectUrl && <a href={p.projectUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.85em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Live Demo <ExternalLinkIcon size={12} /></a>}
                      {p.githubUrl && <a href={p.githubUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.85em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>GitHub <ExternalLinkIcon size={12} /></a>}
                    </div>
                  </div>
                  <p style={{ margin: '6px 0', color: 'var(--text-muted)' }}>{p.description}</p>
                  {p.technologies?.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {p.technologies.map((t, i) => (
                        <span key={i} className="badge" style={{ fontSize: '0.75em', background: '#f1f5f9' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>
        )}

        {/* Internships & Experience */}
        {student.internships?.length > 0 && (
          <article className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BriefcaseIcon size={20} color="#16a34a" /> Internships & Experience
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              {student.internships.map((exp) => (
                <div key={exp._id} style={{ borderLeft: '3px solid var(--green, #16a34a)', paddingLeft: '16px' }}>
                  <h4 style={{ margin: 0 }}>{exp.role} @ {exp.organization}</h4>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {exp.startDate} {exp.endDate ? `- ${exp.endDate}` : ''}
                  </small>
                  <p style={{ margin: '6px 0', color: 'var(--text-muted)' }}>{exp.description}</p>
                </div>
              ))}
            </div>
          </article>
        )}

        {/* Certifications */}
        {student.certificates?.length > 0 && (
          <article className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AwardIcon size={20} color="#0d9488" /> Certifications
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginTop: '16px' }}>
              {student.certificates.map((c) => (
                <div key={c._id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AwardIcon size={16} color="#0d9488" /> {c.name}
                    </h4>
                    <p style={{ margin: '4px 0 10px', fontSize: '0.9em', color: 'var(--text-muted)' }}>
                      Issued by <strong>{c.issuingOrganization}</strong> {c.issueDate ? `• ${c.issueDate}` : ''}
                    </p>

                    {/* Direct Certificate Image / PDF Display */}
                    {c.fileUrl && (
                      <div
                        onClick={() => setPreviewCert(c)}
                        title="Click to view full size"
                        style={{
                          marginTop: '10px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid var(--border)',
                          background: '#0f172a',
                          padding: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        {isImageFile(c.fileUrl) ? (
                          <img
                            src={getAssetUrl(c.fileUrl)}
                            alt={c.name}
                            style={{ display: 'block', width: '100%', maxHeight: '420px', objectFit: 'contain', margin: '0 auto', borderRadius: '4px' }}
                          />
                        ) : (
                          <iframe
                            src={getAssetUrl(c.fileUrl)}
                            title={c.name}
                            style={{ width: '100%', height: '420px', border: 'none', borderRadius: '4px', background: '#fff' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}

        {/* Achievements */}
        {student.achievements?.length > 0 && (
          <article className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AwardIcon size={20} color="#d97706" /> Honors & Achievements
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              {student.achievements.map((a) => (
                <div key={a._id}>
                  <h4 style={{ margin: 0 }}>{a.title}</h4>
                  <small style={{ color: 'var(--text-muted)' }}>
                    {a.issuingOrganization} {a.date ? `• ${a.date}` : ''}
                  </small>
                  <p style={{ margin: '4px 0', color: 'var(--text-muted)' }}>{a.description}</p>
                </div>
              ))}
            </div>
          </article>
        )}

        <footer style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.9em' }}>
          Campus Recruitment System • Student Verified Profile
        </footer>
      </div>

      {/* MODAL: Watch / Preview Certificate */}
      <Modal isOpen={!!previewCert} onClose={() => setPreviewCert(null)} title={previewCert?.name || 'Certificate'}>
        {previewCert && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '1.2em' }}>{previewCert.name}</h4>
            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>
              Issued by <strong>{previewCert.issuingOrganization}</strong> {previewCert.issueDate ? `• ${previewCert.issueDate}` : ''}
            </p>

            {previewCert.fileUrl ? (
              isImageFile(previewCert.fileUrl) ? (
                <div style={{ maxHeight: '70vh', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--border)', background: '#0f172a', padding: '12px', display: 'flex', justifyContent: 'center' }}>
                  <img
                    src={getAssetUrl(previewCert.fileUrl)}
                    alt={previewCert.name}
                    style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '4px' }}
                  />
                </div>
              ) : (
                <iframe
                  src={getAssetUrl(previewCert.fileUrl)}
                  title={previewCert.name}
                  style={{ width: '100%', height: '520px', border: 'none', borderRadius: '8px', background: '#fff' }}
                />
              )
            ) : (
              <p style={{ color: 'var(--text-muted)', padding: '20px' }}>No image or document file attached to this certificate.</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <button type="button" className="button primary" onClick={() => setPreviewCert(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
