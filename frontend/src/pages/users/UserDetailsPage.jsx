import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { userService } from '../../services/user.service.js';
import { roleService } from '../../services/role.service.js';
import { sessionService } from '../../services/session.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { EditUserModal } from '../../components/users/EditUserModal.jsx';
import { StudentModal } from '../../components/students/StudentModal.jsx';
import { studentService } from '../../services/student.service.js';
import { CompanyModal } from '../../components/companies/CompanyModal.jsx';
import { companyService } from '../../services/company.service.js';

export function UserDetailsPage({ userId }) {
  const { user: currentUser, has } = useAuth();
  const { toast } = useToast();

  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [studentProfile, setStudentProfile] = useState(null);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    danger: false,
    action: null
  });

  const loadUserDetails = async () => {
    setLoading(true);
    setError('');
    try {
      const userData = await userService.getUser(userId);
      setUser(userData);

      const [roleData, sessionData] = await Promise.all([
        userData.roleId
          ? roleService.getRole(userData.roleId).catch(() => ({
              _id: userData.roleId,
              name: userData.roleId,
              permissionIds: []
            }))
          : Promise.resolve({ name: '—', permissionIds: [] }),
        has('SESSION_READ')
          ? sessionService
              .listSessions({ userId, limit: 5 })
              .catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] })
      ]);

      setRole(roleData);
      setSessions(sessionData.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load user details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserDetails();
  }, [userId, has]);

  const getInitials = (email = '') =>
    email
      .split('@')[0]
      .split(/[._-]/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const getDisplayName = (u) =>
    u?.email?.split('@')[0].replace(/[._-]/g, ' ') || 'Portal User';

  const formatDate = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(value))
      : '—';

  const handleActivate = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Activate Account',
      message: 'Are you sure you want to activate this user account?',
      confirmLabel: 'Activate Account',
      danger: false,
      action: async () => {
        try {
          await userService.setStatus(userId, 'ACTIVE');
          toast('Account activated.');
          loadUserDetails();
        } catch (err) {
          toast(err.message);
        }
      }
    });
  };

  const handleDeactivate = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Deactivate Account',
      message: 'Are you sure you want to deactivate this user account?',
      confirmLabel: 'Deactivate Account',
      danger: true,
      action: async () => {
        try {
          await userService.setStatus(userId, 'INACTIVE');
          toast('Account deactivated.');
          loadUserDetails();
        } catch (err) {
          toast(err.message);
        }
      }
    });
  };

  const handleLock = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Lock Account',
      message: 'Are you sure you want to lock this user account for 30 minutes?',
      confirmLabel: 'Lock Account',
      danger: true,
      action: async () => {
        try {
          await userService.lockUser(userId, 30);
          toast('Account locked.');
          loadUserDetails();
        } catch (err) {
          toast(err.message);
        }
      }
    });
  };

  const handleUnlock = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Unlock Account',
      message: 'Unlock this user account and reset failed login attempts?',
      confirmLabel: 'Unlock Account',
      danger: false,
      action: async () => {
        try {
          await userService.unlockUser(userId);
          toast('Account unlocked.');
          loadUserDetails();
        } catch (err) {
          toast(err.message);
        }
      }
    });
  };

  const handleDelete = () => {
    if (currentUser?._id === userId) {
      toast('You cannot delete your own currently logged-in account.');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to delete this user permanently? This action cannot be undone.',
      confirmLabel: 'Delete User',
      danger: true,
      action: async () => {
        try {
          await userService.deleteUser(userId);
          toast('User deleted successfully.');
          window.location.hash = '#/users';
        } catch (err) {
          toast(err.message);
        }
      }
    });
  };

  if (loading) {
    return (
      <PortalLayout
        title="User Details"
        subtitle="Review account access, assigned permissions, and login activity."
        currentPath={`/users/${userId}`}
      >
        <Loading message="Loading user details…" />
      </PortalLayout>
    );
  }

  if (error || !user) {
    return (
      <PortalLayout
        title="User Details"
        subtitle=""
        currentPath={`/users/${userId}`}
      >
        <p className="notice error">{error || 'User not found.'}</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title="User Details"
      subtitle="Review account access, assigned permissions, and login activity."
      currentPath={`/users/${userId}`}
    >
      <section className="detail-grid">
        <article className="card">
          <div className="profile-head">
            <div className="profile-avatar">{getInitials(user.email)}</div>
            <div>
              <h2>{getDisplayName(user)}</h2>
              <p>{user.email}</p>
            </div>
          </div>

          <dl className="definition-list">
            <div>
              <dt>User ID</dt>
              <dd>{user.universityId || user.employeeId || user.companyBusinessId || '—'}</dd>
            </div>
            <div>
              <dt>User type</dt>
              <dd>{user.userType}</dd>
            </div>
            <div>
              <dt>Assigned role</dt>
              <dd>{role?.name || user.roleId}</dd>
            </div>
            <div>
              <dt>Account status</dt>
              <dd>
                <Badge status={user.accountStatus} />
              </dd>
            </div>
            <div>
              <dt>Last login</dt>
              <dd>{formatDate(user.lastLoginAt)}</dd>
            </div>
          </dl>

          <div className="form-actions">
            {has('USER_UPDATE') && (
              <button
                className="primary"
                type="button"
                onClick={async () => {
                  if (user?.userType === 'STUDENT') {
                    try {
                      const res = await studentService.listStudents({
                        search: user.universityId || user.email,
                        limit: 5
                      });
                      const stu = res.items?.find(
                        (item) =>
                          item.userId === user._id ||
                          item.universityId === user.universityId ||
                          item.email?.toLowerCase() === user.email?.toLowerCase()
                      );
                      if (stu) {
                        setStudentProfile(stu);
                        setStudentModalOpen(true);
                        return;
                      }
                    } catch (_) {}
                  } else if (user?.userType === 'COMPANY') {
                    try {
                      if (user.companyId) {
                        const comp = await companyService.getCompany(user.companyId);
                        if (comp) {
                          setCompanyProfile(comp);
                          setCompanyModalOpen(true);
                          return;
                        }
                      }
                    } catch (_) {}
                  }
                  setEditModalOpen(true);
                }}
              >
                Edit User
              </button>
            )}
            {has('USER_ASSIGN_ROLE') && (
              <a className="secondary" href={`#/users/${user._id}/role`}>
                Change role
              </a>
            )}
            {has('USER_MANAGE_STATUS') && user.accountStatus === 'INACTIVE' && (
              <button className="ghost" type="button" onClick={handleActivate}>
                Activate account
              </button>
            )}
            {has('USER_MANAGE_STATUS') && user.accountStatus === 'ACTIVE' && (
              <button className="ghost" type="button" onClick={handleDeactivate}>
                Deactivate account
              </button>
            )}
            {has('USER_LOCK') && user.accountStatus === 'ACTIVE' && (
              <button className="ghost" type="button" onClick={handleLock}>
                Lock account
              </button>
            )}
            {has('USER_UNLOCK') && user.accountStatus === 'LOCKED' && (
              <button className="ghost" type="button" onClick={handleUnlock}>
                Unlock account
              </button>
            )}
            {has('USER_DELETE') && (
              <button className="danger" type="button" onClick={handleDelete}>
                Delete User
              </button>
            )}
          </div>
        </article>

        <aside className="card">
          <h2>Assigned permissions</h2>
          <div className="quick-list">
            {role?.permissionIds?.length ? (
              role.permissionIds.map((p) => <span key={p}>{p}</span>)
            ) : (
              <p>No permissions assigned.</p>
            )}
          </div>

          {has('SESSION_READ') && (
            <>
              <div className="section-title">
                <h3>Recent login activity</h3>
                <a className="text-link" href="#/sessions">
                  View all
                </a>
              </div>
              {sessions.length > 0 ? (
                <div className="quick-list">
                  {sessions.map((s) => (
                    <span key={s._id}>
                      {formatDate(s.loginAt)} · <Badge status={s.status} />
                    </span>
                  ))}
                </div>
              ) : (
                <p>No session activity found.</p>
              )}
            </>
          )}
        </aside>
      </section>

      <EditUserModal
        isOpen={editModalOpen}
        user={user}
        onClose={() => setEditModalOpen(false)}
        onSuccess={() => {
          toast('User updated successfully.');
          loadUserDetails();
        }}
      />

      <StudentModal
        isOpen={studentModalOpen}
        student={studentProfile}
        onClose={() => {
          setStudentModalOpen(false);
          setStudentProfile(null);
        }}
        onSuccess={() => {
          toast('Student profile updated successfully.');
          loadUserDetails();
        }}
      />

      <CompanyModal
        isOpen={companyModalOpen}
        company={companyProfile}
        onClose={() => {
          setCompanyModalOpen(false);
          setCompanyProfile(null);
        }}
        onSuccess={() => {
          toast('Company profile updated successfully.');
          loadUserDetails();
        }}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        danger={confirmModal.danger}
        onConfirm={async () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (confirmModal.action) await confirmModal.action();
        }}
      />
    </PortalLayout>
  );
}
