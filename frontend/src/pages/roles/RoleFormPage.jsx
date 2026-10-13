import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { roleService } from '../../services/role.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Loading } from '../../components/common/Loading.jsx';

export function RoleFormPage({ roleId }) {
  const editing = Boolean(roleId);
  const { has } = useAuth();
  const { toast } = useToast();

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  useEffect(() => {
    if (editing) {
      roleService
        .getRole(roleId)
        .then((role) => {
          setId(role._id);
          setName(role.name);
          setDescription(role.description);
          setIsActive(role.isActive !== false);
        })
        .catch((err) => {
          toast(err.message || 'Failed to load role.');
        })
        .finally(() => setLoading(false));
    }
  }, [editing, roleId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!editing && !id.trim()) {
      errors.id = 'Role ID is required (e.g. ROLE_MANAGER).';
    }

    if (!name.trim()) {
      errors.name = 'Role Name is required.';
    }

    if (!description.trim()) {
      errors.description = 'Role Description is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setGeneralError('');
    setSaving(true);

    const body = {
      name: name.trim(),
      description: description.trim()
    };

    try {
      let saved;
      if (editing) {
        saved = await roleService.updateRole(roleId, body);
      } else {
        saved = await roleService.createRole({
          ...body,
          id: id.trim()
        });
      }

      if (has('ROLE_MANAGE_STATUS') && saved.isActive !== isActive) {
        await roleService.setRoleStatus(saved._id, isActive);
      }

      toast('Role saved.');
      window.location.hash = `#/roles/${saved._id}`;
    } catch (err) {
      const msg = err.message || 'Failed to save role.';
      if (msg.toLowerCase().includes('id') || msg.toLowerCase().includes('key')) {
        setFieldErrors((prev) => ({ ...prev, id: msg }));
      } else if (msg.toLowerCase().includes('name')) {
        setFieldErrors((prev) => ({ ...prev, name: msg }));
      } else {
        setGeneralError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PortalLayout
        title={editing ? 'Edit Role' : 'Create Role'}
        subtitle="Configure role details and metadata."
        currentPath={editing ? `/roles/${roleId}/edit` : '/roles/new'}
      >
        <Loading message="Loading role form…" />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title={editing ? 'Edit Role' : 'Create Role'}
      subtitle="Configure role details and metadata."
      currentPath={editing ? `/roles/${roleId}/edit` : '/roles/new'}
    >
      <section className="card" style={{ maxWidth: '580px' }}>
        <form
          id="role-form"
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          onSubmit={handleSubmit}
        >
          {/* Section: Role Configuration */}
          <div style={{ marginTop: '4px', marginBottom: '2px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🛡️ Role Configuration
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Define RBAC role identifier, display name, and purpose
            </p>
          </div>

          <div className="field">
            <label htmlFor="role-id">Role ID *</label>
            <input
              id="role-id"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                if (fieldErrors.id) setFieldErrors((prev) => ({ ...prev, id: '' }));
              }}
              disabled={editing || saving}
              placeholder="e.g. ROLE_FACULTY_COORDINATOR"
              style={fieldErrors.id ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(fieldErrors.id)}
            />
            {fieldErrors.id && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.id}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="role-name">Role Name *</label>
            <input
              id="role-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
              }}
              disabled={saving}
              placeholder="e.g. Faculty Coordinator"
              style={fieldErrors.name ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.name}
              </span>
            )}
          </div>

          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="role-description">Description *</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {description.length}/300
              </span>
            </div>
            <textarea
              id="role-description"
              rows="3"
              maxLength={300}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: '' }));
              }}
              disabled={saving}
              placeholder="Describe access privileges and responsibilities of this role..."
              style={{
                resize: 'vertical',
                ...(fieldErrors.description ? { borderColor: 'var(--red, #e53e3e)' } : {})
              }}
              aria-invalid={Boolean(fieldErrors.description)}
            />
            {fieldErrors.description && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.description}
              </span>
            )}
          </div>

          {has('ROLE_MANAGE_STATUS') && (
            <label className="remember" style={{ marginTop: '2px' }}>
              <input
                id="role-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              Role is active
            </label>
          )}

          {generalError && (
            <p id="role-notice" className="notice error">
              {generalError}
            </p>
          )}

          <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create role'}
            </button>
            <a className="ghost" href="#/roles">
              Cancel
            </a>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
