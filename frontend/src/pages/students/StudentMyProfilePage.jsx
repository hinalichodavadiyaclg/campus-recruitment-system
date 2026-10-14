import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { studentService } from '../../services/student.service.js';
import { getAssetUrl } from '../../services/api.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { GraduationCapIcon, InfoIcon, AwardIcon, ExternalLinkIcon } from '../../components/common/Icons.jsx';

export function StudentMyProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Form states for modals
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [editingCert, setEditingCert] = useState(null);
  const [certForm, setCertForm] = useState({ name: '', issuingOrganization: '', issueDate: '', credentialId: '', credentialUrl: '', fileUrl: '' });

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [projectForm, setProjectForm] = useState({ title: '', description: '', technologies: '', projectUrl: '', githubUrl: '', startDate: '', endDate: '' });

  const [internshipModalOpen, setInternshipModalOpen] = useState(false);
  const [editingInternship, setEditingInternship] = useState(null);
  const [internshipForm, setInternshipForm] = useState({ organization: '', role: '', description: '', startDate: '', endDate: '', documentUrl: '' });

  const [achievementModalOpen, setAchievementModalOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState(null);
  const [achievementForm, setAchievementForm] = useState({ title: '', description: '', date: '', issuingOrganization: '', documentUrl: '' });

  // Basic profile form state
  const [bioForm, setBioForm] = useState({
    profilePhoto: '',
    bio: '',
    careerObjective: '',
    skills: '',
    githubUrl: '',
    linkedinUrl: '',
    portfolioUrl: '',
    isPublicProfile: true
  });
  const [savingBio, setSavingBio] = useState(false);
  const [bioErrors, setBioErrors] = useState({});
  const [certErrors, setCertErrors] = useState({});
  const [projectErrors, setProjectErrors] = useState({});
  const [internshipErrors, setInternshipErrors] = useState({});
  const [achievementErrors, setAchievementErrors] = useState({});

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [certFile, setCertFile] = useState(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [previewCert, setPreviewCert] = useState(null);

  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    loading: false
  });

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

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await studentService.uploadPhoto(fd);
      toast('Profile photo updated!');
      if (res?.profilePhoto) {
        setStudent((prev) => (prev ? { ...prev, profilePhoto: res.profilePhoto } : prev));
        setBioForm((prev) => ({ ...prev, profilePhoto: res.profilePhoto }));
      }
      loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleDeletePhoto = () => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Remove Profile Photo',
      message: 'Are you sure you want to remove your profile photo?',
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, loading: true }));
        try {
          await studentService.deletePhoto();
          toast('Profile photo removed.');
          setStudent((prev) => (prev ? { ...prev, profilePhoto: '' } : prev));
          setBioForm((prev) => ({ ...prev, profilePhoto: '' }));
          loadProfile();
        } catch (err) {
          toast(err.message || 'Failed to remove photo');
        } finally {
          setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
        }
      }
    });
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await studentService.getMyProfile();
      setStudent(data);
      setBioForm({
        profilePhoto: data.profilePhoto || '',
        bio: data.bio || '',
        careerObjective: data.careerObjective || '',
        skills: Array.isArray(data.skills) ? data.skills.join(', ') : '',
        githubUrl: data.githubUrl || '',
        linkedinUrl: data.linkedinUrl || '',
        portfolioUrl: data.portfolioUrl || '',
        isPublicProfile: data.isPublicProfile !== undefined ? data.isPublicProfile : true
      });
    } catch (err) {
      toast(err.message || 'Failed to load student profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSaveBio = async (e) => {
    e.preventDefault();
    const errors = {};
    const checkUrl = (val, fieldName) => {
      if (!val) return;
      try {
        const u = val.startsWith('http://') || val.startsWith('https://') ? val : `https://${val}`;
        new URL(u);
      } catch (_) {
        errors[fieldName] = 'Please enter a valid URL (e.g. https://...)';
      }
    };
    checkUrl(bioForm.githubUrl, 'githubUrl');
    checkUrl(bioForm.linkedinUrl, 'linkedinUrl');
    checkUrl(bioForm.portfolioUrl, 'portfolioUrl');

    if (Object.keys(errors).length > 0) {
      setBioErrors(errors);
      return;
    }

    setBioErrors({});
    setSavingBio(true);
    try {
      const skillsArray = bioForm.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const updated = await studentService.updateMyProfile({
        profilePhoto: bioForm.profilePhoto,
        bio: bioForm.bio,
        careerObjective: bioForm.careerObjective,
        skills: skillsArray,
        githubUrl: bioForm.githubUrl,
        linkedinUrl: bioForm.linkedinUrl,
        portfolioUrl: bioForm.portfolioUrl,
        isPublicProfile: bioForm.isPublicProfile
      });
      setStudent(updated);
      toast('Profile information saved successfully!');
    } catch (err) {
      toast(err.message || 'Failed to save profile');
    } finally {
      setSavingBio(false);
    }
  };

  const handleResumeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingResume(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await studentService.uploadResume(fd);
      toast('Resume uploaded successfully!');
      loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to upload resume');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleDeleteResume = () => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Resume',
      message: 'Are you sure you want to delete your uploaded resume?',
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, loading: true }));
        try {
          await studentService.deleteResume();
          toast('Resume deleted.');
          loadProfile();
        } catch (err) {
          toast(err.message || 'Failed to delete resume');
        } finally {
          setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
        }
      }
    });
  };

  // Certificate handlers
  const handleSaveCert = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!certForm.name?.trim()) {
      errors.name = 'Certificate Name is required.';
    }
    if (!certForm.issuingOrganization?.trim()) {
      errors.issuingOrganization = 'Issuing Organization is required.';
    }
    if (Object.keys(errors).length > 0) {
      setCertErrors(errors);
      return;
    }
    setCertErrors({});
    setUploadingCert(true);
    try {
      let payload;
      if (certFile) {
        payload = new FormData();
        payload.append('name', certForm.name || '');
        payload.append('issuingOrganization', certForm.issuingOrganization || '');
        payload.append('issueDate', certForm.issueDate || '');
        payload.append('credentialId', certForm.credentialId || '');
        payload.append('credentialUrl', certForm.credentialUrl || '');
        payload.append('file', certFile);
      } else {
        payload = { ...certForm };
      }

      if (editingCert) {
        await studentService.updateCertificate(editingCert._id, payload);
        toast('Certificate updated.');
      } else {
        await studentService.addCertificate(payload);
        toast('Certificate added.');
      }
      setCertModalOpen(false);
      setCertFile(null);
      loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to save certificate');
    } finally {
      setUploadingCert(false);
    }
  };

  const handleDeleteCert = (id) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Certificate',
      message: 'Are you sure you want to delete this certificate record? This action cannot be undone.',
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, loading: true }));
        try {
          await studentService.deleteCertificate(id);
          toast('Certificate deleted.');
          loadProfile();
        } catch (err) {
          toast(err.message || 'Failed to delete certificate');
        } finally {
          setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
        }
      }
    });
  };

  // Project handlers
  const handleSaveProject = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!projectForm.title?.trim()) {
      errors.title = 'Project Title is required.';
    }
    if (Object.keys(errors).length > 0) {
      setProjectErrors(errors);
      return;
    }
    setProjectErrors({});
    try {
      const techArray = projectForm.technologies
        ? projectForm.technologies.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
      const payload = { ...projectForm, technologies: techArray };

      if (editingProject) {
        await studentService.updateProject(editingProject._id, payload);
        toast('Project updated.');
      } else {
        await studentService.addProject(payload);
        toast('Project added.');
      }
      setProjectModalOpen(false);
      loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to save project');
    }
  };

  const handleDeleteProject = (id) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Project',
      message: 'Are you sure you want to delete this project record?',
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, loading: true }));
        try {
          await studentService.deleteProject(id);
          toast('Project deleted.');
          loadProfile();
        } catch (err) {
          toast(err.message || 'Failed to delete project');
        } finally {
          setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
        }
      }
    });
  };

  // Internship handlers
  const handleSaveInternship = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!internshipForm.organization?.trim()) {
      errors.organization = 'Organization is required.';
    }
    if (!internshipForm.role?.trim()) {
      errors.role = 'Role / Position is required.';
    }
    if (Object.keys(errors).length > 0) {
      setInternshipErrors(errors);
      return;
    }
    setInternshipErrors({});
    try {
      if (editingInternship) {
        await studentService.updateInternship(editingInternship._id, internshipForm);
        toast('Experience updated.');
      } else {
        await studentService.addInternship(internshipForm);
        toast('Experience added.');
      }
      setInternshipModalOpen(false);
      loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to save internship');
    }
  };

  const handleDeleteInternship = (id) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Experience Record',
      message: 'Are you sure you want to delete this internship/experience record?',
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, loading: true }));
        try {
          await studentService.deleteInternship(id);
          toast('Internship deleted.');
          loadProfile();
        } catch (err) {
          toast(err.message || 'Failed to delete internship');
        } finally {
          setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
        }
      }
    });
  };

  // Achievement handlers
  const handleSaveAchievement = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!achievementForm.title?.trim()) {
      errors.title = 'Achievement Title is required.';
    }
    if (Object.keys(errors).length > 0) {
      setAchievementErrors(errors);
      return;
    }
    setAchievementErrors({});
    try {
      if (editingAchievement) {
        await studentService.updateAchievement(editingAchievement._id, achievementForm);
        toast('Achievement updated.');
      } else {
        await studentService.addAchievement(achievementForm);
        toast('Achievement added.');
      }
      setAchievementModalOpen(false);
      loadProfile();
    } catch (err) {
      toast(err.message || 'Failed to save achievement');
    }
  };

  const handleDeleteAchievement = (id) => {
    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Achievement',
      message: 'Are you sure you want to delete this achievement record?',
      onConfirm: async () => {
        setDeleteConfirm((prev) => ({ ...prev, loading: true }));
        try {
          await studentService.deleteAchievement(id);
          toast('Achievement deleted.');
          loadProfile();
        } catch (err) {
          toast(err.message || 'Failed to delete achievement');
        } finally {
          setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false });
        }
      }
    });
  };

  const shareableUrl = student ? `${window.location.origin}/#/student-profile/${student._id}` : '';

  return (
    <PortalLayout
      title="My Student Profile"
      subtitle="Manage your academic, professional details, resume, projects, and public profile."
      currentPath="/my-profile"
    >
      {loading ? (
        <article className="card">
          <p className="empty">Loading student profile…</p>
        </article>
      ) : !student ? (
        <article className="card">
          <p className="notice error">No student record found linked to your account.</p>
        </article>
      ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Summary Card */}
          <article className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'var(--blue-light, #e0f2fe)',
                  color: 'var(--blue, #0284c7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  fontWeight: 'bold',
                  overflow: 'hidden'
                }}
              >
                {student.profilePhoto ? (
                  <img src={getAssetUrl(student.profilePhoto)} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                ) : (
                  `${student.firstName ? student.firstName[0] : ''}${student.lastName ? student.lastName[0] : ''}`
                )}
              </div>
              <div>
                <h2 style={{ margin: 0 }}>{student.firstName} {student.lastName}</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
                  {student.branch} ({student.department}) • ID: <strong>{student.universityId}</strong>
                </p>
                <span className={`badge ${student.isPublicProfile ? 'success' : 'warning'}`} style={{ marginTop: '6px', display: 'inline-block' }}>
                  {student.isPublicProfile ? 'Public Profile Enabled' : 'Private Profile'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <a
                className="button primary"
                href={`#/student-profile/${student._id}`}
                target="_blank"
                rel="noreferrer"
              >
                View Shareable Profile ↗
              </a>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareableUrl);
                  toast('Shareable profile URL copied to clipboard!');
                }}
              >
                Copy Link 📋
              </button>
            </div>
          </article>

          {/* Official Academic Record Card (Read-Only) */}
          <div className="card" style={{ padding: '16px 20px', backgroundColor: 'var(--surface-subtle, #f8fafc)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <GraduationCapIcon size={16} color="var(--primary, #0284c7)" /> Official Academic Record <span className="badge" style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569' }}>Read-Only</span>
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <InfoIcon size={14} color="var(--text-muted)" /> Academic records are verified and managed by Placement Cell staff
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', fontSize: '13px' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>University ID:</span> <strong>{student.universityId}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Department:</span> <strong>{student.department}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Branch:</span> <strong>{student.branch}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Semester:</span> <strong>{student.semester}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>CGPA:</span> <strong>{student.cgpa} / 10.0</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Backlogs:</span> <strong>{student.backlogs ?? 0}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Passing Year:</span> <strong>{student.passingYear || 'N/A'}</strong></div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="tab-nav" style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
              style={{ padding: '8px 16px', background: activeTab === 'overview' ? 'var(--blue, #0284c7)' : 'transparent', color: activeTab === 'overview' ? '#fff' : 'inherit', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Overview & Bio
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'resume' ? 'active' : ''}`}
              onClick={() => setActiveTab('resume')}
              style={{ padding: '8px 16px', background: activeTab === 'resume' ? 'var(--blue, #0284c7)' : 'transparent', color: activeTab === 'resume' ? '#fff' : 'inherit', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Resume
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'projects' ? 'active' : ''}`}
              onClick={() => setActiveTab('projects')}
              style={{ padding: '8px 16px', background: activeTab === 'projects' ? 'var(--blue, #0284c7)' : 'transparent', color: activeTab === 'projects' ? '#fff' : 'inherit', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Projects ({student.projects?.length || 0})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'internships' ? 'active' : ''}`}
              onClick={() => setActiveTab('internships')}
              style={{ padding: '8px 16px', background: activeTab === 'internships' ? 'var(--blue, #0284c7)' : 'transparent', color: activeTab === 'internships' ? '#fff' : 'inherit', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Experience ({student.internships?.length || 0})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'certificates' ? 'active' : ''}`}
              onClick={() => setActiveTab('certificates')}
              style={{ padding: '8px 16px', background: activeTab === 'certificates' ? 'var(--blue, #0284c7)' : 'transparent', color: activeTab === 'certificates' ? '#fff' : 'inherit', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Certificates ({student.certificates?.length || 0})
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'achievements' ? 'active' : ''}`}
              onClick={() => setActiveTab('achievements')}
              style={{ padding: '8px 16px', background: activeTab === 'achievements' ? 'var(--blue, #0284c7)' : 'transparent', color: activeTab === 'achievements' ? '#fff' : 'inherit', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Achievements ({student.achievements?.length || 0})
            </button>
          </div>

          {/* TAB 1: OVERVIEW & BIO */}
          {activeTab === 'overview' && (
            <article className="card">
              <h3>Personal & Academic Overview</h3>
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', margin: '16px 0 24px' }}>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Email</small>
                  <div><strong>{student.email}</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Mobile</small>
                  <div><strong>{student.mobileNumber}</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Semester</small>
                  <div><strong>Semester {student.semester}</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>CGPA</small>
                  <div><strong>{student.cgpa?.toFixed(2)}</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Backlogs</small>
                  <div><strong>{student.backlogs ?? 0}</strong></div>
                </div>
                <div>
                  <small style={{ color: 'var(--text-muted)' }}>Passing Year</small>
                  <div><strong>{student.passingYear || 'N/A'}</strong></div>
                </div>
              </div>

              <hr style={{ borderColor: 'var(--border)', margin: '24px 0' }} />

              <h3>Edit About & Links</h3>
              <form
                onSubmit={handleSaveBio}
                noValidate
                style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
              >
                {/* Section 1: Profile Media & Bio */}
                <div style={{ marginTop: '4px', marginBottom: '2px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    👤 Profile Media & Bio
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                    Avatar image, professional biography, and career goals
                  </p>
                </div>

                <div className="field">
                  <label>Profile Photo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-card-subtle, #f8fafc)' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'var(--blue-light, #e0f2fe)',
                        color: 'var(--blue, #0284c7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '20px',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}
                    >
                      {student.profilePhoto ? (
                        <img src={getAssetUrl(student.profilePhoto)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        `${student.firstName ? student.firstName[0] : ''}${student.lastName ? student.lastName[0] : ''}`
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      />
                      <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Upload a photo from your device (PNG, JPG, JPEG, WebP)
                      </small>
                    </div>
                    {student.profilePhoto && (
                      <button
                        type="button"
                        className="button ghost"
                        style={{ color: 'var(--red, red)' }}
                        onClick={handleDeletePhoto}
                        disabled={uploadingPhoto}
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label>About / Bio</label>
                  <textarea
                    rows="3"
                    placeholder="Brief professional intro..."
                    value={bioForm.bio}
                    onChange={(e) => setBioForm({ ...bioForm, bio: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Career Objective</label>
                  <textarea
                    rows="2"
                    placeholder="Your primary career goals..."
                    value={bioForm.careerObjective}
                    onChange={(e) => setBioForm({ ...bioForm, careerObjective: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Skills (comma separated)</label>
                  <input
                    placeholder="JavaScript, React, Node.js, Python, SQL"
                    value={bioForm.skills}
                    onChange={(e) => setBioForm({ ...bioForm, skills: e.target.value })}
                  />
                </div>

                {/* Section 2: Online Presence & Portfolios */}
                <div style={{ marginTop: '8px', marginBottom: '2px', borderTop: '1px solid #e9eef3', paddingTop: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ExternalLinkIcon size={16} color="var(--primary, #0284c7)" /> Professional Links & Visibility
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                    Social coding links, portfolio URLs, and public profile switch
                  </p>
                </div>

                <div className="field">
                  <label>GitHub Profile Link</label>
                  <input
                    placeholder="https://github.com/username"
                    value={bioForm.githubUrl}
                    onChange={(e) => {
                      setBioForm({ ...bioForm, githubUrl: e.target.value });
                      if (bioErrors.githubUrl) setBioErrors((prev) => ({ ...prev, githubUrl: '' }));
                    }}
                    style={bioErrors.githubUrl ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(bioErrors.githubUrl)}
                  />
                  {bioErrors.githubUrl && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {bioErrors.githubUrl}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label>LinkedIn Profile Link</label>
                  <input
                    placeholder="https://linkedin.com/in/username"
                    value={bioForm.linkedinUrl}
                    onChange={(e) => {
                      setBioForm({ ...bioForm, linkedinUrl: e.target.value });
                      if (bioErrors.linkedinUrl) setBioErrors((prev) => ({ ...prev, linkedinUrl: '' }));
                    }}
                    style={bioErrors.linkedinUrl ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(bioErrors.linkedinUrl)}
                  />
                  {bioErrors.linkedinUrl && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {bioErrors.linkedinUrl}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label>Portfolio / Personal Website</label>
                  <input
                    placeholder="https://myportfolio.example.com"
                    value={bioForm.portfolioUrl}
                    onChange={(e) => {
                      setBioForm({ ...bioForm, portfolioUrl: e.target.value });
                      if (bioErrors.portfolioUrl) setBioErrors((prev) => ({ ...prev, portfolioUrl: '' }));
                    }}
                    style={bioErrors.portfolioUrl ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    aria-invalid={Boolean(bioErrors.portfolioUrl)}
                  />
                  {bioErrors.portfolioUrl && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {bioErrors.portfolioUrl}
                    </span>
                  )}
                </div>

                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="public-profile-toggle"
                    checked={bioForm.isPublicProfile}
                    onChange={(e) => setBioForm({ ...bioForm, isPublicProfile: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="public-profile-toggle" style={{ margin: 0, cursor: 'pointer' }}>
                    <strong>Enable Public Shareable Profile</strong> (Allows recruiters and placement partners to view your shareable link)
                  </label>
                </div>

                <div className="modal-actions" style={{ marginTop: '8px' }}>
                  <button className="primary" type="submit" disabled={savingBio}>
                    {savingBio ? 'Saving…' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </article>
          )}

          {/* TAB 2: RESUME MANAGEMENT */}
          {activeTab === 'resume' && (
            <article className="card">
              <h3>Resume Management</h3>
              {student.resume ? (
                <div style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-card-subtle, #f8fafc)', margin: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0 }}>📄 {student.resume.fileName}</h4>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9em' }}>
                        Uploaded at: {new Date(student.resume.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <a href={getAssetUrl(student.resume.url)} target="_blank" rel="noreferrer" className="button primary">
                        View / Download Resume ↗
                      </a>
                      <button type="button" className="button ghost" style={{ color: 'var(--red, red)' }} onClick={handleDeleteResume}>
                        Delete Resume
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No resume uploaded yet.</p>
              )}

              <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

              <h4>{student.resume ? 'Replace Resume' : 'Upload New Resume'}</h4>
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeUpload} disabled={uploadingResume} />
              {uploadingResume && <p style={{ marginTop: '8px' }}>Uploading resume file…</p>}
            </article>
          )}

          {/* TAB 3: PROJECTS */}
          {activeTab === 'projects' && (
            <article className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Projects</h3>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setEditingProject(null);
                    setProjectForm({ title: '', description: '', technologies: '', projectUrl: '', githubUrl: '', startDate: '', endDate: '' });
                    setProjectModalOpen(true);
                  }}
                >
                  + Add Project
                </button>
              </div>

              {student.projects?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {student.projects.map((p) => (
                    <div key={p._id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <h4>{p.title}</h4>
                        <div>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setEditingProject(p);
                              setProjectForm({
                                title: p.title || '',
                                description: p.description || '',
                                technologies: Array.isArray(p.technologies) ? p.technologies.join(', ') : '',
                                projectUrl: p.projectUrl || '',
                                githubUrl: p.githubUrl || '',
                                startDate: p.startDate || '',
                                endDate: p.endDate || ''
                              });
                              setProjectModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="link-button" style={{ color: 'var(--red, red)', marginLeft: '8px' }} onClick={() => handleDeleteProject(p._id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '8px 0' }}>{p.description}</p>
                      {p.technologies?.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' }}>
                          {p.technologies.map((t, idx) => (
                            <span key={idx} className="badge" style={{ background: 'var(--bg-muted, #f1f5f9)' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No projects added yet.</p>
              )}
            </article>
          )}

          {/* TAB 4: INTERNSHIPS / EXPERIENCE */}
          {activeTab === 'internships' && (
            <article className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Internships & Experience</h3>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setEditingInternship(null);
                    setInternshipForm({ organization: '', role: '', description: '', startDate: '', endDate: '', documentUrl: '' });
                    setInternshipModalOpen(true);
                  }}
                >
                  + Add Experience
                </button>
              </div>

              {student.internships?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {student.internships.map((exp) => (
                    <div key={exp._id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>{exp.role} @ {exp.organization}</h4>
                          <small style={{ color: 'var(--text-muted)' }}>
                            {exp.startDate} {exp.endDate ? `- ${exp.endDate}` : ''}
                          </small>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setEditingInternship(exp);
                              setInternshipForm({
                                organization: exp.organization || '',
                                role: exp.role || '',
                                description: exp.description || '',
                                startDate: exp.startDate || '',
                                endDate: exp.endDate || '',
                                documentUrl: exp.documentUrl || ''
                              });
                              setInternshipModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="link-button" style={{ color: 'var(--red, red)', marginLeft: '8px' }} onClick={() => handleDeleteInternship(exp._id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '8px 0' }}>{exp.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No internship details added yet.</p>
              )}
            </article>
          )}

          {/* TAB 5: CERTIFICATES */}
          {activeTab === 'certificates' && (
            <article className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Certificates & Credentials</h3>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setEditingCert(null);
                    setCertForm({ name: '', issuingOrganization: '', issueDate: '', credentialId: '', credentialUrl: '', fileUrl: '' });
                    setCertFile(null);
                    setCertModalOpen(true);
                  }}
                >
                  + Add Certificate
                </button>
              </div>

              {student.certificates?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {student.certificates.map((c) => (
                    <div key={c._id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AwardIcon size={16} color="#0d9488" /> {c.name}
                          </h4>
                          <p style={{ margin: '4px 0', color: 'var(--text-muted)' }}>
                            Issued by {c.issuingOrganization} {c.issueDate ? `• ${c.issueDate}` : ''}
                            {c.credentialId ? ` (Credential ID: ${c.credentialId})` : ''}
                          </p>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setEditingCert(c);
                              setCertForm({
                                name: c.name || '',
                                issuingOrganization: c.issuingOrganization || '',
                                issueDate: c.issueDate || '',
                                credentialId: c.credentialId || '',
                                credentialUrl: c.credentialUrl || '',
                                fileUrl: c.fileUrl || ''
                              });
                              setCertFile(null);
                              setCertModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="link-button" style={{ color: 'var(--red, red)', marginLeft: '8px' }} onClick={() => handleDeleteCert(c._id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      {/* Direct Certificate Image / PDF Display */}
                      {c.fileUrl && (
                        <div
                          onClick={() => setPreviewCert(c)}
                          title="Click to view full size"
                          style={{
                            marginTop: '14px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                            background: '#0f172a',
                            padding: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          {isImageFile(c.fileUrl) ? (
                            <img
                              src={getAssetUrl(c.fileUrl)}
                              alt={c.name}
                              style={{ display: 'block', width: '100%', maxHeight: '480px', objectFit: 'contain', margin: '0 auto', borderRadius: '4px' }}
                            />
                          ) : (
                            <iframe
                              src={getAssetUrl(c.fileUrl)}
                              title={c.name}
                              style={{ width: '100%', height: '480px', border: 'none', borderRadius: '4px', background: '#fff' }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No certificates added yet.</p>
              )}
            </article>
          )}

          {/* TAB 6: ACHIEVEMENTS */}
          {activeTab === 'achievements' && (
            <article className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Achievements & Awards</h3>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setEditingAchievement(null);
                    setAchievementForm({ title: '', description: '', date: '', issuingOrganization: '', documentUrl: '' });
                    setAchievementModalOpen(true);
                  }}
                >
                  + Add Achievement
                </button>
              </div>

              {student.achievements?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {student.achievements.map((a) => (
                    <div key={a._id} style={{ padding: '16px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AwardIcon size={16} color="#d97706" /> {a.title}
                          </h4>
                          <small style={{ color: 'var(--text-muted)' }}>
                            {a.issuingOrganization} {a.date ? `• ${a.date}` : ''}
                          </small>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setEditingAchievement(a);
                              setAchievementForm({
                                title: a.title || '',
                                description: a.description || '',
                                date: a.date || '',
                                issuingOrganization: a.issuingOrganization || '',
                                documentUrl: a.documentUrl || ''
                              });
                              setAchievementModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="link-button" style={{ color: 'var(--red, red)', marginLeft: '8px' }} onClick={() => handleDeleteAchievement(a._id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                      <p style={{ margin: '8px 0' }}>{a.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No achievements added yet.</p>
              )}
            </article>
          )}
        </section>
      )}

      {/* MODAL: Certificate */}
      <Modal
        isOpen={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        title={editingCert ? 'Edit Certificate' : 'Add Certificate'}
        maxWidth="540px"
      >
        <form
          onSubmit={handleSaveCert}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
        >
          <div className="field">
            <label>Certificate Name *</label>
            <input
              value={certForm.name}
              onChange={(e) => {
                setCertForm({ ...certForm, name: e.target.value });
                if (certErrors.name) setCertErrors((prev) => ({ ...prev, name: '' }));
              }}
              placeholder="e.g. AWS Certified Solutions Architect"
              style={certErrors.name ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(certErrors.name)}
            />
            {certErrors.name && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {certErrors.name}
              </span>
            )}
          </div>

          <div className="field">
            <label>Issuing Organization *</label>
            <input
              value={certForm.issuingOrganization}
              onChange={(e) => {
                setCertForm({ ...certForm, issuingOrganization: e.target.value });
                if (certErrors.issuingOrganization) setCertErrors((prev) => ({ ...prev, issuingOrganization: '' }));
              }}
              placeholder="e.g. Amazon Web Services"
              style={certErrors.issuingOrganization ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(certErrors.issuingOrganization)}
            />
            {certErrors.issuingOrganization && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {certErrors.issuingOrganization}
              </span>
            )}
          </div>

          <div className="field">
            <label>Issue Date</label>
            <input
              placeholder="e.g. May 2025"
              value={certForm.issueDate}
              onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Credential ID</label>
            <input
              placeholder="e.g. AWS-123456"
              value={certForm.credentialId}
              onChange={(e) => setCertForm({ ...certForm, credentialId: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Credential URL</label>
            <input
              placeholder="https://..."
              value={certForm.credentialUrl}
              onChange={(e) => setCertForm({ ...certForm, credentialUrl: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Certificate Image / Document File</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setCertFile(e.target.files[0] || null)}
            />
            {certForm.fileUrl && !certFile && (
              <small style={{ display: 'block', marginTop: '4px', color: 'var(--blue, #0284c7)' }}>
                Attached document: <a href={getAssetUrl(certForm.fileUrl)} target="_blank" rel="noreferrer">View File ↗</a>
              </small>
            )}
            <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: '4px' }}>
              Upload an image (PNG, JPG, WebP) or PDF file of your certificate.
            </small>
          </div>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button className="ghost" type="button" onClick={() => setCertModalOpen(false)}>Cancel</button>
            <button className="primary" type="submit" disabled={uploadingCert}>
              {uploadingCert ? 'Saving…' : 'Save Certificate'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Project */}
      <Modal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Add Project'}
        maxWidth="540px"
      >
        <form
          onSubmit={handleSaveProject}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
        >
          <div className="field">
            <label>Project Title *</label>
            <input
              value={projectForm.title}
              onChange={(e) => {
                setProjectForm({ ...projectForm, title: e.target.value });
                if (projectErrors.title) setProjectErrors((prev) => ({ ...prev, title: '' }));
              }}
              placeholder="e.g. Campus Recruitment Portal"
              style={projectErrors.title ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(projectErrors.title)}
            />
            {projectErrors.title && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {projectErrors.title}
              </span>
            )}
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              rows="3"
              value={projectForm.description}
              placeholder="Overview of goals, features, and your contribution..."
              onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Technologies Used (comma separated)</label>
            <input
              placeholder="React, Express, MongoDB, Node.js"
              value={projectForm.technologies}
              onChange={(e) => setProjectForm({ ...projectForm, technologies: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Project Live URL</label>
            <input
              placeholder="https://myproject.example.com"
              value={projectForm.projectUrl}
              onChange={(e) => setProjectForm({ ...projectForm, projectUrl: e.target.value })}
            />
          </div>

          <div className="field">
            <label>GitHub Repository URL</label>
            <input
              placeholder="https://github.com/username/project"
              value={projectForm.githubUrl}
              onChange={(e) => setProjectForm({ ...projectForm, githubUrl: e.target.value })}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button className="ghost" type="button" onClick={() => setProjectModalOpen(false)}>Cancel</button>
            <button className="primary" type="submit">Save Project</button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Internship */}
      <Modal
        isOpen={internshipModalOpen}
        onClose={() => setInternshipModalOpen(false)}
        title={editingInternship ? 'Edit Experience' : 'Add Experience'}
        maxWidth="540px"
      >
        <form
          onSubmit={handleSaveInternship}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
        >
          <div className="field">
            <label>Organization *</label>
            <input
              value={internshipForm.organization}
              onChange={(e) => {
                setInternshipForm({ ...internshipForm, organization: e.target.value });
                if (internshipErrors.organization) setInternshipErrors((prev) => ({ ...prev, organization: '' }));
              }}
              placeholder="e.g. Google, Microsoft, Tech Corp"
              style={internshipErrors.organization ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(internshipErrors.organization)}
            />
            {internshipErrors.organization && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {internshipErrors.organization}
              </span>
            )}
          </div>

          <div className="field">
            <label>Role / Position *</label>
            <input
              value={internshipForm.role}
              onChange={(e) => {
                setInternshipForm({ ...internshipForm, role: e.target.value });
                if (internshipErrors.role) setInternshipErrors((prev) => ({ ...prev, role: '' }));
              }}
              placeholder="e.g. Software Engineering Intern"
              style={internshipErrors.role ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(internshipErrors.role)}
            />
            {internshipErrors.role && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {internshipErrors.role}
              </span>
            )}
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              rows="3"
              placeholder="Responsibilities, achievements, and impact..."
              value={internshipForm.description}
              onChange={(e) => setInternshipForm({ ...internshipForm, description: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Start Date</label>
            <input
              placeholder="e.g. Jan 2025"
              value={internshipForm.startDate}
              onChange={(e) => setInternshipForm({ ...internshipForm, startDate: e.target.value })}
            />
          </div>

          <div className="field">
            <label>End Date</label>
            <input
              placeholder="e.g. Apr 2025 (or Present)"
              value={internshipForm.endDate}
              onChange={(e) => setInternshipForm({ ...internshipForm, endDate: e.target.value })}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button className="ghost" type="button" onClick={() => setInternshipModalOpen(false)}>Cancel</button>
            <button className="primary" type="submit">Save Experience</button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Achievement */}
      <Modal
        isOpen={achievementModalOpen}
        onClose={() => setAchievementModalOpen(false)}
        title={editingAchievement ? 'Edit Achievement' : 'Add Achievement'}
        maxWidth="540px"
      >
        <form
          onSubmit={handleSaveAchievement}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}
        >
          <div className="field">
            <label>Achievement Title *</label>
            <input
              value={achievementForm.title}
              onChange={(e) => {
                setAchievementForm({ ...achievementForm, title: e.target.value });
                if (achievementErrors.title) setAchievementErrors((prev) => ({ ...prev, title: '' }));
              }}
              placeholder="e.g. 1st Place - Smart India Hackathon"
              style={achievementErrors.title ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(achievementErrors.title)}
            />
            {achievementErrors.title && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {achievementErrors.title}
              </span>
            )}
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              rows="3"
              placeholder="Details regarding the achievement, competition, or recognition..."
              value={achievementForm.description}
              onChange={(e) => setAchievementForm({ ...achievementForm, description: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Issuing Organization</label>
            <input
              placeholder="e.g. Ministry of Education"
              value={achievementForm.issuingOrganization}
              onChange={(e) => setAchievementForm({ ...achievementForm, issuingOrganization: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Date</label>
            <input
              placeholder="e.g. March 2025"
              value={achievementForm.date}
              onChange={(e) => setAchievementForm({ ...achievementForm, date: e.target.value })}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: '8px' }}>
            <button className="ghost" type="button" onClick={() => setAchievementModalOpen(false)}>Cancel</button>
            <button className="primary" type="submit">Save Achievement</button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Preview Certificate */}
      <Modal isOpen={!!previewCert} onClose={() => setPreviewCert(null)} title={previewCert?.name || 'Watch Certificate'}>
        {previewCert && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '1.2em' }}>{previewCert.name}</h4>
            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>
              Issued by <strong>{previewCert.issuingOrganization}</strong> {previewCert.issueDate ? `• ${previewCert.issueDate}` : ''}
              {previewCert.credentialId ? ` (ID: ${previewCert.credentialId})` : ''}
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

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, loading: false })}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
        confirmLabel="Delete"
        danger={true}
        onConfirm={deleteConfirm.onConfirm}
        loading={deleteConfirm.loading}
      />
    </PortalLayout>
  );
}
