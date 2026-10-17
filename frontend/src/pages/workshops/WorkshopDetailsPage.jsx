import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { workshopService } from '../../services/workshop.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { WorkshopModal } from '../../components/workshops/WorkshopModal.jsx';
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
  const isPlacementHead = role?.id === 'ROLE_PLACEMENT_HEAD' || role?.id === 'ROLE_SUPER_ADMIN' || user?.roleId === 'ROLE_PLACEMENT_HEAD' || user?.roleId === 'ROLE_SUPER_ADMIN';
  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR';

  const [workshop, setWorkshop] = useState(null);
  const [loading, setLoading] = useState(true);
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

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);

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
  }, [activeTab, auditPage, workshop?._id]);

  // Handle Edit Submit
  const handleEditSubmit = async (payload) => {
    setIsProcessing(true);
    try {
      await workshopService.updateWorkshop(workshop._id, payload);
      toast('Workshop details updated successfully.');
      setEditModalOpen(false);
      await loadWorkshop();
    } catch (err) {
      toast(err.message || 'Update failed.');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  // Certificate Batch Issuance
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
    if (reasonModal.actionType === 'revoke') {
      await workshopService.revokeCertificate(reasonModal.targetId, reason);
      toast('Certificate revoked successfully.');
    }
    setReasonModal(prev => ({ ...prev, isOpen: false }));
    await loadRoster();
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
              </div>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.88rem' }}>
                Department: <strong>{workshop.ownershipType === 'CENTRAL_PLACEMENT_CELL' ? 'Central Placement Cell' : (workshop.departmentId?.name || 'Department')}</strong> | Max Seats: <strong>{workshop.maxParticipants}</strong> | Enrolled: <strong>{workshop.enrolledCount || 0}</strong>
              </p>
            </div>

            {/* Header Action Buttons */}
            <div className="button-group">
              <a href="#/training-workshops" className="ghost" style={{ textDecoration: 'none' }}>
                ← Back
              </a>

              {!isStudent && !workshop.isPublished && (workshop.approvalStatus === 'DRAFT' || workshop.approvalStatus === 'REJECTED') && (
                <button className="primary" type="button" onClick={() => setEditModalOpen(true)}>
                  Edit Details
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
              ...(isPlacementHead ? [{ id: 'certificates', label: 'Certification Management' }] : []),
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
                            {s.department || s.branch || 'General'} {s.semester ? `(Sem ${s.semester})` : ''}
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
              <h3>Select Session to Mark or Review Attendance</h3>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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
                  Open Attendance Sheet →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CERTIFICATION MANAGEMENT (Placement Head / Admin) */}
        {!isStudent && isPlacementHead && activeTab === 'certificates' && (
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
        }}
        toast={toast}
      />

      {/* PRINTABLE CERTIFICATE MODAL */}
      <PrintableCertificateModal
        isOpen={Boolean(viewingCertificate)}
        certificate={viewingCertificate}
        onClose={() => setViewingCertificate(null)}
      />
    </PortalLayout>
  );
}
