import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { roleService } from '../../services/role.service.js';
import { permissionService } from '../../services/permission.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Loading } from '../../components/common/Loading.jsx';

export function RolePermissionsPage({ roleId }) {
  const { toast } = useToast();
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [roleData, permsData] = await Promise.all([
          roleService.getRole(roleId),
          permissionService.listPermissions()
        ]);
        setRole(roleData);
        setPermissions(permsData);
        setSelectedIds(roleData.permissionIds || []);
      } catch (err) {
        toast(err.message || 'Failed to load permissions.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [roleId]);

  const handleToggle = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await roleService.assignPermissions(roleId, selectedIds);
      toast('Role permissions updated successfully.');
      window.location.hash = `#/roles/${roleId}`;
    } catch (err) {
      setError(err.message || 'Failed to save permissions.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PortalLayout
        title="Assign Permissions to Role"
        subtitle="Loading permissions…"
        currentPath={`/roles/${roleId}/permissions`}
      >
        <Loading message="Loading permissions…" />
      </PortalLayout>
    );
  }

  // Group permissions by module
  const groups = permissions.reduce((acc, p) => {
    const mod = p.module || 'Other';
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(p);
    return acc;
  }, {});

  return (
    <PortalLayout
      title="Assign Permissions to Role"
      subtitle={`Role: ${role?.name} (${role?._id})`}
      currentPath={`/roles/${roleId}/permissions`}
    >
      <section className="card">
        <form
          id="role-permissions-form"
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          onSubmit={handleSubmit}
        >
          {Object.entries(groups).map(([moduleName, items]) => (
            <section key={moduleName} className="permission-module">
              <h3>{moduleName}</h3>
              <div className="permission-grid">
                {items.map((p) => (
                  <label key={p._id} className="check-card">
                    <input
                      type="checkbox"
                      value={p._id}
                      checked={selectedIds.includes(p._id)}
                      disabled={!p.isActive}
                      onChange={() => handleToggle(p._id)}
                    />
                    <span>
                      <strong>
                        {p.action} · {p.name}
                      </strong>
                      <span>
                        <code>{p._id}</code>
                        <br />
                        {p.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}

          {error && (
            <p id="permission-notice" className="notice error">
              {error}
            </p>
          )}

          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save permissions'}
            </button>
            <a className="ghost" href={`#/roles/${roleId}`}>
              Cancel
            </a>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
