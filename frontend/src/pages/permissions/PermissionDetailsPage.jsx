import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { permissionService } from '../../services/permission.service.js';
import { roleService } from '../../services/role.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';

export function PermissionDetailsPage({ permissionId }) {
  const { has } = useAuth();
  const { toast } = useToast();

  const [permission, setPermission] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [permData, rolesData] = await Promise.all([
          permissionService.getPermission(permissionId),
          has('ROLE_READ') ? roleService.listRoles() : Promise.resolve([])
        ]);
        setPermission(permData);
        setRoles(rolesData.filter((r) => r.permissionIds?.includes(permissionId)));
      } catch (err) {
        toast(err.message || 'Failed to load permission.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [permissionId, has]);

  const handleDelete = async () => {
    try {
      await permissionService.deletePermission(permissionId);
      toast('Permission deleted.');
      window.location.hash = '#/permissions';
    } catch (err) {
      toast(err.message || 'Failed to delete permission.');
    }
  };

  if (loading) {
    return (
      <PortalLayout
        title="Permission Details"
        subtitle="Review role assignments for this permission."
        currentPath={`/permissions/${permissionId}`}
      >
        <Loading message="Loading permission…" />
      </PortalLayout>
    );
  }

  if (!permission) {
    return (
      <PortalLayout
        title="Permission Details"
        subtitle=""
        currentPath={`/permissions/${permissionId}`}
      >
        <p className="notice error">Permission not found.</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title="Permission Details"
      subtitle="Review where this permission is used."
      currentPath={`/permissions/${permissionId}`}
    >
      <section className="detail-grid">
        <article className="card">
          <h2>{permission.name}</h2>
          <p>{permission.description}</p>
          <dl className="definition-list">
            <div>
              <dt>Permission ID</dt>
              <dd>
                <code>{permission._id}</code>
              </dd>
            </div>
            <div>
              <dt>Module</dt>
              <dd>{permission.module}</dd>
            </div>
            <div>
              <dt>Action</dt>
              <dd>
                <Badge status={permission.action} />
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge status={permission.isActive ? 'ACTIVE' : 'INACTIVE'} />
              </dd>
            </div>
          </dl>

          <div className="form-actions">
            {has('PERMISSION_UPDATE') && (
              <a
                className="primary"
                href={`#/permissions/${permission._id}/edit`}
              >
                Edit permission
              </a>
            )}
            {has('PERMISSION_DELETE') && (
              <button
                className="danger"
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete permission
              </button>
            )}
          </div>
        </article>

        <aside className="card">
          <h2>Roles using this permission</h2>
          <div className="quick-list">
            {roles.length > 0 ? (
              roles.map((r) => (
                <a key={r._id} href={`#/roles/${r._id}`}>
                  {r.name} <span>→</span>
                </a>
              ))
            ) : (
              <p>No roles currently use this permission.</p>
            )}
          </div>
        </aside>
      </section>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Permission"
        message={`Are you sure you want to delete permission '${permission._id}'? It will be removed from all roles.`}
        confirmLabel="Delete Permission"
        danger={true}
        onConfirm={handleDelete}
      />
    </PortalLayout>
  );
}
