import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { departmentService } from '../../services/department.service.js';
import { importService } from '../../services/import.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';

function getHashQueryParams() {
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

export function FilteredPlacementRecordsPage() {
  const { toast } = useToast();

  const queryParams = useMemo(() => getHashQueryParams(), []);
  const [search, setSearch] = useState(queryParams.get('search') || '');
  const [roleFilter, setRoleFilter] = useState(queryParams.get('role') || '');
  const [departmentFilter, setDepartmentFilter] = useState(
    queryParams.get('department') || queryParams.get('departmentId') || ''
  );

  const [officers, setOfficers] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

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
      toast(err.message || 'Failed to load placement officer records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRoleFilterChange = (newRole) => {
    setRoleFilter(newRole);
    setCurrentPage(1);
    if (newRole !== 'ROLE_PLACEMENT_COORDINATOR') {
      setDepartmentFilter('');
    }
  };

  const filteredOfficers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return officers.filter((p) => {
      // 1. Role Filter matching
      if (roleFilter === 'ROLE_PLACEMENT_HEAD') {
        const isHead =
          p.role === 'ROLE_PLACEMENT_HEAD' ||
          p.role === 'PLACEMENT_HEAD' ||
          p.designation?.toLowerCase().includes('head');
        if (!isHead) return false;
      } else if (roleFilter === 'ROLE_PLACEMENT_COORDINATOR') {
        const isCoordinator =
          p.role === 'ROLE_PLACEMENT_COORDINATOR' ||
          p.role === 'PLACEMENT_COORDINATOR' ||
          p.designation?.toLowerCase().includes('coordinator');
        if (!isCoordinator) return false;

        // Dynamic Department scoping (only when Placement Coordinator is selected)
        if (departmentFilter) {
          const pDeptId = p.departmentId?._id
            ? String(p.departmentId._id)
            : p.departmentId
            ? String(p.departmentId)
            : '';
          if (pDeptId) {
            if (pDeptId !== String(departmentFilter)) return false;
          } else if (p.department) {
            const matchedDept = departmentsList.find(
              (d) =>
                d.name?.toLowerCase() === p.department.toLowerCase() ||
                d.code?.toLowerCase() === p.department.toLowerCase()
            );
            if (!matchedDept || String(matchedDept._id) !== String(departmentFilter)) return false;
          } else {
            return false;
          }
        }
      }

      // 2. Text search
      if (q) {
        const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
        const matchName = fullName.includes(q);
        const matchId = p.employeeId?.toLowerCase().includes(q);
        const matchEmail = p.email?.toLowerCase().includes(q);
        const matchDesig = p.designation?.toLowerCase().includes(q);
        const matchDept = (p.departmentId?.name || p.department || '').toLowerCase().includes(q);
        const matchRole = (p.role || '').toLowerCase().includes(q);
        return matchName || matchId || matchEmail || matchDesig || matchDept || matchRole;
      }
      return true;
    });
  }, [officers, search, roleFilter, departmentFilter, departmentsList]);

  const totalPages = Math.max(1, Math.ceil(filteredOfficers.length / PAGE_SIZE));
  const paginatedOfficers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOfficers.slice(start, start + PAGE_SIZE);
  }, [filteredOfficers, currentPage]);

  const handleBackToImport = () => {
    window.location.hash = '#/import/placement';
  };

  const handleDownloadExcel = async () => {
    setExporting(true);
    try {
      await importService.exportData('placement', {
        filtered: true,
        search,
        role: roleFilter,
        department: departmentFilter
      });
      toast(`Exported ${filteredOfficers.length} matching placement cell record(s) to Excel.`);
    } catch (err) {
      toast(err.message || 'Failed to download filtered Excel.');
    } finally {
      setExporting(false);
    }
  };

  const filterSummaryParts = [];
  if (search.trim()) filterSummaryParts.push(`Search: "${search.trim()}"`);
  if (roleFilter === 'ROLE_PLACEMENT_HEAD') filterSummaryParts.push('Role: Placement Head');
  if (roleFilter === 'ROLE_PLACEMENT_COORDINATOR') {
    filterSummaryParts.push('Role: Placement Coordinator');
    if (departmentFilter) {
      const activeDept = departmentsList.find((d) => String(d._id) === String(departmentFilter));
      if (activeDept) filterSummaryParts.push(`Department: ${activeDept.name}`);
    }
  }

  const subtitleText = filterSummaryParts.length > 0
    ? `Filtered view by ${filterSummaryParts.join(' • ')}`
    : 'All placement cell officer records (Read-Only) — filter by role, department, or search and export to Excel';

  const headerActions = (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        className="secondary"
        type="button"
        id="btn-back-to-import"
        onClick={handleBackToImport}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '9px 14px',
          fontWeight: 600,
          fontSize: '0.88rem',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        ← Back to Import Page
      </button>

      <button
        className="primary"
        type="button"
        id="btn-download-filtered-excel"
        disabled={exporting || filteredOfficers.length === 0}
        onClick={handleDownloadExcel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 18px',
          fontWeight: 600,
          fontSize: '0.88rem',
          borderRadius: '8px',
          backgroundColor: '#1d68ff',
          color: '#ffffff',
          border: 'none',
          cursor: exporting || filteredOfficers.length === 0 ? 'not-allowed' : 'pointer',
          opacity: exporting || filteredOfficers.length === 0 ? 0.65 : 1
        }}
      >
        {exporting ? '⏳ Generating Excel...' : `📊 Download Filtered Excel (${filteredOfficers.length})`}
      </button>
    </div>
  );

  return (
    <PortalLayout
      title="Placement Cell Records"
      subtitle={subtitleText}
      actions={headerActions}
      currentPath="/placement-officers/filtered"
      category="PLACEMENT CELL"
      section="Placement"
    >
      <section className="page-body">
        {/* Filter Toolbar Card */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'end',
              gap: '10px',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              paddingBottom: '4px'
            }}
          >
            <div style={{ flex: '1 1 240px', minWidth: '180px' }}>
              <label
                htmlFor="filtered-placement-search"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Search Placement Officers
              </label>
              <input
                id="filtered-placement-search"
                type="text"
                placeholder="Name, ID, Email, Role…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem'
                }}
              />
            </div>

            <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
              <label
                htmlFor="filtered-placement-role-select"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Placement Filter
              </label>
              <select
                id="filtered-placement-role-select"
                value={roleFilter}
                onChange={(e) => handleRoleFilterChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="">All Placement Roles</option>
                <option value="ROLE_PLACEMENT_HEAD">Placement Head</option>
                <option value="ROLE_PLACEMENT_COORDINATOR">Placement Coordinator</option>
              </select>
            </div>

            {/* Dynamic Department Filter — shown ONLY when Placement Coordinator is selected */}
            {roleFilter === 'ROLE_PLACEMENT_COORDINATOR' && (
              <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                <label
                  htmlFor="filtered-placement-dept-select"
                  style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#1e40af', marginBottom: '5px', whiteSpace: 'nowrap' }}
                >
                  Department (Coordinator)
                </label>
                <select
                  id="filtered-placement-dept-select"
                  value={departmentFilter}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '7px',
                    border: '1.5px solid #3b82f6',
                    fontSize: '0.84rem',
                    backgroundColor: '#eff6ff',
                    color: '#1e3a8a',
                    fontWeight: 600
                  }}
                >
                  <option value="">All Departments</option>
                  {departmentsList.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} {d.code ? `(${d.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
              {(search || roleFilter || departmentFilter) && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSearch('');
                    setRoleFilter('');
                    setDepartmentFilter('');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '7px 12px',
                    fontSize: '0.80rem',
                    color: '#64748b',
                    borderRadius: '7px',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Status summary pill */}
          <div
            style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.82rem',
              color: '#64748b'
            }}
          >
            <div>
              Showing <strong style={{ color: '#0f172a' }}>{filteredOfficers.length}</strong> of{' '}
              <strong>{officers.length}</strong> total placement officer record(s)
              {(search || roleFilter || departmentFilter) && (
                <span style={{ marginLeft: '8px', color: '#1d4ed8', fontWeight: 600 }}>
                  (Filters Active)
                </span>
              )}
            </div>
            <div>
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </div>
          </div>
        </div>

        {/* Read-Only Table */}
        <article
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>EMPLOYEE ID</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>OFFICER NAME</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>DESIGNATION</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>EMAIL</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>MOBILE NUMBER</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>DEPARTMENT / CELL</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>SYSTEM ROLE</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      Loading placement officer records…
                    </td>
                  </tr>
                ) : paginatedOfficers.length > 0 ? (
                  paginatedOfficers.map((p) => {
                    const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';
                    const deptName = p.departmentId?.name || p.department || '—';
                    return (
                      <tr key={p._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {p.employeeId || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>
                          {fullName}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {p.designation || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {p.email || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {p.mobileNumber || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {deptName}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              backgroundColor: p.role?.includes('HEAD') ? '#eff6ff' : '#f8fafc',
                              color: p.role?.includes('HEAD') ? '#1d4ed8' : '#475569'
                            }}
                          >
                            {p.role || 'Placement Officer'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ maxWidth: '380px', margin: '0 auto' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👥</div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#1e293b' }}>
                          No Matching Placement Officer Records
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.84rem' }}>
                          Try adjusting your search query or clear your active designation filter.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                background: '#fafbfc'
              }}
            >
              <button
                type="button"
                className="secondary"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>

              <span style={{ fontSize: '0.84rem', color: '#64748b' }}>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>

              <button
                type="button"
                className="secondary"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          )}
        </article>
      </section>
    </PortalLayout>
  );
}
