import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { userService } from '../../services/user.service.js';
import { roleService } from '../../services/role.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';

export function UserRoleChangePage({ userId }) {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [userData, rolesData] = await Promise.all([
          userService.getUser(userId),
          roleService.listRoles()
        ]);
        setUser(userData);
        const usableRoles = rolesData.filter((r) => r.isActive);
        setRoles(usableRoles);
        setSelectedRole(userData.roleId);
      } catch (err) {
        toast(err.message || 'Failed to load user role information.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [userId]);

  const activeRoleObj = roles.find((r) => r._id === selectedRole);
  const currentRoleObj = roles.find((r) => r._id === user?.roleId);

  const handleConfirmChange = async () => {
    setConfirmOpen(false);
    try {
      await userService.changeRole(userId, selectedRole);
      toast('User role changed.');
      window.location.hash = `#/users/${userId}`;
    } catch (err) {
      toast(err.message || 'Failed to change role.');
    }
  };

  if (loading) {
    return (
      <PortalLayout
        title="Assign User Role"
        subtitle="Review the access preview before confirming a role change."
        currentPath={`/users/${userId}/role`}
      >
        <Loading message="Loading role assignment…" />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title="Assign User Role"
      subtitle="Review the access preview before confirming a role change."
      currentPath={`/users/${userId}/role`}
    >
      <section className="card" style={{ maxWidth: '580px' }}>
        <p style={{ margin: '0 0 16px', fontSize: '0.92rem' }}>
          <b>{user?.email}</b> · Current role:{' '}
          <strong style={{ color: 'var(--navy, #173b76)' }}>{currentRoleObj?.name || user?.roleId}</strong>
        </p>

        <form
          id="user-role-form"
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          onSubmit={(e) => {
            e.preventDefault();
            setConfirmOpen(true);
          }}
        >
          {/* Section: Role Selection */}
          <div style={{ marginTop: '4px', marginBottom: '2px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              👥 Role Assignment
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Select target role and inspect newly granted permission capabilities
            </p>
          </div>

          <div className="field">
            <label htmlFor="new-role">New Role *</label>
            <select
              id="new-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div id="role-preview" className="notice" style={{ fontSize: '0.84rem' }}>
            <strong>Permission preview:</strong>{' '}
            {activeRoleObj?.permissionIds?.length
              ? activeRoleObj.permissionIds.join(', ')
              : 'No permissions assigned.'}
          </div>

          <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button className="primary" type="submit">
              Confirm role change
            </button>
            <a className="ghost" href={`#/users/${userId}`}>
              Cancel
            </a>
          </div>
        </form>
      </section>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Change user role?"
        message="The user’s active sessions will be signed out and updated permissions apply immediately."
        confirmLabel="Confirm change"
        onConfirm={handleConfirmChange}
      />
    </PortalLayout>
  );
}
