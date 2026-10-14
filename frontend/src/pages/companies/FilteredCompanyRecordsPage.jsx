import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { companyService } from '../../services/company.service.js';
import { importService } from '../../services/import.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';

function getHashQueryParams() {
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

export function FilteredCompanyRecordsPage() {
  const { has } = useAuth();
  const { toast } = useToast();

  const queryParams = useMemo(() => getHashQueryParams(), []);
  const [search, setSearch] = useState(queryParams.get('search') || '');
  const [industryFilter, setIndustryFilter] = useState(queryParams.get('industry') || '');

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await companyService.listCompanies({ limit: 500 });
      setCompanies(data.items || []);
    } catch (err) {
      toast(err.message || 'Failed to load company records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Unique industry types from loaded companies
  const availableIndustries = useMemo(() => {
    const set = new Set();
    companies.forEach((c) => {
      if (c.industryType?.trim()) set.add(c.industryType.trim());
    });
    return Array.from(set).sort();
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase().trim();
    return companies.filter((c) => {
      if (industryFilter && c.industryType?.toLowerCase() !== industryFilter.toLowerCase()) {
        return false;
      }
      if (q) {
        const matchName = c.companyName?.toLowerCase().includes(q);
        const matchId = c.companyId?.toLowerCase().includes(q);
        const matchRecruiter = c.hrRecruiterName?.toLowerCase().includes(q);
        const matchEmail = c.email?.toLowerCase().includes(q);
        const matchIndustry = c.industryType?.toLowerCase().includes(q);
        const matchCity = c.officeAddress?.toLowerCase().includes(q);
        return matchName || matchId || matchRecruiter || matchEmail || matchIndustry || matchCity;
      }
      return true;
    });
  }, [companies, search, industryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCompanies.slice(start, start + PAGE_SIZE);
  }, [filteredCompanies, currentPage]);

  const handleBackToImport = () => {
    window.location.hash = '#/import/company';
  };

  const handleDownloadExcel = async () => {
    setExporting(true);
    try {
      await importService.exportData('company', {
        filtered: true,
        search
      });
      toast(`Exported ${filteredCompanies.length} matching company record(s) to Excel.`);
    } catch (err) {
      toast(err.message || 'Failed to download filtered Excel.');
    } finally {
      setExporting(false);
    }
  };

  const filterSummaryParts = [];
  if (search.trim()) filterSummaryParts.push(`Search: "${search.trim()}"`);
  if (industryFilter) filterSummaryParts.push(`Industry: ${industryFilter}`);

  const subtitleText = filterSummaryParts.length > 0
    ? `Filtered view by ${filterSummaryParts.join(' • ')}`
    : 'All company records (Read-Only) — filter by industry or search and export to Excel';

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
        disabled={exporting || filteredCompanies.length === 0}
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
          cursor: exporting || filteredCompanies.length === 0 ? 'not-allowed' : 'pointer',
          opacity: exporting || filteredCompanies.length === 0 ? 0.65 : 1
        }}
      >
        {exporting ? '⏳ Generating Excel...' : `📊 Download Filtered Excel (${filteredCompanies.length})`}
      </button>
    </div>
  );

  return (
    <PortalLayout
      title="Company Records"
      subtitle={subtitleText}
      actions={headerActions}
      currentPath="/companies/filtered"
      category="COMPANIES"
      section="Companies"
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
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '12px',
              alignItems: 'end'
            }}
          >
            <div>
              <label
                htmlFor="filtered-company-search"
                style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}
              >
                Search Companies
              </label>
              <input
                id="filtered-company-search"
                type="text"
                placeholder="Search by company, ID, recruiter, email…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="filtered-industry-select"
                style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}
              >
                Filter by Industry
              </label>
              <select
                id="filtered-industry-select"
                value={industryFilter}
                onChange={(e) => {
                  setIndustryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="">All Industries</option>
                {availableIndustries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {(search || industryFilter) && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSearch('');
                    setIndustryFilter('');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '9px 14px',
                    fontSize: '0.84rem',
                    color: '#64748b',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer'
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
              Showing <strong style={{ color: '#0f172a' }}>{filteredCompanies.length}</strong> of{' '}
              <strong>{companies.length}</strong> total company record(s)
              {(search || industryFilter) && (
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
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>COMPANY ID</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>COMPANY NAME</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>INDUSTRY</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>HR RECRUITER</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>DESIGNATION</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>EMAIL</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>MOBILE NUMBER</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>ESTABLISHED</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      Loading company records…
                    </td>
                  </tr>
                ) : paginatedCompanies.length > 0 ? (
                  paginatedCompanies.map((c) => (
                    <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {c.companyId || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>
                        {c.companyName}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        {c.industryType || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        {c.hrRecruiterName || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>
                        {c.designation || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        {c.email || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {c.mobileNumber || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569' }}>
                        {c.yearEstablished ?? '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ maxWidth: '380px', margin: '0 auto' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🏢</div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#1e293b' }}>
                          No Matching Company Records
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.84rem' }}>
                          Try adjusting your search criteria or clear your active industry filter.
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
