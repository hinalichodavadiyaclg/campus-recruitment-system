import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { companyService } from '../../services/company.service.js';
import { importService } from '../../services/import.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { CompanyModal } from '../../components/companies/CompanyModal.jsx';
import { CreateUserModal } from '../../components/users/CreateUserModal.jsx';
import { CompanyRecruitersModal } from '../../components/companies/CompanyRecruitersModal.jsx';
import { CompanyViewModal } from '../../components/companies/CompanyViewModal.jsx';
import {
  DownloadIcon,
  UploadIcon,
  FilterIcon,
  TrashIcon,
  PlusIcon
} from '../../components/common/Icons.jsx';

export function CompaniesListPage() {
  const { has } = useAuth();
  const { toast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [viewingCompany, setViewingCompany] = useState(null);
  const [deletingCompany, setDeletingCompany] = useState(null);
  const [recruitersCompany, setRecruitersCompany] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [tempPasswordNotice, setTempPasswordNotice] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await companyService.listCompanies({ limit: 100 });
      setCompanies(data.items || []);
    } catch (err) {
      toast(err.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.companyName?.toLowerCase().includes(q) ||
        c.industryType?.toLowerCase().includes(q) ||
        c.hrRecruiterName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  const handleDelete = async () => {
    if (!deletingCompany) return;
    try {
      await companyService.deleteCompany(deletingCompany._id);
      toast('Company profile and linked recruiter user account deleted.');
      setDeletingCompany(null);
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to delete company.');
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    let count = 0;
    try {
      for (const c of filteredCompanies) {
        try {
          await companyService.deleteCompany(c._id);
          count++;
        } catch (e) {
          console.error('Failed to delete company:', c._id, e);
        }
      }
      toast(`Successfully deleted ${count} company profile(s) and linked recruiter user accounts.`);
    } catch (err) {
      toast(err.message || 'Failed to delete companies.');
    } finally {
      setDeleteAllConfirm(false);
      await loadData();
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      await importService.exportData('company', { filtered: false });
      toast('Exported all company records to Excel.');
    } catch (err) {
      toast(err.message || 'Failed to export companies.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportFiltered = async () => {
    setExporting(true);
    try {
      await importService.exportData('company', { filtered: true, search });
      toast(`Exported filtered company records (${filteredCompanies.length}) to Excel.`);
    } catch (err) {
      toast(err.message || 'Failed to export filtered companies.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await importService.downloadTemplate('company');
      toast('Downloaded Company Excel template.');
    } catch (err) {
      toast(err.message || 'Failed to download template.');
    }
  };

  const headerActions = (
    <div className="button-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      {has('COMPANY_IMPORT') && (
        <>
          <button
            className="secondary"
            type="button"
            title="Download blank Excel template matching company form fields"
            onClick={handleDownloadTemplate}
          >
            <DownloadIcon size={15} /> Template
          </button>
          <a
            className="secondary"
            href="#/import/company"
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
            disabled={exporting || companies.length === 0}
            onClick={handleExportAll}
          >
            <DownloadIcon size={16} /> Export All
          </button>
          <button
            className="secondary"
            type="button"
            disabled={exporting || filteredCompanies.length === 0}
            onClick={handleExportFiltered}
          >
            <FilterIcon size={16} /> Export Filtered ({filteredCompanies.length})
          </button>
        </>
      )}
      {has('USER_DELETE') && filteredCompanies.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm(true)}
        >
          <TrashIcon size={16} /> Delete All Companies ({filteredCompanies.length})
        </button>
      )}
      {has('USER_CREATE') && (
        <button
          className="primary"
          id="btn-create-company"
          type="button"
          onClick={() => setCreateModalOpen(true)}
        >
          <PlusIcon size={16} /> Create Company
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Company Management"
      subtitle="Manage registered company profiles, industry domains, and recruiter login accounts."
      actions={headerActions}
      currentPath="/companies"
    >
      <section>
        <div className="filters">
          <input
            id="company-search"
            placeholder="Search by Company Name, Industry, HR Name, or Email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company ID</th>
                  <th>Company Name</th>
                  <th>Industry</th>
                  <th>HR Recruiter</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Est. Year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="empty">
                      Loading company records…
                    </td>
                  </tr>
                ) : filteredCompanies.length > 0 ? (
                  filteredCompanies.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--navy, #173b76)' }}>
                          {c.companyId || '—'}
                        </span>
                      </td>
                      <td>
                        <strong>{c.companyName}</strong>
                      </td>
                      <td>{c.industryType}</td>
                      <td>
                        {c.hrRecruiterName}
                        {c.designation ? ` (${c.designation})` : ''}
                      </td>
                      <td>{c.email}</td>
                      <td>{c.mobileNumber || '—'}</td>
                      <td>{c.yearEstablished || '—'}</td>
                      <td className="actions">
                        {has('USER_READ') && (
                          <button
                            className="link-button"
                            type="button"
                            title="View company profile"
                            onClick={() => setViewingCompany(c)}
                          >
                            View
                          </button>
                        )}
                        {has('USER_READ') && (
                          <button
                            className="link-button"
                            type="button"
                            title="Manage company recruiters"
                            onClick={() => setRecruitersCompany(c)}
                          >
                            Manage Recruiters
                          </button>
                        )}
                        {has('USER_UPDATE') && (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              setEditingCompany(c);
                              setCompanyModalOpen(true);
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
                            onClick={() => setDeletingCompany(c)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="empty">
                      No company records found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <CompanyRecruitersModal
        isOpen={Boolean(recruitersCompany)}
        company={recruitersCompany}
        onClose={() => setRecruitersCompany(null)}
        onUpdated={loadData}
      />

      <CompanyViewModal
        isOpen={Boolean(viewingCompany)}
        company={viewingCompany}
        onClose={() => setViewingCompany(null)}
        onEdit={(comp) => {
          setEditingCompany(comp);
          setCompanyModalOpen(true);
        }}
        onManageRecruiters={(comp) => {
          setRecruitersCompany(comp);
        }}
      />

      <CreateUserModal
        isOpen={createModalOpen}
        defaultType="COMPANY"
        onClose={() => setCreateModalOpen(false)}
        onSuccess={(result) => {
          if (result.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast('Company account created successfully.');
          }
          loadData();
        }}
      />

      <CompanyModal
        isOpen={companyModalOpen}
        company={editingCompany}
        onClose={() => {
          setCompanyModalOpen(false);
          setEditingCompany(null);
        }}
        onSuccess={(result) => {
          if (result?.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast('Company updated.');
          }
          loadData();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deletingCompany)}
        onClose={() => setDeletingCompany(null)}
        title="Delete Company Profile"
        message="Are you sure you want to delete this company profile and linked recruiter user account? This action cannot be undone."
        confirmLabel="Delete Company"
        danger={true}
        onConfirm={handleDelete}
      />

      <ConfirmModal
        isOpen={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        title="Delete All Companies"
        message="Are you sure you want to delete ALL matching company profiles and their linked recruiter user accounts? This cannot be undone."
        confirmLabel="Delete All Companies"
        danger={true}
        onConfirm={handleDeleteAll}
      />

      <ConfirmModal
        isOpen={Boolean(tempPasswordNotice)}
        onClose={() => setTempPasswordNotice(null)}
        title="Company Account Created"
        message={`Temporary password generated: ${tempPasswordNotice}`}
        confirmLabel="OK"
        onConfirm={() => setTempPasswordNotice(null)}
      />
    </PortalLayout>
  );
}

