import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { permissionService } from '../../services/permission.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';

export function PermissionsListPage() {
  const { has } = useAuth();
  const { toast } = useToast();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [deletingPermId, setDeletingPermId] = useState(null);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const data = await permissionService.listPermissions();
      setPermissions(data);
    } catch (err) {
      toast(err.message || 'Failed to load permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, []);

  const modules = useMemo(() => {
    return [...new Set(permissions.map((p) => p.module).filter(Boolean))];
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    const q = search.toLowerCase();
    return permissions.filter((p) => {
      const matchesSearch =
        !q ||
        `${p.name} ${p._id} ${p.description}`.toLowerCase().includes(q);
      const matchesModule = !moduleFilter || p.module === moduleFilter;
      const matchesAction = !actionFilter || p.action === actionFilter;
      return matchesSearch && matchesModule && matchesAction;
    });
  }, [permissions, search, moduleFilter, actionFilter]);

  const handleDelete = async () => {
    if (!deletingPermId) return;
    try {
      await permissionService.deletePermission(deletingPermId);
      toast('Permission deleted.');
      setDeletingPermId(null);
      loadPermissions();
    } catch (err) {
      toast(err.message || 'Failed to delete permission.');
    }
  };

  const headerActions = has('PERMISSION_CREATE') ? (
    <a className="primary" href="#/permissions/new">
      + Create permission
    </a>
  ) : null;

  return (
    <PortalLayout
      title="Permission Management"
      subtitle="Search and review all canonical permissions."
      actions={headerActions}
      currentPath="/permissions"
    >
      <section>
        <div className="filters">
          <input
            id="permission-search"
            placeholder="Search permissions by name, ID or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="permission-module"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
          >
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            id="permission-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">All actions</option>
            {['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <span />
        </div>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Permission</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="empty">
                      Loading permissions…
                    </td>
                  </tr>
                ) : filteredPermissions.length > 0 ? (
                  filteredPermissions.map((p) => (
                    <tr key={p._id}>
                      <td>
                        <b>{p.name}</b>
                        <br />
                        <span className="badge neutral">{p._id}</span>
                      </td>
                      <td>{p.module}</td>
                      <td>
                        <Badge status={p.action} />
                      </td>
                      <td>
                        <Badge status={p.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="actions">
                        <a
                          className="link-button"
                          href={`#/permissions/${p._id}`}
                        >
                          View
                        </a>
                        {has('PERMISSION_UPDATE') && (
                          <a
                            className="link-button"
                            href={`#/permissions/${p._id}/edit`}
                          >
                            Edit
                          </a>
                        )}
                        {has('PERMISSION_DELETE') && (
                          <button
                            className="link-button"
                            style={{ color: 'var(--red)' }}
                            type="button"
                            onClick={() => setDeletingPermId(p._id)}
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
                      No permissions match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <ConfirmModal
        isOpen={Boolean(deletingPermId)}
        onClose={() => setDeletingPermId(null)}
        title="Delete Permission"
        message={`Are you sure you want to delete permission '${deletingPermId}'? It will be removed from all roles.`}
        confirmLabel="Delete Permission"
        danger={true}
        onConfirm={handleDelete}
      />
    </PortalLayout>
  );
}
