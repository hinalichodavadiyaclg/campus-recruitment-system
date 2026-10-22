import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { companyService } from '../../services/company.service.js';
import { courseService } from '../../services/course.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { JobSummaryCards } from './JobSummaryCards.jsx';
import { JobFilterBar } from './JobFilterBar.jsx';
import { JobTable } from './JobTable.jsx';
import { JobEmptyState } from './JobEmptyState.jsx';
import { JobDetailsModal } from './JobDetailsModal.jsx';
import {
  BriefcaseIcon,
  CheckCircleIcon,
  DocumentIcon,
  UsersIcon,
  AwardIcon,
  BuildingIcon,
  RefreshCwIcon
} from '../../components/common/Icons.jsx';
import './JobPostings.css';

export function CoordinatorJobPostingsView() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  const deptName = user?.departmentName || user?.department || 'Assigned Department';
  const deptCode = user?.departmentCode || '';

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedJobType, setSelectedJobType] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Lookups
  const [companies, setCompanies] = useState([]);
  const [courses, setCourses] = useState([]);

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
    relevantJobs: 0,
    openOpportunities: 0,
    applicationsInScope: 0,
    shortlistedInScope: 0
  });

  // Modal State
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null);

  // Load Companies & Courses Lookups
  useEffect(() => {
    let mounted = true;
    async function loadLookups() {
      try {
        const [compRes, courseRes] = await Promise.allSettled([
          companyService.listCompanies({ limit: 100 }),
          courseService.listCourses({ limit: 100 })
        ]);

        if (mounted) {
          if (compRes.status === 'fulfilled') {
            setCompanies(compRes.value?.companies || compRes.value?.items || compRes.value || []);
          }
          if (courseRes.status === 'fulfilled') {
            setCourses(courseRes.value?.courses || courseRes.value?.items || courseRes.value || []);
          }
        }
      } catch {
        // Non-fatal
      }
    }
    loadLookups();
    return () => {
      mounted = false;
    };
  }, []);

  // Load Coordinator Scoped Metrics
  const loadCoordinatorMetrics = useCallback(async () => {
    try {
      const [jobsRes, appsRes] = await Promise.allSettled([
        jobService.listJobs({ limit: 100 }),
        applicationService.listApplications({ limit: 100 })
      ]);

      let allJobs = [];
      if (jobsRes.status === 'fulfilled') {
        allJobs = jobsRes.value?.jobs || jobsRes.value?.items || [];
      }

      let allApps = [];
      let totalAppsInScope = 0;
      if (appsRes.status === 'fulfilled') {
        allApps = appsRes.value?.items || [];
        totalAppsInScope = appsRes.value?.total ?? appsRes.value?.pagination?.total ?? allApps.length;
      }

      const openCount = allJobs.filter((j) => j.status === 'OPEN').length;
      const shortlistedCount = allApps.filter((a) =>
        ['SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'SELECTED'].includes(a.status)
      ).length;

      setMetrics({
        relevantJobs: jobsRes.status === 'fulfilled' ? (jobsRes.value?.total ?? allJobs.length) : allJobs.length,
        openOpportunities: openCount,
        applicationsInScope: totalAppsInScope,
        shortlistedInScope: shortlistedCount
      });
    } catch {
      // Non-blocking
    }
  }, []);

  // Main Jobs Fetch (Backend enforces coordinator department scoping automatically)
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        search: appliedSearch || undefined,
        companyId: selectedCompany || undefined,
        courseId: selectedCourse || undefined,
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
      setError(err.message || 'Failed to load department recruitment records.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, selectedCompany, selectedCourse, selectedStatus, selectedJobType, selectedWorkMode, sortBy]);

  useEffect(() => {
    fetchJobs();
    loadCoordinatorMetrics();
  }, [fetchJobs, loadCoordinatorMetrics]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedCompany('');
    setSelectedCourse('');
    setSelectedStatus('');
    setSelectedJobType('');
    setSelectedWorkMode('');
    setSortBy('newest');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    appliedSearch || selectedCompany || selectedCourse || selectedStatus || selectedJobType || selectedWorkMode || (sortBy && sortBy !== 'newest')
  );

  const handleViewApplicants = (job) => {
    window.location.hash = `#/applications?jobId=${job._id}`;
  };

  // Metrics Cards Data
  const summaryCards = useMemo(
    () => [
      {
        id: 'relevantJobs',
        label: 'Jobs Relevant to Dept',
        value: metrics.relevantJobs,
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
        label: 'Open Opportunities',
        value: metrics.openOpportunities,
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
        id: 'appsInScope',
        label: 'Applications in Scope',
        value: metrics.applicationsInScope,
        icon: DocumentIcon,
        color: '#16a34a',
        bg: '#dcfce7',
        onClick: () => {
          window.location.hash = '#/applications';
        }
      },
      {
        id: 'shortlisted',
        label: 'Shortlisted / Active Candidates',
        value: metrics.shortlistedInScope,
        icon: AwardIcon,
        color: '#d97706',
        bg: '#fef3c7',
        onClick: () => {
          window.location.hash = '#/applications?status=SHORTLISTED';
        }
      }
    ],
    [metrics, selectedStatus]
  );

  return (
    <PortalLayout
      title="Department Job Postings"
      subtitle="Track recruitment opportunities and progress for your assigned department."
      category="Recruitment Module"
      section="Recruitment"
      currentPath="/job-postings"
    >
      {/* 1. Assigned Department Context Banner */}
      <div className="coordinator-dept-banner">
        <div className="dept-banner-icon">
          <BuildingIcon size={20} />
        </div>
        <div className="dept-banner-text">
          <div className="dept-banner-heading">
            <span>Assigned Department Scope:</span>
            <strong>{deptName}</strong>
            {deptCode && <span className="badge neutral" style={{ fontSize: '0.74rem' }}>{deptCode}</span>}
          </div>
          <p className="dept-banner-sub">
            Displaying recruitment opportunities open to all students or explicitly targeting your department.
          </p>
        </div>
      </div>

      {/* 2. Summary Metrics */}
      <JobSummaryCards cards={summaryCards} />

      {/* 3. Filters Bar */}
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
        selectedCourse={selectedCourse}
        onCourseChange={(val) => {
          setSelectedCourse(val);
          setPage(1);
        }}
        courses={courses}
        showCourseFilter={true}
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

      {/* 4. Main Data Table */}
      {loading ? (
        <JobEmptyState loading={true} />
      ) : error ? (
        <JobEmptyState error={error} onRetry={fetchJobs} />
      ) : jobs.length === 0 ? (
        <JobEmptyState
          isFiltered={hasActiveFilters}
          onResetFilters={handleResetFilters}
          title={hasActiveFilters ? 'No Matching Opportunities' : 'No Opportunities for Department Yet'}
          message={
            hasActiveFilters
              ? 'No recruitment postings match your filter parameters for this department. Try resetting filters.'
              : `There are currently no job postings targeting ${deptName} or campus-wide. Check back as new recruitment drives are posted.`
          }
        />
      ) : (
        <>
          <JobTable
            jobs={jobs}
            roleType="PLACEMENT_COORDINATOR"
            onViewDetails={(j) => setSelectedJobForDetails(j)}
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
        />
      )}
    </PortalLayout>
  );
}
