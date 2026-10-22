import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { companyService } from '../../services/company.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { JobSummaryCards } from './JobSummaryCards.jsx';
import { JobFilterBar } from './JobFilterBar.jsx';
import { JobTable } from './JobTable.jsx';
import { JobEmptyState } from './JobEmptyState.jsx';
import { JobDetailsModal } from './JobDetailsModal.jsx';
import { JobSuspendModal } from './JobSuspendModal.jsx';
import { JobFormModal } from './JobFormModal.jsx';
import {
  BriefcaseIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  PlusIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  ShieldIcon
} from '../../components/common/Icons.jsx';
import './JobPostings.css';

export function PlacementHeadJobPostingsView() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedJobType, setSelectedJobType] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Lookups
  const [companies, setCompanies] = useState([]);

  // Pagination State
  const [page, setPage] = useState(1);
  const limit = 10;

  // Data State
  const [jobs, setJobs] = useState([]);
  const [totalJobsCount, setTotalJobsCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Authoritative Summary Metrics
  const [metrics, setMetrics] = useState({
    total: 0,
    open: 0,
    paused: 0,
    closed: 0,
    totalApplications: 0
  });

  // Modal State
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null);
  const [selectedJobForSuspend, setSelectedJobForSuspend] = useState(null);
  const [selectedJobForForm, setSelectedJobForForm] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  // Load Companies Lookup
  useEffect(() => {
    let mounted = true;
    async function loadCompanies() {
      try {
        const res = await companyService.listCompanies({ limit: 100 });
        if (mounted) {
          setCompanies(res?.companies || res?.items || res || []);
        }
      } catch {
        // Non-fatal
      }
    }
    loadCompanies();
    return () => {
      mounted = false;
    };
  }, []);

  // Load Authoritative Metrics
  const loadHeadMetrics = useCallback(async () => {
    try {
      const [allJobsRes, appsRes] = await Promise.allSettled([
        jobService.listJobs({ limit: 100 }),
        applicationService.listApplications({ limit: 1 })
      ]);

      let allJobs = [];
      if (allJobsRes.status === 'fulfilled') {
        allJobs = allJobsRes.value?.jobs || allJobsRes.value?.items || [];
      }

      const openCount = allJobs.filter((j) => j.status === 'OPEN').length;
      const pausedCount = allJobs.filter((j) => j.status === 'PAUSED').length;
      const closedCount = allJobs.filter((j) => j.status === 'CLOSED').length;

      let appTotal = 0;
      if (appsRes.status === 'fulfilled') {
        appTotal = appsRes.value?.total ?? appsRes.value?.pagination?.total ?? 0;
      }

      setMetrics({
        total: allJobsRes.status === 'fulfilled' ? (allJobsRes.value?.total ?? allJobs.length) : allJobs.length,
        open: openCount,
        paused: pausedCount,
        closed: closedCount,
        totalApplications: appTotal
      });
    } catch {
      // Metrics non-blocking
    }
  }, []);

  // Main Jobs Fetch
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        search: appliedSearch || undefined,
        companyId: selectedCompany || undefined,
        status: selectedStatus || undefined,
        jobType: selectedJobType || undefined,
        workMode: selectedWorkMode || undefined
      };

      const res = await jobService.listJobs(params);
      let loadedJobs = res?.jobs || res?.items || [];

      // Sort
      loadedJobs.sort((a, b) => {
        if (sortBy === 'oldest') {
          return new Date(a.createdAt || a.publishedAt) - new Date(b.createdAt || b.publishedAt);
        }
        if (sortBy === 'deadline') {
          return new Date(a.deadline) - new Date(b.deadline);
        }
        if (sortBy === 'vacancies') {
          return (b.vacancies || 0) - (a.vacancies || 0);
        }
        return new Date(b.createdAt || b.publishedAt) - new Date(a.createdAt || a.publishedAt);
      });

      setJobs(loadedJobs);
      const totalCount = res?.total ?? res?.pagination?.total ?? loadedJobs.length;
      setTotalJobsCount(totalCount);
      setTotalPages(res?.totalPages || res?.pagination?.totalPages || Math.ceil(totalCount / limit) || 1);
    } catch (err) {
      setError(err.message || 'Failed to load institution job postings.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, selectedCompany, selectedStatus, selectedJobType, selectedWorkMode, sortBy]);

  useEffect(() => {
    fetchJobs();
    loadHeadMetrics();
  }, [fetchJobs, loadHeadMetrics]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedCompany('');
    setSelectedStatus('');
    setSelectedJobType('');
    setSelectedWorkMode('');
    setSortBy('newest');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    appliedSearch || selectedCompany || selectedStatus || selectedJobType || selectedWorkMode || (sortBy && sortBy !== 'newest')
  );

  // Suspension / Restoration
  const handleConfirmSuspend = async (payload) => {
    if (!selectedJobForSuspend) return;
    try {
      await jobService.suspendJob(selectedJobForSuspend._id, payload);
      toast(
        payload.isSuspended
          ? 'Job posting suspended successfully.'
          : 'Job posting restored to active recruitment.'
      );
      setSelectedJobForSuspend(null);
      fetchJobs();
      loadHeadMetrics();
      if (selectedJobForDetails?._id === selectedJobForSuspend._id) {
        setSelectedJobForDetails(null);
      }
    } catch (err) {
      toast(`Action failed: ${err.message}`);
    }
  };

  const handleSaveJob = async (payload, id) => {
    if (id) {
      await jobService.updateJob(id, payload);
      toast('Job posting updated successfully.');
    } else {
      await jobService.createJob(payload);
      toast('Job posting created successfully.');
    }
    fetchJobs();
    loadHeadMetrics();
  };

  const handleViewApplicants = (job) => {
    window.location.hash = `#/applications?jobId=${job._id}`;
  };

  // Metrics Cards Data
  const summaryCards = useMemo(
    () => [
      {
        id: 'total',
        label: 'Total Jobs',
        value: metrics.total,
        icon: BriefcaseIcon,
        color: '#0d2c5e',
        bg: '#e8f0fe',
        active: !selectedStatus,
        onClick: () => {
          setSelectedStatus('');
          setPage(1);
        }
      },
      {
        id: 'open',
        label: 'Open Jobs',
        value: metrics.open,
        icon: CheckCircleIcon,
        color: '#0284c7',
        bg: '#e0f2fe',
        active: selectedStatus === 'OPEN',
        onClick: () => {
          setSelectedStatus('OPEN');
          setPage(1);
        }
      },
      {
        id: 'paused',
        label: 'Paused Jobs',
        value: metrics.paused,
        icon: AlertCircleIcon,
        color: '#d97706',
        bg: '#fef3c7',
        active: selectedStatus === 'PAUSED',
        onClick: () => {
          setSelectedStatus('PAUSED');
          setPage(1);
        }
      },
      {
        id: 'closed',
        label: 'Closed Jobs',
        value: metrics.closed,
        icon: RefreshCwIcon,
        color: '#475569',
        bg: '#f8fafc',
        active: selectedStatus === 'CLOSED',
        onClick: () => {
          setSelectedStatus('CLOSED');
          setPage(1);
        }
      },
      {
        id: 'applications',
        label: 'Total Applications',
        value: metrics.totalApplications,
        icon: DocumentIcon,
        color: '#16a34a',
        bg: '#dcfce7',
        onClick: () => {
          window.location.hash = '#/applications';
        }
      }
    ],
    [metrics, selectedStatus]
  );

  return (
    <PortalLayout
      title="All Job Postings"
      subtitle="Monitor recruitment opportunities across participating companies."
      category="Recruitment Module"
      section="Recruitment"
      currentPath="/job-postings"
      actions={
        has('JOB_CREATE') && (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setSelectedJobForForm(null);
              setIsFormModalOpen(true);
            }}
          >
            <PlusIcon size={16} /> Post New Job
          </button>
        )
      }
    >
      {/* 1. Summary Metrics */}
      <JobSummaryCards cards={summaryCards} />

      {/* 2. Filters Bar */}
      <JobFilterBar
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
        selectedCompany={selectedCompany}
        onCompanyChange={(val) => {
          setSelectedCompany(val);
          setPage(1);
        }}
        companies={companies}
        showCompanyFilter={true}
        selectedStatus={selectedStatus}
        onStatusChange={(val) => {
          setSelectedStatus(val);
          setPage(1);
        }}
        selectedJobType={selectedJobType}
        onJobTypeChange={(val) => {
          setSelectedJobType(val);
          setPage(1);
        }}
        selectedWorkMode={selectedWorkMode}
        onWorkModeChange={(val) => {
          setSelectedWorkMode(val);
          setPage(1);
        }}
        sortBy={sortBy}
        onSortChange={(val) => {
          setSortBy(val);
          setPage(1);
        }}
        onReset={handleResetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* 3. Main Data Table */}
      {loading ? (
        <JobEmptyState loading={true} />
      ) : error ? (
        <JobEmptyState error={error} onRetry={fetchJobs} />
      ) : jobs.length === 0 ? (
        <JobEmptyState
          isFiltered={hasActiveFilters}
          onResetFilters={handleResetFilters}
          title={hasActiveFilters ? 'No Matching Job Postings' : 'No Job Postings Found'}
          message={
            hasActiveFilters
              ? 'No recruitment postings match your filter parameters. Try clearing filters or searching for another company or title.'
              : 'No company recruitment drives have been registered in the system yet.'
          }
        />
      ) : (
        <>
          <JobTable
            jobs={jobs}
            roleType="PLACEMENT_HEAD"
            onViewDetails={(j) => setSelectedJobForDetails(j)}
            onSuspend={(j) => setSelectedJobForSuspend(j)}
            onViewApplicants={handleViewApplicants}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="job-pagination-bar" style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                Showing Page {page} of {totalPages} ({totalJobsCount} total postings)
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn ${p === page ? 'active' : ''}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {selectedJobForDetails && (
        <JobDetailsModal
          isOpen={Boolean(selectedJobForDetails)}
          onClose={() => setSelectedJobForDetails(null)}
          job={selectedJobForDetails}
          user={user}
          role={role}
          has={has}
          onSuspendClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForSuspend(j);
          }}
        />
      )}

      {selectedJobForSuspend && (
        <JobSuspendModal
          isOpen={Boolean(selectedJobForSuspend)}
          onClose={() => setSelectedJobForSuspend(null)}
          job={selectedJobForSuspend}
          onConfirm={handleConfirmSuspend}
        />
      )}

      {isFormModalOpen && (
        <JobFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setSelectedJobForForm(null);
          }}
          job={selectedJobForForm}
          user={user}
          role={role}
          onSave={handleSaveJob}
        />
      )}
    </PortalLayout>
  );
}
