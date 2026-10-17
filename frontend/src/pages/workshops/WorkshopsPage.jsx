import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { workshopService } from '../../services/workshop.service.js';
import { departmentService } from '../../services/department.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { WorkshopModal, WORKSHOP_CATEGORIES, WORKSHOP_MODES } from '../../components/workshops/WorkshopModal.jsx';
import { WorkshopReasonModal } from '../../components/workshops/WorkshopReasonModal.jsx';
import { PrintableCertificateModal } from '../../components/workshops/PrintableCertificateModal.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import {
  WorkshopsIcon,
  PlusIcon,
  CalendarIcon,
  BuildingIcon,
  UserIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  SearchIcon,
  ShieldIcon
} from '../../components/common/Icons.jsx';

export function WorkshopsPage() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  const isStudent = user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT';
  const isPlacementHead = role?.id === 'ROLE_PLACEMENT_HEAD' || role?.id === 'ROLE_SUPER_ADMIN' || user?.roleId === 'ROLE_PLACEMENT_HEAD' || user?.roleId === 'ROLE_SUPER_ADMIN';
  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR';
  const coordinatorDeptId = user?.departmentId;

  // Active Tab:
  // For student: 'browse', 'my-registrations', 'my-certificates'
  // For staff: 'dashboard', 'manage', 'approval-queue', 'certificates'
  const [activeTab, setActiveTab] = useState(() => (isStudent ? 'browse' : 'dashboard'));

  // Data Collections
  const [workshops, setWorkshops] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [myCertificates, setMyCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filter out any cancelled or unpublished workshops in student browse mode
  const studentVisibleWorkshops = useMemo(() => {
    if (isStudent && activeTab === 'browse') {
      return workshops.filter((w) => w.lifecycleStatus !== 'CANCELLED' && w.isPublished);
    }
    return workshops;
  }, [workshops, isStudent, activeTab]);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState(() => {
    if (isCoordinator && coordinatorDeptId) return String(coordinatorDeptId);
    return '';
  });
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMode, setSelectedMode] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Action Modals (Reason & Confirm)
  const [reasonModalState, setReasonModalState] = useState({
    isOpen: false,
    actionType: null, // 'reject', 'cancel', 'revoke'
    targetId: null,
    title: '',
    message: '',
    confirmLabel: 'Confirm'
  });

  const [confirmModalState, setConfirmModalState] = useState({
    isOpen: false,
    title: '',
    message: '',
    danger: false,
    onConfirm: null
  });

  // Certificate Modal State
  const [viewingCertificate, setViewingCertificate] = useState(null);

  // Load Departments for filtering
  useEffect(() => {
    departmentService.listDepartments({ limit: 100 })
      .then((res) => setDepartments(res.items || []))
      .catch(() => {});
  }, []);

  // Main Data Loader
  const loadWorkshops = async () => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: 20
      };

      if (search.trim()) params.search = search.trim();
      if (selectedCategory) params.category = selectedCategory;
      if (selectedMode) params.mode = selectedMode;

      if (isCoordinator && coordinatorDeptId) {
        params.departmentId = String(coordinatorDeptId);
      } else if (selectedDepartment) {
        params.departmentId = selectedDepartment;
      }

      if (isStudent) {
        if (activeTab === 'browse') {
          params.isPublished = true;
          params.approvalStatus = 'APPROVED';
        } else if (activeTab === 'my-registrations') {
          params.myRegistrationsOnly = true;
        }
      } else {
        // Staff tab overrides
        if (activeTab === 'approval-queue') {
          params.approvalStatus = 'PENDING_APPROVAL';
        } else if (selectedStatus) {
          if (['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(selectedStatus)) {
            params.approvalStatus = selectedStatus;
          } else {
            params.lifecycleStatus = selectedStatus;
          }
        }
      }

      const res = await workshopService.listWorkshops(params);
      setWorkshops(res.workshops || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.totalPages || 1);

      // If student in certificates tab, load certificates
      if (isStudent && activeTab === 'my-certificates') {
        const certRes = await workshopService.getMyCertificates();
        setMyCertificates(certRes || []);
      }
    } catch (err) {
      toast(err.message || 'Failed to load workshops data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkshops();
  }, [activeTab, currentPage, search, selectedDepartment, selectedCategory, selectedMode, selectedStatus]);

  // Handle Create or Update
  const handleSaveWorkshop = async (payload) => {
    setIsProcessing(true);
    try {
      if (editingWorkshop) {
        await workshopService.updateWorkshop(editingWorkshop._id, payload);
        toast('Workshop details updated successfully.');
      } else {
        await workshopService.createWorkshop(payload);
        toast('New workshop draft created successfully.');
      }
      setCreateModalOpen(false);
      setEditingWorkshop(null);
      await loadWorkshops();
    } catch (err) {
      toast(err.message || 'Failed to save workshop.');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  // Lifecycle Quick Actions
  const handleSubmitReview = async (w) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Submit Workshop for Review?',
      message: `Are you sure you want to submit "${w.title}" to the Placement Head for administrative approval?`,
      danger: false,
      onConfirm: async () => {
        try {
          await workshopService.submitForApproval(w._id);
          toast(`Workshop "${w.title}" submitted for review.`);
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await loadWorkshops();
        } catch (err) {
          toast(err.message || 'Submission failed.');
        }
      }
    });
  };

  const handlePublish = async (w) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Publish Workshop?',
      message: `Publishing "${w.title}" will open registration to eligible students immediately and lock structural dates. Continue?`,
      danger: false,
      onConfirm: async () => {
        try {
          await workshopService.publishWorkshop(w._id);
          toast(`Workshop "${w.title}" published successfully!`);
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await loadWorkshops();
        } catch (err) {
          toast(err.message || 'Publishing failed.');
        }
      }
    });
  };

  const handleApprove = async (w) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Approve Workshop?',
      message: `Do you want to approve "${w.title}" for delivery by ${w.ownershipType === 'DEPARTMENT' ? 'Department' : 'Central Placement Cell'}?`,
      danger: false,
      onConfirm: async () => {
        try {
          await workshopService.approveWorkshop(w._id, 'Approved by Placement Head');
          toast(`Workshop "${w.title}" approved.`);
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await loadWorkshops();
        } catch (err) {
          toast(err.message || 'Approval failed.');
        }
      }
    });
  };

  const openRejectModal = (w) => {
    setReasonModalState({
      isOpen: true,
      actionType: 'reject',
      targetId: w._id,
      title: `Reject Workshop — ${w.workshopId}`,
      message: `Please specify the mandatory rejection reason for "${w.title}". This will be logged in the permanent audit trail.`,
      confirmLabel: 'Reject Workshop'
    });
  };

  const openCancelModal = (w) => {
    setReasonModalState({
      isOpen: true,
      actionType: 'cancel',
      targetId: w._id,
      title: `Cancel Workshop — ${w.workshopId}`,
      message: `Cancelling "${w.title}" will notify participants and cascade cancellation to all active student registrations. Provide a mandatory reason:`,
      confirmLabel: 'Cancel Workshop'
    });
  };

  const handleDelete = (w) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Delete Workshop Draft?',
      message: `Are you sure you want to permanently delete draft "${w.title}" (${w.workshopId})? This action cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        try {
          await workshopService.deleteWorkshop(w._id);
          toast(`Workshop ${w.workshopId} deleted successfully.`);
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await loadWorkshops();
        } catch (err) {
          toast(err.message || 'Deletion failed.');
        }
      }
    });
  };

  // Student Actions
  const handleStudentRegister = async (w) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Confirm Workshop Registration',
      message: `Do you wish to register for "${w.title}"? Schedule: ${new Date(w.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.`,
      danger: false,
      onConfirm: async () => {
        try {
          await workshopService.registerStudent(w._id);
          toast(`Successfully registered for "${w.title}"!`);
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await loadWorkshops();
        } catch (err) {
          toast(err.message || 'Registration failed.');
        }
      }
    });
  };

  const handleStudentCancelRegistration = async (w) => {
    setConfirmModalState({
      isOpen: true,
      title: 'Cancel Workshop Registration?',
      message: `Are you sure you want to cancel your seat for "${w.title}"? This seat will immediately become available to other students.`,
      danger: true,
      onConfirm: async () => {
        try {
          await workshopService.cancelRegistration(w._id, 'Student cancelled registration');
          toast(`Your registration for "${w.title}" has been cancelled.`);
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await loadWorkshops();
        } catch (err) {
          toast(err.message || 'Cancellation failed.');
        }
      }
    });
  };

  // Handle Reason Modal Submission (Reject or Cancel)
  const handleReasonSubmit = async (reason) => {
    const { actionType, targetId } = reasonModalState;
    if (actionType === 'reject') {
      await workshopService.rejectWorkshop(targetId, reason);
      toast('Workshop has been rejected.');
    } else if (actionType === 'cancel') {
      await workshopService.cancelWorkshop(targetId, reason);
      toast('Workshop has been cancelled.');
    }
    setReasonModalState(prev => ({ ...prev, isOpen: false }));
    await loadWorkshops();
  };

  // Computed metrics for staff dashboard
  const metrics = useMemo(() => {
    const total = totalCount;
    const pending = workshops.filter(w => w.approvalStatus === 'PENDING_APPROVAL').length;
    const published = workshops.filter(w => w.isPublished).length;
    const totalEnrolled = workshops.reduce((acc, w) => acc + (w.enrolledCount || 0), 0);
    return { total, pending, published, totalEnrolled };
  }, [workshops, totalCount]);

  const headerActions = (
    <div className="button-group">
      {has('WORKSHOP_CREATE') && (
        <button
          className="primary"
          id="btn-create-workshop"
          type="button"
          onClick={() => {
            setEditingWorkshop(null);
            setCreateModalOpen(true);
          }}
        >
          <PlusIcon size={16} /> Create Workshop
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Training & Workshops"
      subtitle={isStudent ? 'Browse interactive bootcamps, technical training, and track your attendance & verified certificates.' : 'Manage campus training programs, student rosters, session attendance, and digital certifications.'}
      actions={!isStudent ? headerActions : null}
      currentPath="/training-workshops"
    >
      <section>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--line)', marginBottom: '20px' }}>
          {isStudent ? (
            <>
              {[
                { id: 'browse', label: 'Browse Workshops' },
                { id: 'my-registrations', label: 'My Registrations' },
                { id: 'my-certificates', label: `My Certificates (${myCertificates.length})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
                  style={{
                    padding: '10px 18px',
                    border: 'none',
                    background: 'transparent',
                    fontWeight: activeTab === tab.id ? 700 : 500,
                    color: activeTab === tab.id ? 'var(--teal)' : 'var(--muted)',
                    borderBottom: activeTab === tab.id ? '3px solid var(--teal)' : '3px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.92rem'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </>
          ) : (
            <>
              {[
                { id: 'dashboard', label: 'Workshop Dashboard' },
                { id: 'manage', label: 'Manage Workshops' },
                ...(isPlacementHead ? [
                  { id: 'approval-queue', label: 'Approval Queue' },
                  { id: 'certificates', label: 'Certifications' }
                ] : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }}
                  style={{
                    padding: '10px 18px',
                    border: 'none',
                    background: 'transparent',
                    fontWeight: activeTab === tab.id ? 700 : 500,
                    color: activeTab === tab.id ? 'var(--teal)' : 'var(--muted)',
                    borderBottom: activeTab === tab.id ? '3px solid var(--teal)' : '3px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.92rem'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* STAFF DASHBOARD VIEW */}
        {!isStudent && activeTab === 'dashboard' && (
          <div>
            {/* KPI Cards */}
            <div className="cards" style={{ marginBottom: '24px' }}>
              <div className="metric">
                <span>Total Workshops</span>
                <strong>{metrics.total}</strong>
              </div>
              <div className="metric" style={{ borderLeft: '4px solid var(--amber)' }}>
                <span>Pending Approvals</span>
                <strong style={{ color: 'var(--amber)' }}>{metrics.pending}</strong>
              </div>
              <div className="metric" style={{ borderLeft: '4px solid var(--green)' }}>
                <span>Published Programs</span>
                <strong style={{ color: 'var(--green)' }}>{metrics.published}</strong>
              </div>
              <div className="metric" style={{ borderLeft: '4px solid var(--teal)' }}>
                <span>Active Enrollments</span>
                <strong style={{ color: 'var(--teal)' }}>{metrics.totalEnrolled}</strong>
              </div>
            </div>

            {/* Quick Actions & Upcoming Schedule */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div className="card">
                <h3>Quick Management Actions</h3>
                <div className="quick-list" style={{ marginTop: '14px' }}>
                  <a href="#/training-workshops" onClick={() => setActiveTab('manage')}>
                    <span>Manage all scheduled programs</span>
                    <strong>View List →</strong>
                  </a>
                  {isPlacementHead && (
                    <a href="#/training-workshops" onClick={() => setActiveTab('approval-queue')}>
                      <span>Review pending workshop requests</span>
                      <strong>Approval Queue →</strong>
                    </a>
                  )}
                  <a href="#/training-workshops" onClick={() => { setEditingWorkshop(null); setCreateModalOpen(true); }}>
                    <span>Create new workshop curriculum</span>
                    <strong>+ New Draft</strong>
                  </a>
                </div>
              </div>

              <div className="card">
                <h3>Upcoming Workshops Overview</h3>
                <div style={{ marginTop: '12px' }}>
                  {workshops.slice(0, 3).map(w => (
                    <div key={w._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div>
                        <strong>{w.title}</strong>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                          {new Date(w.startAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} | {w.mode}
                        </div>
                      </div>
                      <span className={`badge ${w.isPublished ? 'published' : String(w.approvalStatus).toLowerCase()}`}>
                        {w.isPublished ? 'Published' : w.approvalStatus}
                      </span>
                    </div>
                  ))}
                  {workshops.length === 0 && <p className="empty">No upcoming workshops scheduled.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH & FILTERS BAR (For Manage Workshops, Approval Queue, or Browse) */}
        {(activeTab === 'manage' || activeTab === 'approval-queue' || activeTab === 'browse' || activeTab === 'my-registrations') && (
          <div className="filters" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <input
              id="ws-search-input"
              style={{ flex: '1 1 240px' }}
              placeholder="Search by Title, Description, or WS-YYYY-XXXX..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {!isCoordinator && (
              <select
                id="ws-filter-department"
                style={{ width: '200px' }}
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
                ))}
              </select>
            )}

            <select
              id="ws-filter-category"
              style={{ width: '180px' }}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {WORKSHOP_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <select
              id="ws-filter-mode"
              style={{ width: '150px' }}
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
            >
              <option value="">All Modes</option>
              {WORKSHOP_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            {!isStudent && activeTab === 'manage' && (
              <select
                id="ws-filter-status"
                style={{ width: '160px' }}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REJECTED">Rejected</option>
              </select>
            )}
          </div>
        )}

        {/* STAFF MANAGE WORKSHOPS & APPROVAL QUEUE TABLE */}
        {!isStudent && (activeTab === 'manage' || activeTab === 'approval-queue') && (
          <article className="card table-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Workshop ID</th>
                    <th>Program Title</th>
                    <th>Department</th>
                    <th>Mode & Dates</th>
                    <th style={{ textAlign: 'center' }}>Enrolled / Capacity</th>
                    <th>Approval Status</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" className="empty">Loading workshops list…</td>
                    </tr>
                  ) : workshops.length > 0 ? (
                    workshops.map((w) => {
                      const isCreator = String(w.createdBy) === String(user?.userId);
                      const canEdit = !w.isPublished && (w.approvalStatus === 'DRAFT' || w.approvalStatus === 'REJECTED');
                      const canSubmit = w.approvalStatus === 'DRAFT' && has('WORKSHOP_UPDATE');
                      const canApprove = w.approvalStatus === 'PENDING_APPROVAL' && has('WORKSHOP_APPROVE');
                      const canPublish = w.approvalStatus === 'APPROVED' && !w.isPublished && w.lifecycleStatus !== 'CANCELLED' && has('WORKSHOP_PUBLISH');
                      const canCancel = w.isPublished && w.lifecycleStatus !== 'CANCELLED' && has('WORKSHOP_CANCEL');
                      const canDelete = !w.isPublished && (w.approvalStatus === 'DRAFT' || w.approvalStatus === 'REJECTED') && has('WORKSHOP_DELETE');

                      return (
                        <tr key={w._id}>
                          <td>
                            <span className="badge badge-info">{w.workshopId}</span>
                          </td>
                          <td>
                            <a
                              href={`#/training-workshops/${w._id}`}
                              style={{ color: 'inherit', textDecoration: 'none' }}
                              onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
                              onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
                            >
                              <strong>{w.title}</strong>
                            </a>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                              Category: {w.category}
                            </span>
                          </td>
                          <td>
                            {w.ownershipType === 'CENTRAL_PLACEMENT_CELL' ? (
                              <span className="badge neutral">Central Placement Cell</span>
                            ) : (
                              <span>{w.departmentId?.name || 'Department'}</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge mode-${String(w.mode).toLowerCase()}`}>{w.mode}</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2px' }}>
                              {new Date(w.startAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <strong>{w.enrolledCount || 0}</strong> / {w.maxParticipants}
                            <div style={{ fontSize: '0.72rem', color: (w.seatsRemaining || 0) === 0 ? 'var(--red)' : 'var(--green)' }}>
                              {w.seatsRemaining} seats left
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${String(w.approvalStatus).toLowerCase()}`}>
                              {w.approvalStatus}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${
                              w.lifecycleStatus === 'CANCELLED'
                                ? 'cancelled'
                                : (w.lifecycleStatus === 'COMPLETED'
                                  ? 'completed'
                                  : (w.isPublished ? 'published' : String(w.lifecycleStatus).toLowerCase()))
                            }`}>
                              {w.lifecycleStatus === 'CANCELLED'
                                ? 'CANCELLED'
                                : (w.lifecycleStatus === 'COMPLETED'
                                  ? 'COMPLETED'
                                  : (w.isPublished ? 'PUBLISHED' : w.lifecycleStatus))}
                            </span>
                          </td>
                          <td>
                            <div className="actions" style={{ display: 'flex', gap: '6px' }}>
                              <a
                                href={`#/training-workshops/${w._id}`}
                                className="link-button"
                                title="View details and roster"
                              >
                                View
                              </a>

                              {canEdit && (
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => {
                                    setEditingWorkshop(w);
                                    setCreateModalOpen(true);
                                  }}
                                >
                                  Edit
                                </button>
                              )}

                              {canSubmit && (
                                <button
                                  type="button"
                                  className="link-button"
                                  style={{ color: 'var(--teal)' }}
                                  onClick={() => handleSubmitReview(w)}
                                >
                                  Submit
                                </button>
                              )}

                              {canApprove && (
                                <>
                                  <button
                                    type="button"
                                    className="link-button"
                                    style={{ color: 'var(--green)' }}
                                    onClick={() => handleApprove(w)}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="link-button"
                                    style={{ color: 'var(--red)' }}
                                    onClick={() => openRejectModal(w)}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}

                              {canPublish && (
                                <button
                                  type="button"
                                  className="link-button"
                                  style={{ color: 'var(--green)' }}
                                  onClick={() => handlePublish(w)}
                                >
                                  Publish
                                </button>
                              )}

                              {canCancel && (
                                <button
                                  type="button"
                                  className="link-button"
                                  style={{ color: 'var(--amber)' }}
                                  onClick={() => openCancelModal(w)}
                                >
                                  Cancel
                                </button>
                              )}

                              {canDelete && (
                                <button
                                  type="button"
                                  className="link-button"
                                  style={{ color: 'var(--red)' }}
                                  onClick={() => handleDelete(w)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="empty">
                        No workshops match the selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Page {currentPage} of {totalPages} ({totalCount} total)
                </span>
                <div className="button-group">
                  <button
                    className="ghost"
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </article>
        )}

        {/* STUDENT BROWSE & MY REGISTRATIONS CARDS VIEW */}
        {isStudent && (activeTab === 'browse' || activeTab === 'my-registrations') && (
          <div>
            {loading ? (
              <div className="loading">Loading workshops…</div>
            ) : studentVisibleWorkshops.length === 0 ? (
              <div className="card empty" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <WorkshopsIcon size={48} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
                <h3>{activeTab === 'my-registrations' ? 'No active registrations found.' : 'No workshops currently available.'}</h3>
                <p>Check back later or adjust your search filters to find exciting upcoming training sessions.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {studentVisibleWorkshops.map((w) => {
                  const isFull = (w.seatsRemaining || 0) <= 0;
                  const isClosed = w.registrationDeadline && new Date() > new Date(w.registrationDeadline);
                  const isRegistered = activeTab === 'my-registrations';

                  return (
                    <div key={w._id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span className={`badge mode-${String(w.mode).toLowerCase()}`}>{w.mode}</span>
                          <span className="badge neutral">{w.category}</span>
                        </div>

                        <h3 style={{ fontSize: '1.15rem', color: '#102e5f', margin: '0 0 8px' }}>
                          <a href={`#/training-workshops/${w._id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {w.title}
                          </a>
                        </h3>

                        <p style={{ fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 16px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {w.description}
                        </p>

                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '8px' }}>
                          <strong>Date:</strong> {new Date(w.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '12px' }}>
                          <strong>Location:</strong> {w.mode === 'ONLINE' ? 'Virtual (Link upon registration)' : (w.venue || 'Campus Venue')}
                        </div>

                        {/* Capacity meter */}
                        <div style={{ background: '#f1f5f9', borderRadius: '8px', padding: '10px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                            <span>Seats Remaining:</span>
                            <strong style={{ color: isFull ? 'var(--red)' : 'var(--green)' }}>
                              {isFull ? 'FULL' : `${w.seatsRemaining} / ${w.maxParticipants}`}
                            </strong>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(100, Math.round(((w.enrolledCount || 0) / (w.maxParticipants || 1)) * 100))}%`,
                                height: '100%',
                                background: isFull ? 'var(--red)' : 'var(--teal)'
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card Action */}
                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <a href={`#/training-workshops/${w._id}`} className="link-button">
                          Program Details →
                        </a>

                        {isRegistered ? (
                          <button
                            type="button"
                            className="danger"
                            style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                            onClick={() => handleStudentCancelRegistration(w)}
                          >
                            Cancel Seat
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="primary"
                            disabled={isFull || isClosed}
                            style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                            onClick={() => handleStudentRegister(w)}
                          >
                            {isFull ? 'Full' : isClosed ? 'Closed' : 'Register Now'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STUDENT MY CERTIFICATES VIEW */}
        {isStudent && activeTab === 'my-certificates' && (
          <div>
            {myCertificates.length === 0 ? (
              <div className="card empty" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <ShieldIcon size={48} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
                <h3>No certificates issued yet</h3>
                <p>Attend at least 75% of mandatory workshop sessions to earn official verified certificates.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {myCertificates.map(cert => (
                  <div key={cert._id} className="card" style={{ borderLeft: '4px solid var(--teal)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="badge badge-info">{cert.certificateNumber}</span>
                      <span className="badge published">VERIFIED</span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', color: '#102e5f', margin: '6px 0' }}>
                      {cert.workshopId?.title || 'Workshop Program'}
                    </h3>

                    <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 14px' }}>
                      Issued: {new Date(cert.issuedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </p>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                      <button
                        className="primary"
                        type="button"
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        onClick={() => setViewingCertificate(cert)}
                      >
                        View & Print
                      </button>
                      <a
                        href={`#/verify-certificate/${cert.verificationCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="secondary"
                        style={{ padding: '6px 12px', fontSize: '0.82rem', textDecoration: 'none' }}
                      >
                        Public Link
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* CREATE & EDIT MODAL */}
      <WorkshopModal
        isOpen={createModalOpen}
        workshop={editingWorkshop}
        onClose={() => {
          setCreateModalOpen(false);
          setEditingWorkshop(null);
        }}
        onSubmit={handleSaveWorkshop}
        isProcessing={isProcessing}
      />

      {/* REASON MODAL (Reject, Cancel) */}
      <WorkshopReasonModal
        isOpen={reasonModalState.isOpen}
        title={reasonModalState.title}
        message={reasonModalState.message}
        confirmLabel={reasonModalState.confirmLabel}
        onClose={() => setReasonModalState(prev => ({ ...prev, isOpen: false }))}
        onSubmit={handleReasonSubmit}
      />

      {/* CONFIRM MODAL */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        danger={confirmModalState.danger}
        onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalState.onConfirm}
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
