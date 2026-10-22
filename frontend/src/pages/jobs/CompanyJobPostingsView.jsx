import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { JobSummaryCards } from './JobSummaryCards.jsx';
import { JobFilterBar } from './JobFilterBar.jsx';
import { JobTable } from './JobTable.jsx';
import { JobEmptyState } from './JobEmptyState.jsx';
import { JobDetailsModal } from './JobDetailsModal.jsx';
import { JobFormModal } from './JobFormModal.jsx';
import { JobReopenModal } from './JobReopenModal.jsx';
import {
  BriefcaseIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentIcon,
  PlusIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  InfoIcon
} from '../../components/common/Icons.jsx';
import './JobPostings.css';

export function CompanyJobPostingsView() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedJobType, setSelectedJobType] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [sortBy, setSortBy] = useState('newest');

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
    draft: 0,
    paused: 0,
    closed: 0,
    totalApplications: 0
  });

  // Modal State
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null);
  const [selectedJobForForm, setSelectedJobForForm] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedJobForReopen, setSelectedJobForReopen] = useState(null);

  // Status Change Confirmation Modal State
  const [confirmStatusModal, setConfirmStatusModal] = useState({
    isOpen: false,
    job: null,
    targetStatus: '',
    title: '',
    message: '',
    danger: false,
    loading: false
  });

  // Help card state
  const [showLifecycleHelp, setShowLifecycleHelp] = useState(false);

  // Load Authoritative Metrics for Company
  const loadCompanyMetrics = useCallback(async () => {
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
      const draftCount = allJobs.filter((j) => j.status === 'DRAFT').length;
      const pausedCount = allJobs.filter((j) => j.status === 'PAUSED').length;
      const closedCount = allJobs.filter((j) => j.status === 'CLOSED').length;

      let appTotal = 0;
      if (appsRes.status === 'fulfilled') {
        appTotal = appsRes.value?.total ?? appsRes.value?.pagination?.total ?? 0;
      }

      setMetrics({
        total: allJobsRes.status === 'fulfilled' ? (allJobsRes.value?.total ?? allJobs.length) : allJobs.length,
        open: openCount,
        draft: draftCount,
        paused: pausedCount,
        closed: closedCount,
        totalApplications: appTotal
      });
    } catch {
      // Metrics are non-blocking
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
        status: selectedStatus || undefined,
        jobType: selectedJobType || undefined,
        workMode: selectedWorkMode || undefined
      };

      const res = await jobService.listJobs(params);
      let loadedJobs = res?.jobs || res?.items || [];

      // Client-side sorting
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
        // default newest
        return new Date(b.createdAt || b.publishedAt) - new Date(a.createdAt || a.publishedAt);
      });

      setJobs(loadedJobs);
      const totalCount = res?.total ?? res?.pagination?.total ?? loadedJobs.length;
      setTotalJobsCount(totalCount);
      setTotalPages(res?.totalPages || res?.pagination?.totalPages || Math.ceil(totalCount / limit) || 1);
    } catch (err) {
      setError(err.message || 'Failed to load recruitment postings.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, selectedStatus, selectedJobType, selectedWorkMode, sortBy]);

  useEffect(() => {
    fetchJobs();
    loadCompanyMetrics();
  }, [fetchJobs, loadCompanyMetrics]);

  // Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedStatus('');
    setSelectedJobType('');
    setSelectedWorkMode('');
    setSortBy('newest');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    appliedSearch || selectedStatus || selectedJobType || selectedWorkMode || (sortBy && sortBy !== 'newest')
  );

  // Status Change Prompt
  const handleRequestStatusChange = (job, targetStatus) => {
    const titles = {
      OPEN: job.status === 'DRAFT' ? 'Publish Job Posting?' : 'Resume Job Applications?',
      PAUSED: 'Pause Job Applications?',
      CLOSED: 'End / Close Job Recruitment?'
    };

    const messages = {
      OPEN:
        job.status === 'DRAFT'
          ? `Publishing "${job.title}" will make it immediately discoverable and open to eligible students.`
          : `Resuming "${job.title}" will reopen it to new student applications until ${new Date(job.deadline).toLocaleDateString()}.`,
      PAUSED: `Pausing "${job.title}" will temporarily prevent new student applications. Existing applications remain preserved.`,
      CLOSED: `Closing "${job.title}" will conclude recruitment for this round. To recruit again later, you can reopen it for a new round.`
    };

    setConfirmStatusModal({
      isOpen: true,
      job,
      targetStatus,
      title: titles[targetStatus] || 'Confirm Status Change',
      message: messages[targetStatus] || `Are you sure you want to change status to ${targetStatus}?`,
      danger: targetStatus === 'CLOSED',
      loading: false
    });
  };

  // Confirm Status Change
  const handleConfirmStatusChange = async () => {
    const { job, targetStatus } = confirmStatusModal;
    if (!job || !targetStatus) return;

    try {
      setConfirmStatusModal((prev) => ({ ...prev, loading: true }));
      await jobService.updateJobStatus(job._id, {
        status: targetStatus,
        note: `Status updated to ${targetStatus} by company account`
      });
      toast(`Job status updated to ${targetStatus}.`);
      setConfirmStatusModal({ isOpen: false, job: null, targetStatus: '', title: '', message: '', danger: false, loading: false });
      fetchJobs();
      loadCompanyMetrics();
      if (selectedJobForDetails?._id === job._id) {
        setSelectedJobForDetails(null);
      }
    } catch (err) {
      toast(`Failed to update status: ${err.message}`);
      setConfirmStatusModal((prev) => ({ ...prev, loading: false }));
    }
  };

  // Save Job (Create or Edit)
  const handleSaveJob = async (payload, id) => {
    if (id) {
      await jobService.updateJob(id, payload);
      toast('Job posting updated successfully.');
    } else {
      await jobService.createJob(payload);
      toast('Job posting saved successfully.');
    }
    fetchJobs();
    loadCompanyMetrics();
  };

  // Reopen Job
  const handleConfirmReopen = async (payload) => {
    if (!selectedJobForReopen) return;
    await jobService.reopenJob(selectedJobForReopen._id, payload);
    toast('Job posting reopened for new recruitment round.');
    setSelectedJobForReopen(null);
    fetchJobs();
    loadCompanyMetrics();
    if (selectedJobForDetails?._id === selectedJobForReopen._id) {
      setSelectedJobForDetails(null);
    }
  };

  // Navigate to Applicants
  const handleViewApplicants = (job) => {
    window.location.hash = `#/applications?jobId=${job._id}`;
  };

  // Metric Cards Data
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
        id: 'draft',
        label: 'Draft Jobs',
        value: metrics.draft,
        icon: ClockIcon,
        color: '#64748b',
        bg: '#f1f5f9',
        active: selectedStatus === 'DRAFT',
        onClick: () => {
          setSelectedStatus('DRAFT');
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
      title="My Job Postings"
      subtitle="Create and manage your recruitment opportunities."
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
      {/* 1. Summary Cards */}
      <JobSummaryCards cards={summaryCards} />

      {/* 2. Optional Contextual Help explaining Lifecycle States */}
      <div className="job-lifecycle-help-box">
        <button
          type="button"
          className="lifecycle-help-toggle"
          onClick={() => setShowLifecycleHelp((prev) => !prev)}
        >
          <InfoIcon size={15} />
          <span>Understanding Job Lifecycle States</span>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
            {showLifecycleHelp ? '▲ Hide' : '▼ Show'}
          </span>
        </button>

        {showLifecycleHelp && (
          <div className="lifecycle-help-content">
            <div className="lifecycle-state-guide">
              <div className="lifecycle-state-item">
                <span className="badge draft">DRAFT</span>
                <p>Saved privately. Only visible to your company. Eligible students cannot discover or apply to drafts.</p>
              </div>
              <div className="lifecycle-state-item">
                <span className="badge open">OPEN</span>
                <p>Actively published. Eligible students can discover the role, review criteria, and submit applications.</p>
              </div>
              <div className="lifecycle-state-item">
                <span className="badge paused">PAUSED</span>
                <p>Temporarily halted. Applications are paused; existing candidate records are preserved for review.</p>
              </div>
              <div className="lifecycle-state-item">
                <span className="badge closed">CLOSED</span>
                <p>Recruitment finished. You can reopen closed jobs at any time for a new round with updated deadlines.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Search and Multi-Parameter Filter Bar */}
      <JobFilterBar
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onSearchSubmit={handleSearchSubmit}
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

      {/* 4. Main Job Table or Empty / Loading State */}
      {loading ? (
        <JobEmptyState loading={true} />
      ) : error ? (
        <JobEmptyState error={error} onRetry={fetchJobs} />
      ) : jobs.length === 0 ? (
        <JobEmptyState
          isFiltered={hasActiveFilters}
          onResetFilters={handleResetFilters}
          onCreateJob={() => {
            setSelectedJobForForm(null);
            setIsFormModalOpen(true);
          }}
          canCreate={has('JOB_CREATE')}
          title={hasActiveFilters ? 'No Matching Job Postings' : 'No Job Postings Created Yet'}
          message={
            hasActiveFilters
              ? 'No recruitment postings match your current filter parameters. Try clearing filters or searching for other keywords.'
              : 'You have not created any campus recruitment postings yet. Click "Post New Job" to publish opportunities to students.'
          }
        />
      ) : (
        <>
          <JobTable
            jobs={jobs}
            roleType="COMPANY"
            onViewDetails={(j) => setSelectedJobForDetails(j)}
            onEdit={(j) => {
              setSelectedJobForForm(j);
              setIsFormModalOpen(true);
            }}
            onStatusChange={(j, target) => handleRequestStatusChange(j, target)}
            onReopen={(j) => setSelectedJobForReopen(j)}
            onViewApplicants={handleViewApplicants}
          />

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="job-pagination-bar" style={{ marginTop: '16px' }}>
              <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                Showing Page {page} of {totalPages} ({totalJobsCount} total opportunities)
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
          onEditClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForForm(j);
            setIsFormModalOpen(true);
          }}
          onStatusClick={(j, st) => {
            setSelectedJobForDetails(null);
            handleRequestStatusChange(j, st);
          }}
          onReopenClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForReopen(j);
          }}
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

      {selectedJobForReopen && (
        <JobReopenModal
          isOpen={Boolean(selectedJobForReopen)}
          onClose={() => setSelectedJobForReopen(null)}
          job={selectedJobForReopen}
          onConfirm={handleConfirmReopen}
        />
      )}

      {confirmStatusModal.isOpen && (
        <ConfirmModal
          isOpen={confirmStatusModal.isOpen}
          onClose={() => setConfirmStatusModal((prev) => ({ ...prev, isOpen: false }))}
          title={confirmStatusModal.title}
          message={confirmStatusModal.message}
          danger={confirmStatusModal.danger}
          loading={confirmStatusModal.loading}
          confirmLabel={
            confirmStatusModal.targetStatus === 'OPEN'
              ? 'Confirm & Publish'
              : confirmStatusModal.targetStatus === 'PAUSED'
              ? 'Pause Applications'
              : 'Confirm & Close'
          }
          onConfirm={handleConfirmStatusChange}
        />
      )}
    </PortalLayout>
  );
}
