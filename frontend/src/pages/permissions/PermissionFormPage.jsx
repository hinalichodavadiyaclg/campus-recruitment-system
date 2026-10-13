import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { permissionService } from '../../services/permission.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Loading } from '../../components/common/Loading.jsx';

export function PermissionFormPage({ permissionId }) {
  const editing = Boolean(permissionId);
  const { has } = useAuth();
  const { toast } = useToast();

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [moduleName, setModuleName] = useState('');
  const [action, setAction] = useState(editing ? '' : '');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');

  useEffect(() => {
    if (editing) {
      permissionService
        .getPermission(permissionId)
        .then((perm) => {
          setId(perm._id);
          setName(perm.name);
          setModuleName(perm.module);
          setAction(perm.action || '');
          setDescription(perm.description);
          setIsActive(perm.isActive !== false);
        })
        .catch((err) => {
          toast(err.message || 'Failed to load permission.');
        })
        .finally(() => setLoading(false));
    }
  }, [editing, permissionId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!editing && !id.trim()) {
      errors.id = 'Permission ID is required (e.g. USER_CREATE).';
    }

    if (!name.trim()) {
      errors.name = 'Permission Name is required.';
    }

    if (!moduleName.trim()) {
      errors.moduleName = 'Module name is required.';
    }

    if (!action) {
      errors.action = 'Action Scope is required. Please select an action.';
    }

    if (!description.trim()) {
      errors.description = 'Description is required.';
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
      module: moduleName.trim(),
      action,
      description: description.trim()
    };

    try {
      let saved;
      if (editing) {
        saved = await permissionService.updatePermission(permissionId, body);
      } else {
        saved = await permissionService.createPermission({
          ...body,
          id: id.trim()
        });
      }

      if (has('PERMISSION_MANAGE_STATUS') && saved.isActive !== isActive) {
        await permissionService.setPermissionStatus(saved._id, isActive);
      }

      toast('Permission saved.');
      window.location.hash = `#/permissions/${saved._id}`;
    } catch (err) {
      const msg = err.message || 'Failed to save permission.';
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
        title={editing ? 'Edit Permission' : 'Create Permission'}
        subtitle="Configure canonical permission definitions."
        currentPath={editing ? `/permissions/${permissionId}/edit` : '/permissions/new'}
      >
        <Loading message="Loading permission form…" />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      title={editing ? 'Edit Permission' : 'Create Permission'}
      subtitle="Configure canonical permission definitions."
      currentPath={editing ? `/permissions/${permissionId}/edit` : '/permissions/new'}
    >
      <section className="card" style={{ maxWidth: '580px' }}>
        <form
          id="permission-form"
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          onSubmit={handleSubmit}
        >
          {/* Section: Permission Definition */}
          <div style={{ marginTop: '4px', marginBottom: '2px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--navy, #173b76)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔒 Permission Definition
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Canonical permission identifier, module, and action scope
            </p>
          </div>

          <div className="field">
            <label htmlFor="permission-id">
              Permission ID * (Canonical RESOURCE_ACTION format)
            </label>
            <input
              id="permission-id"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                if (fieldErrors.id) setFieldErrors((prev) => ({ ...prev, id: '' }));
              }}
              disabled={editing || saving}
              placeholder="e.g. USER_CREATE, ROLE_UPDATE"
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
            <label htmlFor="permission-name">Permission Name *</label>
            <input
              id="permission-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: '' }));
              }}
              disabled={saving}
              placeholder="e.g. Create User Accounts"
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
            <label htmlFor="permission-module-name">Module *</label>
            <input
              id="permission-module-name"
              value={moduleName}
              onChange={(e) => {
                setModuleName(e.target.value);
                if (fieldErrors.moduleName) setFieldErrors((prev) => ({ ...prev, moduleName: '' }));
              }}
              disabled={saving}
              placeholder="e.g. users, roles, companies"
              style={fieldErrors.moduleName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(fieldErrors.moduleName)}
            />
            {fieldErrors.moduleName && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.moduleName}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="permission-action">Action Scope *</label>
            <select
              id="permission-action"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                if (fieldErrors.action) setFieldErrors((prev) => ({ ...prev, action: '' }));
              }}
              disabled={saving}
              style={fieldErrors.action ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              aria-invalid={Boolean(fieldErrors.action)}
            >
              <option value="">-- Select Action Scope --</option>
              {['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE'].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            {fieldErrors.action && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.action}
              </span>
            )}
          </div>

          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="permission-description">Description *</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {description.length}/300
              </span>
            </div>
            <textarea
              id="permission-description"
              rows="3"
              maxLength={300}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: '' }));
              }}
              disabled={saving}
              placeholder="Detailed description of authorization granted by this permission..."
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

          {has('PERMISSION_MANAGE_STATUS') && (
            <label className="remember" style={{ marginTop: '2px' }}>
              <input
                id="permission-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              Permission is active
            </label>
          )}

          {generalError && (
            <p id="permission-form-notice" className="notice error">
              {generalError}
            </p>
          )}

          <div className="form-actions" style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create permission'}
            </button>
            <a className="ghost" href="#/permissions">
              Cancel
            </a>
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
