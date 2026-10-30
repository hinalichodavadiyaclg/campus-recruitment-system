import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { workshopService } from '../../services/workshop.service.js';
import { departmentService } from '../../services/department.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { WorkshopModal, canUserEditWorkshop, canUserReviewWorkshopEdit } from '../../components/workshops/WorkshopModal.jsx';
import { WorkshopReasonModal } from '../../components/workshops/WorkshopReasonModal.jsx';
import { AttendanceSheetModal } from '../../components/workshops/AttendanceSheetModal.jsx';
import { PrintableCertificateModal } from '../../components/workshops/PrintableCertificateModal.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import {
  CalendarIcon,
  BuildingIcon,
  UserIcon,
  ClockIcon,
  ShieldIcon,
  CheckCircleIcon,
  XCircleIcon,
  SearchIcon,
  PlusIcon
} from '../../components/common/Icons.jsx';

export function WorkshopDetailsPage({ workshopId }) {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  const isStudent = user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT';
  const isCompany = user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY';
  const isPlacementHead = role?.id === 'ROLE_PLACEMENT_HEAD' || role?.id === 'ROLE_SUPER_ADMIN' || user?.roleId === 'ROLE_PLACEMENT_HEAD' || user?.roleId === 'ROLE_SUPER_ADMIN';
  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR';

  const [workshop, setWorkshop] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const coordinatorDeptId = useMemo(() => {
    if (!isCoordinator) return null;
    const raw = user?.departmentId?._id || user?.departmentId || user?.department?._id || user?.department;
    if (!raw) return null;
    const str = typeof raw === 'object' && raw._id ? String(raw._id) : String(raw);
    if (/^[a-fA-F0-9]{24}$/.test(str)) return str;
    const found = (departments || []).find(d => d.name?.toLowerCase() === str.toLowerCase() || d.code?.toLowerCase() === str.toLowerCase());
    return found ? String(found._id) : null;
  }, [isCoordinator, user, departments]);

  const canEdit = useMemo(() => {
    return canUserEditWorkshop({ workshop, user, role, has, coordinatorDeptId });
  }, [workshop, user, role, has, coordinatorDeptId]);

  const canReviewEdit = useMemo(() => {
    return canUserReviewWorkshopEdit({ workshop, user, role, coordinatorDeptId });
  }, [workshop, user, role, coordinatorDeptId]);

  const proposedDiffs = useMemo(() => {
    if (!workshop?.pendingEdit?.proposedChanges) return [];
    const p = workshop.pendingEdit.proposedChanges;
    const w = workshop;
    const diffs = [];

    const fmtDate = (d) => {
      if (!d) return 'None';
      try {
        const dateObj = new Date(d);
        return isNaN(dateObj.getTime())
          ? String(d)
          : dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
      } catch {
        return String(d);
      }
    };

    if (p.title && p.title.trim() !== (w.title || '').trim()) {
      diffs.push({ field: 'Title', from: w.title, to: p.title });
    }
    if (p.description && p.description.trim() !== (w.description || '').trim()) {
      diffs.push({ field: 'Description', from: `${(w.description || '').slice(0, 35)}…`, to: `${(p.description || '').slice(0, 35)}…` });
    }
    if (p.category && p.category !== w.category) {
      diffs.push({ field: 'Category', from: w.category, to: p.category });
    }
    if (p.mode && p.mode !== w.mode) {
      diffs.push({ field: 'Mode', from: w.mode, to: p.mode });
    }
    if (p.venue !== undefined && (p.venue || '').trim() !== (w.venue || '').trim()) {
      diffs.push({ field: 'Venue', from: w.venue || 'None', to: p.venue || 'None' });
    }
    if (p.meetingLink !== undefined && (p.meetingLink || '').trim() !== (w.meetingLink || '').trim()) {
      diffs.push({ field: 'Virtual Link', from: w.meetingLink || 'None', to: p.meetingLink || 'None' });
    }
    if (p.maxParticipants !== undefined && Number(p.maxParticipants) !== Number(w.maxParticipants)) {
      diffs.push({ field: 'Max Seats', from: w.maxParticipants, to: p.maxParticipants });
    }
    if (p.startAt && (!w.startAt || new Date(p.startAt).getTime() !== new Date(w.startAt).getTime())) {
      diffs.push({ field: 'Start Date & Time', from: fmtDate(w.startAt), to: fmtDate(p.startAt) });
    }
    if (p.endAt && (!w.endAt || new Date(p.endAt).getTime() !== new Date(w.endAt).getTime())) {
      diffs.push({ field: 'End Date & Time', from: fmtDate(w.endAt), to: fmtDate(p.endAt) });
    }
    if (p.registrationDeadline && (!w.registrationDeadline || new Date(p.registrationDeadline).getTime() !== new Date(w.registrationDeadline).getTime())) {
      diffs.push({ field: 'Registration Deadline', from: fmtDate(w.registrationDeadline), to: fmtDate(p.registrationDeadline) });
    }
    if (p.registrationOpensAt && (!w.registrationOpensAt || new Date(p.registrationOpensAt).getTime() !== new Date(w.registrationOpensAt).getTime())) {
      diffs.push({ field: 'Registration Opens', from: fmtDate(w.registrationOpensAt), to: fmtDate(p.registrationOpensAt) });
    }
    if (Array.isArray(p.trainers)) {
      const origTrainers = (w.trainers || []).map(t => `${t.name || ''} (${t.trainerType || ''})`).join(', ');
      const newTrainers = p.trainers.map(t => `${t.name || ''} (${t.trainerType || ''})`).join(', ');
      if (origTrainers !== newTrainers) {
        diffs.push({ field: 'Trainers', from: origTrainers || 'None', to: newTrainers || 'None' });
      }
    }
    if (Array.isArray(p.sessions)) {
      const origCount = (w.sessions || []).length;
      const newCount = p.sessions.length;
      const origDates = (w.sessions || []).map(s => `${s.sessionId}:${new Date(s.startAt).getTime()}-${new Date(s.endAt).getTime()}`).join('|');
      const newDates = p.sessions.map(s => `${s.sessionId}:${new Date(s.startAt).getTime()}-${new Date(s.endAt).getTime()}`).join('|');
      if (origCount !== newCount || origDates !== newDates) {
        diffs.push({ field: 'Session Schedule', from: `${origCount} session(s)`, to: `${newCount} session(s) updated` });
      }
    }

    return diffs;
  }, [workshop]);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'roster', 'attendance', 'certificates', 'audit'

  // Sub-tab data
  const [roster, setRoster] = useState([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterStatus, setRosterStatus] = useState('');
  const [rosterLoading, setRosterLoading] = useState(false);

  // Selected session for attendance
  const [selectedSession, setSelectedSession] = useState(null);
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [sessionAttendanceRecords, setSessionAttendanceRecords] = useState([]);
  const [sessionAttendanceLoading, setSessionAttendanceLoading] = useState(false);
  const [sessionRoster, setSessionRoster] = useState([]);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

  // Certificates Roster State
  const [certificates, setCertificates] = useState([]);
  const [certificatesLoading, setCertificatesLoading] = useState(false);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [reasonModal, setReasonModal] = useState({
    isOpen: false,
    actionType: null,
    targetId: null,
    title: '',
    message: '',
    confirmLabel: 'Confirm'
  });

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    danger: false,
    onConfirm: null
  });

  const [viewingCertificate, setViewingCertificate] = useState(null);

  // Load Main Workshop
  const loadWorkshop = async () => {
    setLoading(true);
    try {
      const data = await workshopService.getWorkshop(workshopId);
      setWorkshop(data);
      if (data.sessions?.length > 0 && !selectedSession) {
        setSelectedSession(data.sessions[0]);
      }
    } catch (err) {
      toast(err.message || 'Failed to load workshop details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    departmentService.listDepartments({ limit: 100 })
      .then((res) => setDepartments(res.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (workshopId) {
      loadWorkshop();
    }
  }, [workshopId]);

  // Load Roster
  const loadRoster = async () => {
    if (!workshop?._id || isStudent) return;
    setRosterLoading(true);
    try {
      const res = await workshopService.getRoster(workshop._id, {
        page: rosterPage,
        limit: 20,
        search: rosterSearch,
        status: rosterStatus || undefined
      });
      setRoster(res.roster || []);
      setRosterTotal(res.total || 0);
    } catch (err) {
      toast(err.message || 'Failed to load roster.');
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'roster') {
      loadRoster();
    }
  }, [activeTab, rosterPage, rosterSearch, rosterStatus, workshop?._id]);

  // Load Session Attendance Records
  const loadSessionAttendance = async () => {
    if (!workshop?._id || !selectedSession?.sessionId || isStudent) return;
    setSessionAttendanceLoading(true);
    try {
      const [rosterRes, attRes] = await Promise.all([
        workshopService.getRoster(workshop._id, { limit: 500, activeOnly: true }),
        workshopService.getSessionAttendance(workshop._id, selectedSession.sessionId, { limit: 500 })
      ]);
      setSessionRoster(rosterRes.roster || []);
      setSessionAttendanceRecords(attRes.attendance || []);
    } catch {
      // ignore
    } finally {
      setSessionAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'attendance' && selectedSession?.sessionId) {
      loadSessionAttendance();
    }
  }, [activeTab, selectedSession?.sessionId, workshop?._id]);

  // Load Audit Trail
  const loadAuditLogs = async () => {
    if (!workshop?._id || isStudent) return;
    setAuditLoading(true);
    try {
      const res = await workshopService.getAuditLogs(workshop._id, {
        page: auditPage,
        limit: 20
      });
      setAuditLogs(res.auditLogs || []);
      setAuditTotal(res.total || 0);
    } catch (err) {
      toast(err.message || 'Failed to load audit history.');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
    }
    if (activeTab === 'certificates') {
      loadCertificates();
    }
  }, [activeTab, auditPage, workshop?._id]);

  // Load Workshop Issued Certificates
  const loadCertificates = async () => {
    if (!workshop?._id || isStudent) return;
    setCertificatesLoading(true);
    try {
      const data = await workshopService.getWorkshopCertificates(workshop._id);
      setCertificates(data || []);
    } catch (err) {
      toast(err.message || 'Failed to load certificates.');
    } finally {
      setCertificatesLoading(false);
    }
  };

  // Certificate Download Action
  const handleDownloadCertificate = async (certId, certNumber) => {
    try {
      await workshopService.downloadCertificate(certId, certNumber);
      toast('Certificate downloaded successfully.');
    } catch (err) {
      toast(err.message || 'Failed to download certificate.');
    }
  };

  // Handle Edit Submit
  const handleEditSubmit = async (payload, actionType = 'submit') => {
    setIsProcessing(true);
    try {
      const res = await workshopService.updateWorkshop(workshop._id, payload);
      if (res?.requiresApproval) {
        toast('Workshop edit request submitted for administrative review.');
      } else if (actionType === 'submit' && (workshop.approvalStatus === 'DRAFT' || workshop.approvalStatus === 'REJECTED')) {
        await workshopService.submitForApproval(workshop._id);
        toast('Workshop details updated and submitted for review.');
      } else {
        toast(actionType === 'draft' ? 'Workshop draft saved successfully.' : 'Workshop details updated successfully.');
      }
      setEditModalOpen(false);
      await loadWorkshop();
    } catch (err) {
      toast(err.message || 'Update failed.');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  // Review Workshop Edit Actions
  const handleApproveEdit = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Approve Workshop Changes',
      message: `Approve the submitted changes for "${workshop.title}"? The live workshop details will be updated immediately.`,
      danger: false,
      onConfirm: async () => {
        try {
          await workshopService.approveWorkshopEdit(workshop._id);
          toast('Workshop changes approved and applied.');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await loadWorkshop();
        } catch (err) {
          toast(err.message || 'Failed to approve changes.');
        }
      }
    });
  };

  const openRejectEditModal = () => {
    setReasonModal({
      isOpen: true,
      actionType: 'reject-edit',
      targetId: workshop._id,
      title: `Reject Workshop Changes — ${workshop.workshopId}`,
      message: 'Provide a reason for rejecting the requested changes (min 5 characters):',
      confirmLabel: 'Reject Changes'
    });
  };

  // Certificate Batch Issuance

  const handleCompleteWorkshop = async () => {
    if (!window.confirm('Mark this workshop as completed? This will finalize attendance and generate certificates for eligible students.')) {
      return;
    }
    try {
      await workshopService.completeWorkshop(workshop._id);
      toast('Workshop completed. Eligible certificates generated.');
      loadWorkshop();
      loadCertificates();
    } catch (err) {
      toast(err.message || 'Failed to complete workshop.');
    }
  };

  const handleIssueCertificates = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Issue Completion Certificates?',
      message: `Issue verifiable certificates for all eligible participants with >= 75% attendance in "${workshop.title}"?`,
      danger: false,
      onConfirm: async () => {
        try {
          const res = await workshopService.issueCertificates(workshop._id);
          toast(`Successfully issued ${res.issuedCount || 0} certificate(s)!`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await loadWorkshop();
          await loadRoster();
          await loadCertificates();
        } catch (err) {
          toast(err.message || 'Certificate issuance failed.');
        }
      }
    });
  };

  // Revoke Certificate
  const openRevokeModal = (certId, certNumber) => {
    setReasonModal({
      isOpen: true,
      actionType: 'revoke',
      targetId: certId,
      title: `Revoke Certificate — ${certNumber}`,
      message: `Revoking this certificate is permanent and marks it as REVOKED across all public verification checks. Provide a mandatory reason:`,
      confirmLabel: 'Revoke Certificate'
    });
  };

  const handleReasonSubmit = async (reason) => {
    try {
      if (reasonModal.actionType === 'revoke') {
        await workshopService.revokeCertificate(reasonModal.targetId, reason);
        toast('Certificate revoked successfully.');
        await loadRoster();
        await loadCertificates();
      } else if (reasonModal.actionType === 'reject-edit') {
        await workshopService.rejectWorkshopEdit(reasonModal.targetId, reason);
        toast('Workshop changes rejected.');
        await loadWorkshop();
      }
    } catch (err) {
      toast(err.message || 'Action failed.');
    } finally {
      setReasonModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Student Registration Actions
  const handleStudentRegister = async () => {
    if (!workshop) return;
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Workshop Registration',
      message: `Do you wish to register for "${workshop.title}"? Schedule: ${new Date(workshop.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
      danger: false,
      onConfirm: async () => {
        try {
          await workshopService.registerStudent(workshop._id);
          toast(`Successfully registered for "${workshop.title}"!`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await loadWorkshop();
        } catch (err) {
          toast(err.message || 'Registration failed.');
        }
      }
    });
  };

  const handleStudentCancelRegistration = async () => {
    if (!workshop) return;
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Workshop Registration?',
      message: `Are you sure you want to cancel your seat for "${workshop.title}"? This seat will immediately become available to other students.`,
      danger: true,
      onConfirm: async () => {
        try {
          await workshopService.cancelRegistration(workshop._id, 'Student cancelled registration');
          toast(`Your registration for "${workshop.title}" has been cancelled.`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          await loadWorkshop();
        } catch (err) {
          toast(err.message || 'Cancellation failed.');
        }
      }
    });
  };

  if (loading) {
    return (
      <PortalLayout title="Loading Workshop…" currentPath="/training-workshops">
        <div className="loading" style={{ padding: '60px' }}>Loading workshop data…</div>
      </PortalLayout>
    );
  }

  if (!workshop) {
    return (
      <PortalLayout title="Workshop Not Found" currentPath="/training-workshops">
        <div className="card empty" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <h3>Workshop record not found or inaccessible.</h3>
          <p>Please return to the workshops directory.</p>
          <a href="#/training-workshops" className="primary" style={{ marginTop: '16px', display: 'inline-block' }}>
            ← Back to Workshops
          </a>
        </div>
      </PortalLayout>
    );
  }

  const isConcluded = (workshop.endAt && new Date() >= new Date(workshop.endAt)) || workshop.lifecycleStatus === 'COMPLETED';

  return (
    <PortalLayout
      title={workshop.title}
      subtitle={`Program Identifier: ${workshop.workshopId} | Category: ${workshop.category}`}
      currentPath="/training-workshops"
    >
      <section>
        {workshop.lifecycleStatus === 'CANCELLED' && (
          <div className="card" style={{ marginBottom: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div>
              <strong>This workshop has been cancelled.</strong>
              <div style={{ fontSize: '0.84rem', marginTop: '2px', color: '#b91c1c' }}>
                All active registrations have been cancelled and this program is not accepting registrations.
              </div>
            </div>
          </div>
        )}

        {workshop.pendingEdit?.status === 'PENDING' && (
          <div
            className="card"
            style={{
              marginBottom: '16px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge pending">Changes Pending Approval</span>
                  {workshop.pendingEdit.submittedAt && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      Submitted {new Date(workshop.pendingEdit.submittedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </span>
                  )}
                </div>
                {workshop.pendingEdit.comment && (
                  <div style={{ marginTop: '6px', fontSize: '0.88rem', color: '#1e3a8a' }}>
                    Note: {workshop.pendingEdit.comment}
                  </div>
                )}
              </div>

              {canReviewEdit && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="primary"
                    style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                    onClick={handleApproveEdit}
                  >
                    Approve Changes
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: '6px 14px', fontSize: '0.85rem', color: 'var(--red)' }}
                    onClick={openRejectEditModal}
                  >
                    Reject Changes
                  </button>
                </div>
              )}
            </div>

            {proposedDiffs.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #dbeafe', paddingTop: '10px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#1e40af' }}>Proposed Changes:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px', fontSize: '0.82rem' }}>
                  {proposedDiffs.map((d, idx) => (
                    <div key={idx} style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                      <strong>{d.field}:</strong>{' '}
                      <span style={{ textDecoration: 'line-through', color: '#64748b', marginRight: '6px' }}>{String(d.from)}</span>
                      <span style={{ color: '#0f766e', fontWeight: 600 }}>→ {String(d.to)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {workshop.pendingEdit?.status === 'REJECTED' && workshop.pendingEdit?.reviewComment && (
          <div
            className="card"
            style={{
              marginBottom: '16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '0.86rem',
              color: '#991b1b'
            }}
          >
            <strong>Recent edit rejected:</strong> {workshop.pendingEdit.reviewComment}
          </div>
        )}

        {/* Top Header Card */}
        <div className="card" style={{ marginBottom: '20px', borderLeft: `6px solid ${workshop.lifecycleStatus === 'CANCELLED' ? '#ef4444' : 'var(--teal)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-info">{workshop.workshopId}</span>
                <span className={`badge mode-${String(workshop.mode).toLowerCase()}`}>{workshop.mode}</span>
                <span className={`badge ${String(workshop.approvalStatus).toLowerCase()}`}>
                  {workshop.approvalStatus}
                </span>
                <span className={`badge ${
                  workshop.lifecycleStatus === 'CANCELLED'
                    ? 'cancelled'
                    : (workshop.lifecycleStatus === 'COMPLETED'
                      ? 'completed'
                      : (workshop.isPublished ? 'published' : String(workshop.lifecycleStatus).toLowerCase()))
                }`}>
                  {workshop.lifecycleStatus === 'CANCELLED'
                    ? 'CANCELLED'
                    : (workshop.lifecycleStatus === 'COMPLETED'
                      ? 'COMPLETED'
                      : (workshop.isPublished ? 'PUBLISHED' : workshop.lifecycleStatus))}
                </span>
                {workshop.pendingEdit?.status === 'PENDING' && (
                  <span className="badge pending">Edit Pending</span>
                )}
              </div>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
                Sessions: <strong>{workshop.sessions?.length || 0}</strong> | Max Seats: <strong>{workshop.maxParticipants}</strong> | Enrolled: <strong>{workshop.enrolledCount || 0}</strong>
              </p>
            </div>

            {/* Header Action Buttons */}
            <div className="button-group">
              <a href="#/training-workshops" className="ghost" style={{ textDecoration: 'none' }}>
                ← Back
              </a>

              
              {!isStudent && canEdit && workshop.isPublished && workshop.lifecycleStatus !== 'COMPLETED' && workshop.lifecycleStatus !== 'CANCELLED' && (
                <button
                  type="button"
                  className="secondary"
                  onClick={handleCompleteWorkshop}
                >
                  Complete Workshop
                </button>
              )}

              {canEdit && (
                <button className="primary" type="button" onClick={() => setEditModalOpen(true)}>
                  Edit Details
                </button>
              )}

              {isStudent && (
                workshop.isRegistered ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="primary"
                      disabled
                      style={{
                        padding: '8px 16px',
                        fontSize: '0.88rem',
                        cursor: 'default',
                        opacity: 1,
                        fontWeight: 750,
                        background: 'var(--green)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px'
                      }}
                    >
                      Registered
                    </button>
                    {(!workshop.startAt || new Date() < new Date(workshop.startAt)) && (
                      <button
                        type="button"
                        className="danger"
                        style={{ padding: '8px 16px', fontSize: '0.88rem' }}
                        onClick={handleStudentCancelRegistration}
                      >
                        Cancel Seat
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      (workshop.seatsRemaining || 0) <= 0 ||
                      (workshop.registrationDeadline && new Date() > new Date(workshop.registrationDeadline)) ||
                      workshop.lifecycleStatus === 'CANCELLED'
                    }
                    style={{ padding: '8px 16px', fontSize: '0.88rem' }}
                    onClick={handleStudentRegister}
                  >
                    {(workshop.seatsRemaining || 0) <= 0
                      ? 'Full'
                      : (workshop.registrationDeadline && new Date() > new Date(workshop.registrationDeadline))
                        ? 'Closed'
                        : 'Register Now'}
                  </button>
                )
              )}

              {!isStudent && workshop.lifecycleStatus === 'CANCELLED' && has('WORKSHOP_DELETE') && (
                <button
                  type="button"
                  className="ghost"
                  style={{ color: 'var(--red)' }}
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: 'Delete Cancelled Workshop?',
                      message: `Are you sure you want to permanently delete "${workshop.title}" (${workshop.workshopId})?`,
                      danger: true,
                      onConfirm: async () => {
                        try {
                          await workshopService.deleteWorkshop(workshop._id);
                          toast(`Workshop ${workshop.workshopId} deleted successfully.`);
                          window.location.hash = '#/training-workshops';
                        } catch (err) {
                          toast(err.message || 'Deletion failed.');
                        }
                      }
                    });
                  }}
                >
                  Delete Workshop
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--line)', marginBottom: '20px', overflowX: 'auto' }}>
          {[
            { id: 'overview', label: 'Overview & Schedule' },
            ...(!isStudent ? [
              { id: 'roster', label: `Participant Roster (${workshop.enrolledCount || 0})` },
              { id: 'attendance', label: 'Session Attendance' },
              { id: 'certificates', label: 'Certificates' },
              { id: 'audit', label: 'Audit Trail' }
            ] : [])
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'transparent',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? 'var(--teal)' : 'var(--muted)',
                borderBottom: activeTab === tab.id ? '3px solid var(--teal)' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW & SCHEDULE */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div className="card">
              <h3>Curriculum & Objectives</h3>
              <p style={{ marginTop: '12px', lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-line' }}>
                {workshop.description}
              </p>

              <div style={{ marginTop: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                <h4>Delivery Details</h4>
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px', fontSize: '0.86rem' }}>
                  <div><strong>Mode:</strong> {workshop.mode}</div>
                  <div><strong>Venue:</strong> {workshop.venue || 'N/A'}</div>
                  {workshop.meetingLink && (
                    <div>
                      <strong>Virtual Link:</strong>{' '}
                      <a href={workshop.meetingLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
                        {workshop.meetingLink}
                      </a>
                    </div>
                  )}
                  <div>
                    <strong>Schedule:</strong>{' '}
                    {new Date(workshop.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} to{' '}
                    {new Date(workshop.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </div>
                  <div>
                    <strong>Registration Closes:</strong>{' '}
                    {new Date(workshop.registrationDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </div>
                  <div>
                    <strong>Target Audience:</strong>{' '}
                    {workshop.targetAudience?.isAllDepartments
                      ? 'Open to All Departments'
                      : (workshop.targetAudience?.departmentRules?.map((r) => r.departmentId?.name || departments.find((d) => String(d._id) === String(r.departmentId?._id || r.departmentId))?.name || 'Department').filter(Boolean).join(', ') || 'Department Specific')}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '20px' }}>
              {/* Trainers Box */}
              <div className="card">
                <h3>Instructors & Trainers ({workshop.trainers?.length || 0})</h3>
                <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                  {workshop.trainers?.map((t, idx) => (
                    <div key={idx} style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{t.name}</strong>
                        <span className="badge neutral">{t.trainerType}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '2px' }}>
                        {t.designation || 'Instructor'} {t.organization ? `• ${t.organization}` : ''}
                      </div>
                    </div>
                  ))}
                  {(!workshop.trainers || workshop.trainers.length === 0) && (
                    <p className="empty">No specific trainers assigned.</p>
                  )}
                </div>
              </div>

              {/* Sessions Timeline */}
              <div className="card">
                <h3>Session Schedule ({workshop.sessions?.length || 0})</h3>
                <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                  {workshop.sessions?.map((s, idx) => (
                    <div key={idx} style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#102e5f' }}>{s.sessionId}: {s.title}</strong>
                        <span className={`badge ${s.isAttendanceRequired ? 'pending' : 'neutral'}`}>
                          {s.isAttendanceRequired ? 'Attendance Required' : 'Optional'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px' }}>
                        {new Date(s.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short', dateStyle: 'short' })} —{' '}
                        {new Date(s.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PARTICIPANT ROSTER (Staff Only) */}
        {!isStudent && activeTab === 'roster' && (
          <article className="card table-card">
            <div style={{ padding: '14px', borderBottom: '1px solid var(--line)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                placeholder="Search student name, roll number, email..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                style={{ flex: '1 1 240px' }}
              />
              <select
                value={rosterStatus}
                onChange={(e) => setRosterStatus(e.target.value)}
                style={{ width: '180px' }}
              >
                <option value="">All Registration Statuses</option>
                <option value="REGISTERED">Registered</option>
                <option value="ATTENDED">Attended</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>University ID</th>
                    <th>Department & Sem</th>
                    <th>Registered At</th>
                    <th>Status</th>
                    <th>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterLoading ? (
                    <tr>
                      <td colSpan="6" className="empty">Loading roster…</td>
                    </tr>
                  ) : roster.length > 0 ? (
                    roster.map(reg => {
                      const s = reg.studentId || {};
                      return (
                        <tr key={reg._id}>
                          <td>
                            <strong>{s.firstName} {s.lastName}</strong>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                              {s.email}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-info">{s.universityId || 'N/A'}</span>
                          </td>
                          <td>
                            {s.courseId?.name || s.branch || s.courseName || s.department || 'General'} {s.semester ? `(Sem ${s.semester})` : ''}
                          </td>
                          <td>
                            {new Date(reg.registeredAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </td>
                          <td>
                            <span className={`badge ${String(reg.status).toLowerCase()}`}>
                              {reg.status}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${reg.completionStatus === 'COMPLETED' ? 'published' : 'neutral'}`}>
                              {reg.completionStatus || 'PENDING'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="empty">No registered students found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        )}

        {/* TAB 3: SESSION ATTENDANCE (Staff & Assigned Trainers) */}
        {!isStudent && activeTab === 'attendance' && (
          <div>
            <div className="card" style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Session Attendance Sheet</h3>
                  <div style={{ fontSize: '0.84rem', color: 'var(--muted)', marginTop: '4px' }}>
                    Session {selectedSession?.sessionId}: <strong>{selectedSession?.title}</strong> | Attendance: {selectedSession?.isAttendanceRequired !== false ? 'Mandatory (75%)' : 'Optional'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={selectedSession?.sessionId || ''}
                    onChange={(e) => {
                      const found = workshop.sessions.find(s => s.sessionId === e.target.value);
                      setSelectedSession(found);
                    }}
                    style={{ width: '280px' }}
                  >
                    {workshop.sessions?.map(s => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {s.sessionId}: {s.title}
                      </option>
                    ))}
                  </select>

                  <button
                    className="primary"
                    type="button"
                    onClick={() => setAttendanceModalOpen(true)}
                  >
                    {sessionAttendanceRecords.length > 0 ? 'Edit Attendance Sheet' : 'Take Attendance →'}
                  </button>
                </div>
              </div>

              {/* Session Quick Metrics */}
              {(() => {
                const totalStudents = sessionRoster.length;
                let presentCount = 0;
                let absentCount = 0;
                sessionAttendanceRecords.forEach(r => {
                  if (r.attendanceStatus === 'PRESENT') presentCount++;
                  else if (r.attendanceStatus === 'ABSENT') absentCount++;
                });

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginTop: '16px' }}>
                    <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Total Students</span>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{totalStudents}</div>
                    </div>
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--green)' }}>Present</span>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--green)' }}>{presentCount}</div>
                    </div>
                    <div style={{ padding: '10px 14px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>Absent</span>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--red)' }}>{absentCount}</div>
                    </div>
                    <div style={{ padding: '10px 14px', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>Status</span>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: sessionAttendanceRecords.length > 0 ? 'var(--green)' : 'var(--amber)', marginTop: '4px' }}>
                        {sessionAttendanceRecords.length > 0 ? 'Recorded' : 'Not Recorded'}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Session Attendance Table */}
            <article className="card table-card">
              <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>
                  Attendance Records for {selectedSession?.sessionId} ({sessionRoster.length} Students)
                </h4>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>University ID</th>
                      <th>Department & Sem</th>
                      <th>Attendance Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionAttendanceLoading ? (
                      <tr>
                        <td colSpan="5" className="empty">Loading session attendance…</td>
                      </tr>
                    ) : sessionRoster.length > 0 ? (
                      (() => {
                        const attMap = new Map();
                        sessionAttendanceRecords.forEach(r => {
                          const sId = String(r.studentId?._id || r.studentId);
                          attMap.set(sId, r);
                        });

                        return sessionRoster.map(reg => {
                          const s = reg.studentId || {};
                          const sId = String(s._id || reg.studentId);
                          const attRec = attMap.get(sId);

                          return (
                            <tr key={reg._id}>
                              <td>
                                <strong>{s.firstName} {s.lastName}</strong>
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                  {s.email}
                                </span>
                              </td>
                              <td>
                                <span className="badge badge-info">{s.universityId || 'N/A'}</span>
                              </td>
                              <td>
                                {s.courseId?.name || s.branch || s.courseName || s.department || 'General'} {s.semester ? `(Sem ${s.semester})` : ''}
                              </td>
                              <td>
                                {attRec ? (
                                  <span className={`badge ${attRec.attendanceStatus === 'PRESENT' ? 'published' : 'cancelled'}`}>
                                    {attRec.attendanceStatus === 'PRESENT' ? 'Present' : 'Absent'}
                                  </span>
                                ) : (
                                  <span className="badge neutral">Not Recorded</span>
                                )}
                              </td>
                              <td>
                                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                                  {attRec?.remarks || '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        });
                      })()
                    ) : (
                      <tr>
                        <td colSpan="5" className="empty">No registered students for this workshop.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        )}

        {/* TAB 4: CERTIFICATION MANAGEMENT (Placement Head / Admin) */}
        {!isStudent && activeTab === 'certificates' && (
          <div>
            <div className="card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <h3>Workshop Certification Gate</h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.88rem' }}>
                    Criteria: Participant must have $\ge 75\%$ mandatory session attendance. Program must have concluded.
                  </p>
                </div>

                <button
                  className="primary"
                  type="button"
                  disabled={!isConcluded}
                  onClick={handleIssueCertificates}
                >
                  Issue Completion Certificates
                </button>
              </div>

              {!isConcluded && (
                <div className="notice warn" style={{ marginTop: '14px', fontSize: '0.85rem' }}>
                  <strong>Workshop in progress:</strong> Certificates can only be issued after the workshop concludes ({new Date(workshop.endAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}).
                </div>
              )}
            </div>

            {/* Issued Certificates Roster */}
            <article className="card table-card">
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>Issued Certificates ({certificates.length})</h4>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Recipient</th>
                      <th>University ID</th>
                      <th>Certificate No</th>
                      <th>Issued Date</th>
                      <th>Template</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificatesLoading ? (
                      <tr>
                        <td colSpan="7" className="empty">Loading certificates…</td>
                      </tr>
                    ) : certificates.length > 0 ? (
                      certificates.map((cert) => {
                        const s = cert.studentId || {};
                        const isIssued = cert.certificateStatus === 'ISSUED';
                        return (
                          <tr key={cert._id}>
                            <td>
                              <strong>{s.firstName} {s.lastName}</strong>
                              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                {s.email}
                              </span>
                            </td>
                            <td>
                              <span className="badge badge-info">{s.universityId || 'N/A'}</span>
                            </td>
                            <td>
                              <code style={{ fontWeight: 700, color: '#102e5f' }}>{cert.certificateNumber}</code>
                            </td>
                            <td>
                              {cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A'}
                            </td>
                            <td>
                              {cert.certificateTemplateId?.name || 'Default VVWU Design'}
                            </td>
                            <td>
                              <span className={`badge ${isIssued ? 'published' : 'closed'}`}>
                                {cert.certificateStatus}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className="secondary"
                                  style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                  onClick={() => handleDownloadCertificate(cert._id, cert.certificateNumber)}
                                  title="Download PDF"
                                >
                                  Download PDF
                                </button>
                                <button
                                  type="button"
                                  className="ghost"
                                  style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                  onClick={() => setViewingCertificate(cert)}
                                  title="View Certificate"
                                >
                                  View
                                </button>
                                {isPlacementHead && isIssued && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    style={{ padding: '4px 8px', fontSize: '0.78rem', color: '#b91c1c' }}
                                    onClick={() => openRevokeModal(cert._id, cert.certificateNumber)}
                                    title="Revoke Certificate"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="7" className="empty">No certificates issued yet for this workshop.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        )}

        {/* TAB 5: AUDIT TRAIL (Staff Only) */}
        {!isStudent && activeTab === 'audit' && (
          <article className="card table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Entity Type & ID</th>
                    <th>Reason / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLoading ? (
                    <tr>
                      <td colSpan="5" className="empty">Loading audit trail…</td>
                    </tr>
                  ) : auditLogs.length > 0 ? (
                    auditLogs.map(log => {
                      const actor = log.changedBy || {};
                      return (
                        <tr key={log._id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                            {new Date(log.changedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                          </td>
                          <td>
                            <span className="badge badge-info">{log.action}</span>
                          </td>
                          <td>
                            <strong>{actor.firstName ? `${actor.firstName} ${actor.lastName || ''}` : 'System'}</strong>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                              {actor.email || actor.roleId || ''}
                            </span>
                          </td>
                          <td>
                            {log.entityType} ({log.entityId})
                          </td>
                          <td style={{ maxWidth: '300px' }}>
                            {log.reason ? (
                              <span style={{ color: 'var(--ink)' }}>{log.reason}</span>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>No reason recorded</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="5" className="empty">No audit history found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </section>

      {/* EDIT MODAL */}
      <WorkshopModal
        isOpen={editModalOpen}
        workshop={workshop}
        onClose={() => setEditModalOpen(false)}
        onSubmit={handleEditSubmit}
        isProcessing={isProcessing}
      />

      {/* REASON MODAL (Revoke) */}
      <WorkshopReasonModal
        isOpen={reasonModal.isOpen}
        title={reasonModal.title}
        message={reasonModal.message}
        confirmLabel={reasonModal.confirmLabel}
        onClose={() => setReasonModal(prev => ({ ...prev, isOpen: false }))}
        onSubmit={handleReasonSubmit}
      />

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        danger={confirmModal.danger}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />

      {/* ATTENDANCE SHEET MODAL */}
      <AttendanceSheetModal
        isOpen={attendanceModalOpen}
        workshop={workshop}
        session={selectedSession}
        onClose={() => setAttendanceModalOpen(false)}
        onSaved={() => {
          loadWorkshop();
          loadRoster();
          loadSessionAttendance();
        }}
        toast={toast}
      />

      {/* PRINTABLE CERTIFICATE MODAL */}
      <PrintableCertificateModal
        isOpen={Boolean(viewingCertificate)}
        certificate={viewingCertificate}
        onClose={() => setViewingCertificate(null)}
        onDownload={(cert) => handleDownloadCertificate(cert._id, cert.certificateNumber)}
      />
    </PortalLayout>
  );
}
