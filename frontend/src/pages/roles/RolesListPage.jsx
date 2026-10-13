import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { roleService } from '../../services/role.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';

export function RolesListPage() {
  const { has } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingRoleId, setDeletingRoleId] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await roleService.listRoles();
      setRoles(data);
    } catch (err) {
      toast(err.message || 'Failed to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const handleDeleteRole = async () => {
    if (!deletingRoleId) return;
    try {
      await roleService.deleteRole(deletingRoleId);
      toast('Role deleted.');
      setDeletingRoleId(null);
      loadRoles();
    } catch (err) {
      toast(err.message || 'Failed to delete role.');
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    let count = 0;
    try {
      const deletableRoles = roles.filter((r) => r._id !== 'ROLE_SUPER_ADMIN');
      for (const r of deletableRoles) {
        try {
          await roleService.deleteRole(r._id);
          count++;
        } catch (e) {
          console.error('Failed to delete role:', r._id, e);
        }
      }
      toast(`Successfully deleted ${count} custom role(s).`);
    } catch (err) {
      toast(err.message || 'Failed to delete roles.');
    } finally {
      setDeleteAllConfirm(false);
      await loadRoles();
    }
  };

  const headerActions = (
    <div className="button-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {has('ROLE_DELETE') && roles.filter((r) => r._id !== 'ROLE_SUPER_ADMIN').length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm(true)}
        >
          🗑️ Delete All Custom Roles
        </button>
      )}
      {has('ROLE_CREATE') && (
        <a className="primary" href="#/roles/new">
          + Create role
        </a>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Role Management"
      subtitle="Define roles, manage assigned permissions, and configure access."
      actions={headerActions}
      currentPath="/roles"
    >
      <article className="card table-card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Status</th>
                <th>Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="empty">
                    Loading roles…
                  </td>
                </tr>
              ) : roles.length > 0 ? (
                roles.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <b>{r.name}</b>
                      <br />
                      <span className="badge neutral">{r._id}</span>
                    </td>
                    <td>{r.description}</td>
                    <td>
                      <Badge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td>{r.permissionIds?.length || 0}</td>
                    <td className="actions">
                      <a className="link-button" href={`#/roles/${r._id}`}>
                        View
                      </a>
                      {has('ROLE_UPDATE') && (
                        <a
                          className="link-button"
                          href={`#/roles/${r._id}/edit`}
                        >
                          Edit
                        </a>
                      )}
                      {has('ROLE_ASSIGN_PERMISSION') && (
                        <a
                          className="link-button"
                          href={`#/roles/${r._id}/permissions`}
                        >
                          Permissions
                        </a>
                      )}
                      {has('ROLE_DELETE') && r._id !== 'ROLE_SUPER_ADMIN' && (
                        <button
                          className="link-button"
                          style={{ color: 'var(--red)' }}
                          type="button"
                          onClick={() => setDeletingRoleId(r._id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty">
                    No roles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <ConfirmModal
        isOpen={Boolean(deletingRoleId)}
        onClose={() => setDeletingRoleId(null)}
        title="Delete Role"
        message={`Are you sure you want to delete role '${deletingRoleId}'? This cannot be undone.`}
        confirmLabel="Delete Role"
        danger={true}
        onConfirm={handleDeleteRole}
      />

      <ConfirmModal
        isOpen={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        title="Delete All Custom Roles"
        message="Are you sure you want to delete ALL custom roles (excluding system SUPER_ADMIN role)? This cannot be undone."
        confirmLabel="Delete All Custom Roles"
        danger={true}
        onConfirm={handleDeleteAll}
      />
    </PortalLayout>
  );
}
