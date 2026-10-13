import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { roleService } from '../../services/role.service.js';
import { userService } from '../../services/user.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';

export function RoleDetailsPage({ roleId }) {
  const { has } = useAuth();
  const { toast } = useToast();

  const [role, setRole] = useState(null);
  const [users, setUsers] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const loadRoleDetails = async () => {
    setLoading(true);
    try {
      const [roleData, usersData] = await Promise.all([
        roleService.getRole(roleId),
        has('USER_READ')
          ? userService
              .listUsers({ roleId, limit: 100 })
              .catch(() => ({ items: [], total: 0 }))
          : Promise.resolve({ items: [], total: 0 })
      ]);
      setRole(roleData);
      setUsers(usersData);
    } catch (err) {
      toast(err.message || 'Failed to load role.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoleDetails();
  }, [roleId, has]);

  const handleDeleteRole = async () => {
    try {
      await roleService.deleteRole(roleId);
      toast('Role deleted.');
      window.location.hash = '#/roles';
    } catch (err) {
      toast(err.message || 'Failed to delete role.');
    }
  };

  if (loading) {
    return (
      <PortalLayout
        title="Role Details"
        subtitle="Review permissions, users, and status for this role."
        currentPath={`/roles/${roleId}`}
      >
        <Loading message="Loading role…" />
      </PortalLayout>
    );
  }

  if (!role) {
    return (
      <PortalLayout
        title="Role Details"
        subtitle=""
        currentPath={`/roles/${roleId}`}
      >
        <p className="notice error">Role not found.</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title="Role Details"
      subtitle="Review permissions, users, and status for this role."
      currentPath={`/roles/${roleId}`}
    >
      <section className="detail-grid">
        <article className="card">
          <h2>{role.name}</h2>
          <p>{role.description}</p>
          <dl className="definition-list">
            <div>
              <dt>Role ID</dt>
              <dd>{role._id}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge status={role.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </dd>
            </div>
            <div>
              <dt>Assigned permissions</dt>
              <dd>{role.permissionIds?.length || 0}</dd>
            </div>
            <div>
              <dt>Users in role</dt>
              <dd>{users.total}</dd>
            </div>
          </dl>

          <div className="form-actions">
            {has('ROLE_ASSIGN_PERMISSION') && (
              <a className="primary" href={`#/roles/${role._id}/permissions`}>
                Manage permissions
              </a>
            )}
            {has('ROLE_UPDATE') && (
              <a className="ghost" href={`#/roles/${role._id}/edit`}>
                Edit role
              </a>
            )}
            {has('ROLE_DELETE') && role._id !== 'ROLE_SUPER_ADMIN' && (
              <button
                className="danger"
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete role
              </button>
            )}
          </div>
        </article>

        <aside className="card">
          <h2>Assigned permissions</h2>
          <div className="quick-list">
            {role.permissionIds?.length ? (
              role.permissionIds.map((p) => <span key={p}>{p}</span>)
            ) : (
              <p>No permissions assigned.</p>
            )}
          </div>

          {has('USER_READ') && (
            <>
              <div className="section-title">
                <h3>Users having this role</h3>
              </div>
              <div className="quick-list">
                {users.items?.length ? (
                  users.items.slice(0, 6).map((u) => (
                    <a key={u._id} href={`#/users/${u._id}`}>
                      {u.email} <span>→</span>
                    </a>
                  ))
                ) : (
                  <p>No users have this role.</p>
                )}
              </div>
            </>
          )}
        </aside>
      </section>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Role"
        message={`Are you sure you want to delete role '${role._id}'? This cannot be undone.`}
        confirmLabel="Delete Role"
        danger={true}
        onConfirm={handleDeleteRole}
      />
    </PortalLayout>
  );
}
