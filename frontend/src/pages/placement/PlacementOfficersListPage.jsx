import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { departmentService } from '../../services/department.service.js';
import { importService } from '../../services/import.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { PlacementOfficerModal } from '../../components/placement/PlacementOfficerModal.jsx';
import { CreateUserModal } from '../../components/users/CreateUserModal.jsx';
import {
  DownloadIcon,
  UploadIcon,
  FilterIcon,
  TrashIcon,
  PlusIcon
} from '../../components/common/Icons.jsx';

export function PlacementOfficersListPage() {
  const { user: currentUser, has } = useAuth();
  const { toast } = useToast();

  const [officers, setOfficers] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [officerModalOpen, setOfficerModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [deletingOfficer, setDeletingOfficer] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [tempPasswordNotice, setTempPasswordNotice] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [officersData, deptsData] = await Promise.all([
        placementOfficerService.listPlacementOfficers({ limit: 500 }),
        departmentService.listDepartments({ limit: 100, isActive: true }).catch(() => ({ items: [] }))
      ]);
      setOfficers(officersData.items || officersData || []);
      setDepartmentsList(deptsData.items || deptsData || []);
    } catch (err) {
      toast(err.message || 'Failed to load placement officers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRoleFilterChange = (newRole) => {
    setRoleFilter(newRole);
    if (newRole !== 'ROLE_PLACEMENT_COORDINATOR') {
      setDepartmentFilter('');
    }
  };

  const filteredOfficers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return officers.filter((po) => {
      // 1. Role matching
      if (roleFilter === 'ROLE_PLACEMENT_HEAD') {
        const isHead =
          po.role === 'ROLE_PLACEMENT_HEAD' ||
          po.role === 'PLACEMENT_HEAD' ||
          po.designation?.toLowerCase().includes('head');
        if (!isHead) return false;
      } else if (roleFilter === 'ROLE_PLACEMENT_COORDINATOR') {
        const isCoordinator =
          po.role === 'ROLE_PLACEMENT_COORDINATOR' ||
          po.role === 'PLACEMENT_COORDINATOR' ||
          po.designation?.toLowerCase().includes('coordinator');
        if (!isCoordinator) return false;

        // Dynamic Department scoping
        if (departmentFilter) {
          const pDeptId = po.departmentId?._id
            ? String(po.departmentId._id)
            : po.departmentId
            ? String(po.departmentId)
            : '';
          if (pDeptId) {
            if (pDeptId !== String(departmentFilter)) return false;
          } else if (po.department) {
            const matchedDept = departmentsList.find(
              (d) =>
                d.name?.toLowerCase() === po.department.toLowerCase() ||
                d.code?.toLowerCase() === po.department.toLowerCase()
            );
            if (!matchedDept || String(matchedDept._id) !== String(departmentFilter)) return false;
          } else {
            return false;
          }
        }
      }

      // 2. Search query matching
      if (q) {
        return (
          po.employeeId?.toLowerCase().includes(q) ||
          po.firstName?.toLowerCase().includes(q) ||
          po.lastName?.toLowerCase().includes(q) ||
          po.email?.toLowerCase().includes(q) ||
          po.mobileNumber?.toLowerCase().includes(q) ||
          po.role?.toLowerCase().includes(q) ||
          po.designation?.toLowerCase().includes(q) ||
          (po.departmentId?.name || po.department || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [officers, search, roleFilter, departmentFilter, departmentsList]);

  const handleDelete = async () => {
    if (!deletingOfficer) return;
    try {
      await placementOfficerService.deletePlacementOfficer(deletingOfficer._id);
      toast('Placement Officer profile and linked user account deleted.');
      setDeletingOfficer(null);
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to delete placement officer.');
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    let count = 0;
    try {
      for (const po of filteredOfficers) {
        if (currentUser?._id === po._id || currentUser?.email === po.email) {
          continue; // Protect logged-in user
        }
        try {
          await placementOfficerService.deletePlacementOfficer(po._id);
          count++;
        } catch (e) {
          console.error('Failed to delete officer:', po._id, e);
        }
      }
      toast(`Successfully deleted ${count} placement officer profile(s).`);
    } catch (err) {
      toast(err.message || 'Failed to delete placement officers.');
    } finally {
      setDeleteAllConfirm(false);
      await loadData();
    }
  };

  const formatRoleLabel = (role) => {
    if (role === 'ROLE_PLACEMENT_HEAD') return 'Placement Head';
    if (role === 'ROLE_PLACEMENT_COORDINATOR') return 'Placement Coordinator';
    return role;
  };

  const [exporting, setExporting] = useState(false);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      await importService.exportData('placement', { filtered: false });
      toast('Exported all placement officer records to Excel.');
    } catch (err) {
      toast(err.message || 'Failed to export placement officers.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportFiltered = async () => {
    setExporting(true);
    try {
      await importService.exportData('placement', {
        filtered: true,
        search,
        role: roleFilter,
        department: departmentFilter
      });
      toast(`Exported filtered placement officer records (${filteredOfficers.length}) to Excel.`);
    } catch (err) {
      toast(err.message || 'Failed to export filtered placement officers.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await importService.downloadTemplate('placement');
      toast('Downloaded Placement Officer Excel template.');
    } catch (err) {
      toast(err.message || 'Failed to download template.');
    }
  };

  const headerActions = (
    <div className="button-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      {has('PLACEMENT_USER_IMPORT') && (
        <>
          <button
            className="secondary"
            type="button"
            title="Download blank Excel template matching placement officer form fields"
            onClick={handleDownloadTemplate}
          >
            <DownloadIcon size={15} /> Template
          </button>
          <a
            className="secondary"
            href="#/import/placement"
            style={{ textDecoration: 'none' }}
          >
            <UploadIcon size={15} /> Import Excel
          </a>
        </>
      )}
      {has('USER_READ') && (
        <>
          <button
            className="secondary"
            type="button"
            disabled={exporting || officers.length === 0}
            onClick={handleExportAll}
          >
            <DownloadIcon size={16} /> Export All
          </button>
          <button
            className="secondary"
            type="button"
            disabled={exporting || filteredOfficers.length === 0}
            onClick={handleExportFiltered}
          >
            <FilterIcon size={16} /> Export Filtered ({filteredOfficers.length})
          </button>
        </>
      )}
      {has('USER_DELETE') && filteredOfficers.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm(true)}
        >
          <TrashIcon size={16} /> Delete All Officers ({filteredOfficers.length})
        </button>
      )}
      {has('USER_CREATE') && (
        <button
          className="primary"
          id="btn-create-placement-officer"
          type="button"
          onClick={() => setCreateModalOpen(true)}
        >
          <PlusIcon size={16} /> Create Placement Officer
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Placement Officer Management"
      subtitle="Manage placement cell staff profiles, assigned coordinator/head roles, and login access."
      actions={headerActions}
      currentPath="/placement-officers"
    >
      <section>
        <div
          className="filters"
          style={{
            display: 'grid',
            gridTemplateColumns: roleFilter === 'ROLE_PLACEMENT_COORDINATOR' ? '2fr 1.5fr 1.5fr auto' : '2fr 1.5fr auto',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '16px'
          }}
        >
          <input
            id="officer-search"
            placeholder="Search by Employee ID, Name, Email, or Role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="officer-role-filter"
            value={roleFilter}
            onChange={(e) => handleRoleFilterChange(e.target.value)}
          >
            <option value="">All Placement Roles</option>
            <option value="ROLE_PLACEMENT_HEAD">Placement Head</option>
            <option value="ROLE_PLACEMENT_COORDINATOR">Placement Coordinator</option>
          </select>
          {roleFilter === 'ROLE_PLACEMENT_COORDINATOR' && (
            <select
              id="officer-department-filter"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{ backgroundColor: '#eff6ff', borderColor: '#3b82f6', color: '#1e3a8a', fontWeight: 600 }}
            >
              <option value="">All Departments</option>
              {departmentsList.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} {d.code ? `(${d.code})` : ''}
                </option>
              ))}
            </select>
          )}
          {(search || roleFilter || departmentFilter) && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSearch('');
                setRoleFilter('');
                setDepartmentFilter('');
              }}
              style={{ padding: '8px 12px', fontSize: '0.84rem' }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Assigned Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="empty">
                      Loading placement officer records…
                    </td>
                  </tr>
                ) : filteredOfficers.length > 0 ? (
                  filteredOfficers.map((po) => (
                    <tr key={po._id}>
                      <td>
                        <strong>{po.employeeId}</strong>
                      </td>
                      <td>
                        {po.firstName} {po.lastName}
                      </td>
                      <td>{po.email}</td>
                      <td>{po.mobileNumber || '—'}</td>
                      <td>{formatRoleLabel(po.role)}</td>
                      <td className="actions">
                        {has('USER_UPDATE') && (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              setEditingOfficer(po);
                              setOfficerModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {has('USER_DELETE') && (
                          <button
                            className="link-button"
                            style={{ color: 'var(--red)' }}
                            type="button"
                            onClick={() => setDeletingOfficer(po)}
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
                      No placement officer records found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <CreateUserModal
        isOpen={createModalOpen}
        defaultType="PLACEMENT"
        onClose={() => setCreateModalOpen(false)}
        onSuccess={(result) => {
          if (result.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast('Placement officer account created successfully.');
          }
          loadData();
        }}
      />

      <PlacementOfficerModal
        isOpen={officerModalOpen}
        officer={editingOfficer}
        onClose={() => {
          setOfficerModalOpen(false);
          setEditingOfficer(null);
        }}
        onSuccess={(result) => {
          if (result?.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast('Placement officer updated.');
          }
          loadData();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deletingOfficer)}
        onClose={() => setDeletingOfficer(null)}
        title="Delete Placement Officer"
        message="Are you sure you want to delete this placement officer profile and linked user account? This cannot be undone."
        confirmLabel="Delete Officer"
        danger={true}
        onConfirm={handleDelete}
      />

      <ConfirmModal
        isOpen={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        title="Delete All Placement Officers"
        message="Are you sure you want to delete ALL matching placement officer profiles and their linked accounts (excluding your active logged-in account)? This cannot be undone."
        confirmLabel="Delete All Officers"
        danger={true}
        onConfirm={handleDeleteAll}
      />

      <ConfirmModal
        isOpen={Boolean(tempPasswordNotice)}
        onClose={() => setTempPasswordNotice(null)}
        title="Placement Officer Account Created"
        message={`Temporary password generated: ${tempPasswordNotice}`}
        confirmLabel="OK"
        onConfirm={() => setTempPasswordNotice(null)}
      />
    </PortalLayout>
  );
}

