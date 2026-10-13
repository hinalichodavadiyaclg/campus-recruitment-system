import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { importService } from '../../services/import.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { PlacementOfficerModal } from '../../components/placement/PlacementOfficerModal.jsx';
import { CreateUserModal } from '../../components/users/CreateUserModal.jsx';

export function PlacementOfficersListPage() {
  const { user: currentUser, has } = useAuth();
  const { toast } = useToast();

  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
      const data = await placementOfficerService.listPlacementOfficers({ limit: 100 });
      setOfficers(data.items || []);
    } catch (err) {
      toast(err.message || 'Failed to load placement officers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOfficers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return officers;
    return officers.filter(
      (po) =>
        po.employeeId?.toLowerCase().includes(q) ||
        po.firstName?.toLowerCase().includes(q) ||
        po.lastName?.toLowerCase().includes(q) ||
        po.email?.toLowerCase().includes(q) ||
        po.mobileNumber?.toLowerCase().includes(q) ||
        po.role?.toLowerCase().includes(q)
    );
  }, [officers, search]);

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
      await importService.exportData('placement', { filtered: true, search });
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
            📥 Template
          </button>
          <a
            className="secondary"
            href="#/import/placement"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            ⬆️ Import Excel
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
            📊 Export All
          </button>
          <button
            className="secondary"
            type="button"
            disabled={exporting || filteredOfficers.length === 0}
            onClick={handleExportFiltered}
          >
            🔍 Export Filtered ({filteredOfficers.length})
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
          🗑️ Delete All Officers ({filteredOfficers.length})
        </button>
      )}
      {has('USER_CREATE') && (
        <button
          className="primary"
          id="btn-create-placement-officer"
          type="button"
          onClick={() => setCreateModalOpen(true)}
        >
          + Create Placement Officer
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
        <div className="filters">
          <input
            id="officer-search"
            placeholder="Search by Employee ID, Name, Email, or Role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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

