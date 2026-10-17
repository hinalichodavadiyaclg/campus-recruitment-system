import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import {
  BriefcaseIcon,
  SearchIcon,
  FilterIcon,
  MapPinIcon,
  CalendarIcon,
  ClockIcon,
  BuildingIcon,
  PlusIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ShieldIcon,
  EditIcon,
  ChevronRightIcon
} from '../../components/common/Icons.jsx';
import {
  formatSalary,
  formatRelativeTime,
  formatDate,
  getJobTypeLabel,
  getWorkModeLabel
} from '../../utils/job-helpers.js';

import { JobDetailsModal } from './JobDetailsModal.jsx';
import { JobFormModal } from './JobFormModal.jsx';
import { JobSuspendModal } from './JobSuspendModal.jsx';
import { JobReopenModal } from './JobReopenModal.jsx';
import { JobApplyModal } from './JobApplyModal.jsx';
import './JobPostings.css';

export function JobPostingsPage() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  const isStudent = user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT';
  const isCompany = user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY';
  const isPlacementAdmin =
    role?.id === 'ROLE_PLACEMENT_HEAD' ||
    role?.id === 'ROLE_SUPER_ADMIN' ||
    user?.roleId === 'ROLE_PLACEMENT_HEAD' ||
    user?.roleId === 'ROLE_SUPER_ADMIN';

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [selectedJobTypes, setSelectedJobTypes] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'deadline' | 'vacancies'
  const [minSalary, setMinSalary] = useState('');

  // Pagination State
  const [page, setPage] = useState(1);
  const limit = 9; // 3x3 grid

  // Data State
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 9, total: 0, totalPages: 1 });
  const [studentApplications, setStudentApplications] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null);
  const [selectedJobForForm, setSelectedJobForForm] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedJobForSuspend, setSelectedJobForSuspend] = useState(null);
  const [selectedJobForReopen, setSelectedJobForReopen] = useState(null);
  const [selectedJobForApply, setSelectedJobForApply] = useState(null);

  // Load Department and Course Lookups once
  useEffect(() => {
    let mounted = true;
    async function loadLookups() {
      try {
        const [deptRes, courseRes] = await Promise.all([
          departmentService.listDepartments({ limit: 100 }),
          courseService.listCourses({ limit: 100 })
        ]);
        if (mounted) {
          setDepartments(deptRes?.departments || deptRes?.items || deptRes || []);
          setCourses(courseRes?.courses || courseRes?.items || courseRes || []);
        }
      } catch (err) {
        console.error('Failed to load filter lookups:', err);
      }
    }
    loadLookups();
    return () => {
      mounted = false;
    };
  }, []);

  // If student, load student applications to cross-reference applied status
  const loadStudentApplications = useCallback(async () => {
    if (!isStudent) return;
    try {
      const data = await applicationService.listApplications({ limit: 100 });
      setStudentApplications(data?.items || []);
    } catch (_err) {
      // Ignore background error
    }
  }, [isStudent]);

  useEffect(() => {
    loadStudentApplications();
  }, [loadStudentApplications]);

  // Main Jobs Fetch
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        search: appliedSearch || undefined,
        departmentId: selectedDept || undefined,
        courseId: selectedCourse || undefined,
        workMode: selectedWorkMode || undefined,
        status: selectedStatus || undefined
      };

      if (selectedJobTypes.length === 1) {
        params.jobType = selectedJobTypes[0];
      }

      if (isStudent && eligibleOnly) {
        params.eligibleOnly = true;
      }

      const res = await jobService.listJobs(params);
      let loadedJobs = res?.jobs || [];

      // Client-side multi-jobType filter if more than 1 selected
      if (selectedJobTypes.length > 1) {
        loadedJobs = loadedJobs.filter((j) => selectedJobTypes.includes(j.jobType));
      }

      // Client-side min salary filter if provided
      if (minSalary && Number(minSalary) > 0) {
        const minVal = Number(minSalary);
        loadedJobs = loadedJobs.filter((j) => {
          const sal = j.compensation?.salaryMin || j.compensation?.salaryMax;
          return sal !== undefined && sal !== null && sal >= minVal;
        });
      }

      // Client-side sort
      loadedJobs.sort((a, b) => {
        if (sortBy === 'deadline') {
          return new Date(a.deadline) - new Date(b.deadline);
        }
        if (sortBy === 'vacancies') {
          return (b.vacancies || 0) - (a.vacancies || 0);
        }
        // default recent
        return new Date(b.createdAt || b.publishedAt) - new Date(a.createdAt || a.publishedAt);
      });

      setJobs(loadedJobs);
      setPagination(res?.pagination || { page: 1, limit, total: loadedJobs.length, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load job postings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    appliedSearch,
    selectedDept,
    selectedCourse,
    selectedWorkMode,
    selectedStatus,
    selectedJobTypes,
    eligibleOnly,
    sortBy,
    minSalary,
    isStudent
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Search submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedDept('');
    setSelectedCourse('');
    setSelectedWorkMode('');
    setSelectedJobTypes([]);
    setSelectedStatus('');
    setEligibleOnly(false);
    setSortBy('recent');
    setMinSalary('');
    setPage(1);
  };

  // Toggle job type filter checkbox
  const handleJobTypeToggle = (type) => {
    setSelectedJobTypes((prev) => {
      const exists = prev.includes(type);
      return exists ? prev.filter((t) => t !== type) : [...prev, type];
    });
    setPage(1);
  };

  // Cross-reference student application for a specific job
  const getStudentAppForJob = useCallback(
    (jobId, round) => {
      return studentApplications.find((app) => {
        const appJobId = app.jobId?._id || app.jobId;
        return (
          String(appJobId) === String(jobId) &&
          (!round || app.recruitmentRound === round)
        );
      });
    },
    [studentApplications]
  );

  // Company: Quick Status Change
  const handleStatusChange = async (job, newStatus) => {
    try {
      await jobService.updateJobStatus(job._id, {
        status: newStatus,
        note: `Status updated to ${newStatus} via portal dashboard`
      });
      toast(`Job status updated to ${newStatus}.`);
      fetchJobs();
      if (selectedJobForDetails?._id === job._id) {
        setSelectedJobForDetails(null);
      }
    } catch (err) {
      toast(`Error updating status: ${err.message}`);
    }
  };

  // Company / Admin: Save Job (Create or Edit)
  const handleSaveJob = async (payload, id) => {
    if (id) {
      await jobService.updateJob(id, payload);
      toast('Job posting updated successfully.');
    } else {
      await jobService.createJob(payload);
      toast('Job posting published successfully.');
    }
    fetchJobs();
  };

  // Placement Cell: Suspend / Restore
  const handleConfirmSuspend = async (payload) => {
    if (!selectedJobForSuspend) return;
    await jobService.suspendJob(selectedJobForSuspend._id, payload);
    toast(
      payload.isSuspended
        ? 'Job posting suspended by Placement Cell.'
        : 'Job posting restored successfully.'
    );
    fetchJobs();
    setSelectedJobForSuspend(null);
    if (selectedJobForDetails?._id === selectedJobForSuspend._id) {
      setSelectedJobForDetails(null);
    }
  };

  // Company / Admin: Reopen
  const handleConfirmReopen = async (payload) => {
    if (!selectedJobForReopen) return;
    await jobService.reopenJob(selectedJobForReopen._id, payload);
    toast('Job posting reopened for new recruitment round.');
    fetchJobs();
    setSelectedJobForReopen(null);
    if (selectedJobForDetails?._id === selectedJobForReopen._id) {
      setSelectedJobForDetails(null);
    }
  };

  // Student: Application Success
  const handleApplySuccess = (application) => {
    toast(`Application submitted successfully! Application ID: ${application.applicationId}`);
    loadStudentApplications();
    fetchJobs();
  };

  return (
    <PortalLayout
      title="Job Postings"
      subtitle="Explore approved campus recruitment drives, company openings, and eligibility details."
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
      {/* 1. Prominent Top Search & Filter Bar (Layout Reference) */}
      <form onSubmit={handleSearchSubmit} className="job-search-hero-bar">
        <div className="job-search-inputs-grid">
          {/* Keywords / Title Search */}
          <div className="job-search-input-wrap">
            <SearchIcon size={18} className="job-search-icon" />
            <input
              type="text"
              placeholder="Search a Job by Job title, Company, or keywords…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* Department / Classification */}
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept._id} value={dept._id}>
                {dept.name || dept.code}
              </option>
            ))}
          </select>

          {/* Work Mode */}
          <select
            value={selectedWorkMode}
            onChange={(e) => {
              setSelectedWorkMode(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Work Modes</option>
            <option value="ON_SITE">On-Site</option>
            <option value="HYBRID">Hybrid</option>
            <option value="REMOTE">Remote</option>
          </select>

          {/* Search Button */}
          <button type="submit" className="primary job-search-btn">
            Find Jobs
          </button>
        </div>
      </form>

      {/* 2. Two-Column Explorer Layout (Left Filter Sidebar + Right Card Grid) */}
      <div className="job-explorer-layout">
        {/* Left Filter Sidebar */}
        <aside className="job-filter-sidebar">
          <div className="job-filter-header">
            <h3>
              <FilterIcon size={17} color="var(--navy)" /> Job Filter
            </h3>
            <button
              type="button"
              className="job-filter-reset-btn"
              onClick={handleResetFilters}
            >
              Reset All
            </button>
          </div>

          {/* Student-only Eligible Filter Toggle */}
          {isStudent && (
            <div className="job-filter-section">
              <div className="eligible-toggle-box">
                <label htmlFor="eligible-only-checkbox">
                  Eligible Jobs Only
                </label>
                <input
                  id="eligible-only-checkbox"
                  type="checkbox"
                  checked={eligibleOnly}
                  onChange={(e) => {
                    setEligibleOnly(e.target.checked);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          )}

          {/* Sort By */}
          <div className="job-filter-section">
            <span className="job-filter-title">Sort By</span>
            <div className="job-filter-options">
              <label className="filter-radio-label">
                <input
                  type="radio"
                  name="sortBy"
                  value="recent"
                  checked={sortBy === 'recent'}
                  onChange={(e) => setSortBy(e.target.value)}
                />
                Most Recent
              </label>
              <label className="filter-radio-label">
                <input
                  type="radio"
                  name="sortBy"
                  value="deadline"
                  checked={sortBy === 'deadline'}
                  onChange={(e) => setSortBy(e.target.value)}
                />
                Deadline Soonest
              </label>
              <label className="filter-radio-label">
                <input
                  type="radio"
                  name="sortBy"
                  value="vacancies"
                  checked={sortBy === 'vacancies'}
                  onChange={(e) => setSortBy(e.target.value)}
                />
                Highest Vacancies
              </label>
            </div>
          </div>

          {/* Job Type Checkboxes */}
          <div className="job-filter-section">
            <span className="job-filter-title">Job Type</span>
            <div className="job-filter-options">
              <label className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedJobTypes.includes('FULL_TIME')}
                  onChange={() => handleJobTypeToggle('FULL_TIME')}
                />
                Full-Time
              </label>
              <label className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedJobTypes.includes('INTERNSHIP')}
                  onChange={() => handleJobTypeToggle('INTERNSHIP')}
                />
                Internship
              </label>
              <label className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedJobTypes.includes('PART_TIME')}
                  onChange={() => handleJobTypeToggle('PART_TIME')}
                />
                Part-Time
              </label>
              <label className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedJobTypes.includes('CONTRACT')}
                  onChange={() => handleJobTypeToggle('CONTRACT')}
                />
                Contract
              </label>
            </div>
          </div>

          {/* Status Filter (For Company & Placement Officers) */}
          {!isStudent && (
            <div className="job-filter-section">
              <span className="job-filter-title">Status</span>
              <div className="job-filter-options">
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid var(--line)' }}
                >
                  <option value="">All Statuses</option>
                  <option value="OPEN">Open (Active)</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PAUSED">Paused</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>
            </div>
          )}

          {/* Academic Course Filter */}
          <div className="job-filter-section">
            <span className="job-filter-title">Course / Degree</span>
            <div className="job-filter-options">
              <select
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setPage(1);
                }}
                style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid var(--line)' }}
              >
                <option value="">All Courses</option>
                {courses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.name || course.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Min Salary Filter */}
          <div className="job-filter-section">
            <span className="job-filter-title">Min Salary (INR / yr)</span>
            <input
              type="number"
              placeholder="e.g. 500000"
              value={minSalary}
              onChange={(e) => {
                setMinSalary(e.target.value);
                setPage(1);
              }}
              style={{ width: '100%', height: '38px', borderRadius: '7px', border: '1px solid var(--line)', padding: '0 10px', fontSize: '0.85rem' }}
            />
          </div>
        </aside>

        {/* Right Main Column: Job Card Grid */}
        <section className="job-cards-container">
          <div className="job-cards-header-info">
            <span className="job-count-text">
              Showing <b>{jobs.length}</b> of <b>{pagination.total || jobs.length}</b> open opportunities
              {appliedSearch && <span> matching "{appliedSearch}"</span>}
            </span>
            <button
              type="button"
              className="ghost"
              onClick={fetchJobs}
              style={{ padding: '6px 12px', fontSize: '0.8rem', height: '32px' }}
              title="Refresh job postings"
            >
              <RefreshCwIcon size={14} /> Refresh
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <Loading message="Loading job postings from verified recruiters…" />
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="notice error" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircleIcon size={20} color="var(--red)" />
                <span>{error}</span>
              </div>
              <button type="button" className="secondary" onClick={fetchJobs}>
                Retry
              </button>
            </div>
          )}

          {/* Clean Empty State (Zero Mock Seeding) */}
          {!loading && !error && jobs.length === 0 && (
            <div className="card empty" style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#f1f5f9',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
                color: 'var(--muted)'
              }}>
                <BriefcaseIcon size={30} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>
                No Job Postings Found
              </h3>
              <p style={{ margin: '0 auto 20px', maxWidth: '440px', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                {appliedSearch || selectedDept || selectedWorkMode || selectedJobTypes.length > 0 || eligibleOnly
                  ? 'There are no active campus recruitment postings matching your selected filters. Try broadening your criteria.'
                  : 'No campus recruitment drives have been posted yet. New opportunities will appear here as approved companies publish openings.'}
              </p>
              {(appliedSearch || selectedDept || selectedWorkMode || selectedJobTypes.length > 0 || eligibleOnly) && (
                <button type="button" className="secondary" onClick={handleResetFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          )}

          {/* Job Card Grid */}
          {!loading && !error && jobs.length > 0 && (
            <>
              <div className="job-grid">
                {jobs.map((job) => {
                  const companyName = job.companyId?.companyName || 'Company';
                  const initials = companyName.slice(0, 2).toUpperCase() || 'CP';
                  const appliedApp = isStudent ? getStudentAppForJob(job._id, job.recruitmentRound) : null;
                  const isSuspended = Boolean(job.isSuspended);
                  const isDeadlinePassed = new Date(job.deadline) < new Date();

                  // Student eligibility flag attached by backend
                  const isEligible = job.eligibility ? job.eligibility.isEligible : true;

                  return (
                    <article key={job._id} className="job-card">
                      <div>
                        {/* Top: Posted Time + Status Badge */}
                        <div className="job-card-top">
                          <span className="job-posted-time">
                            <ClockIcon size={13} /> {formatRelativeTime(job.createdAt || job.publishedAt)}
                          </span>
                          <div>
                            {isSuspended ? (
                              <span className="badge inactive">SUSPENDED</span>
                            ) : (
                              <span className={`badge ${job.status?.toLowerCase()}`}>{job.status}</span>
                            )}
                          </div>
                        </div>

                        {/* Company Logo + Job Title + Company Name */}
                        <div className="job-card-header">
                          <div className="company-logo-badge">{initials}</div>
                          <div className="job-title-info">
                            <h3 className="job-title" title={job.title}>
                              {job.title}
                            </h3>
                            <p className="job-company-name" title={companyName}>
                              {companyName}
                            </p>
                          </div>
                        </div>

                        {/* Metadata Pills */}
                        <div className="job-meta-pills">
                          <span className="job-meta-pill">
                            <BriefcaseIcon size={12} /> {getJobTypeLabel(job.jobType)}
                          </span>
                          <span className="job-meta-pill salary">
                            {formatSalary(job.compensation)}
                          </span>
                          <span className="job-meta-pill">
                            <MapPinIcon size={12} /> {getWorkModeLabel(job.workMode)}
                          </span>
                          <span className={`job-meta-pill ${isDeadlinePassed ? 'expired' : 'deadline'}`}>
                            <CalendarIcon size={12} /> {formatDate(job.deadline)}
                          </span>
                        </div>

                        {/* Description Preview */}
                        <p className="job-snippet">{job.description}</p>

                        {/* Requirements & Tags */}
                        <div className="job-tags-row">
                          <span className="job-tag">
                            {job.vacancies} {job.vacancies === 1 ? 'Vacancy' : 'Vacancies'}
                          </span>
                          {job.recruitmentRound > 1 && (
                            <span className="job-tag round">
                              Round {job.recruitmentRound}
                            </span>
                          )}
                          {job.eligibilityMode === 'ALL_STUDENTS' ? (
                            <span className="job-tag" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                              All Students
                            </span>
                          ) : (
                            <span className="job-tag">
                              Restricted Criteria
                            </span>
                          )}
                          {job.eligibilityCriteria?.requiresNaandiTraining !== false && (
                            <span className="job-tag" style={{ background: '#fef3c7', color: '#92400e' }}>
                              Naandi Training
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="job-card-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setSelectedJobForDetails(job)}
                        >
                          Details
                        </button>

                        {/* Student Apply Button */}
                        {isStudent && (
                          appliedApp ? (
                            <button
                              type="button"
                              className="secondary"
                              style={{ cursor: 'default', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}
                              onClick={() => setSelectedJobForDetails(job)}
                            >
                              ✓ Applied
                            </button>
                          ) : !isEligible ? (
                            <button
                              type="button"
                              className="ghost"
                              style={{ color: 'var(--red)', borderColor: '#fca5a5' }}
                              onClick={() => setSelectedJobForDetails(job)}
                              title="Click to view why you are not eligible"
                            >
                              Ineligible
                            </button>
                          ) : isSuspended || isDeadlinePassed || job.status !== 'OPEN' ? (
                            <button
                              type="button"
                              className="ghost"
                              disabled
                            >
                              Unavailable
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="primary"
                              onClick={() => setSelectedJobForApply(job)}
                            >
                              Apply
                            </button>
                          )
                        )}

                        {/* Company Manage Button */}
                        {isCompany && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => {
                              setSelectedJobForForm(job);
                              setIsFormModalOpen(true);
                            }}
                            disabled={isSuspended}
                          >
                            <EditIcon size={14} /> Edit
                          </button>
                        )}

                        {/* Placement Cell Admin Action */}
                        {isPlacementAdmin && (
                          <button
                            type="button"
                            className={isSuspended ? 'secondary' : 'ghost'}
                            style={!isSuspended ? { color: 'var(--red)' } : {}}
                            onClick={() => setSelectedJobForSuspend(job)}
                          >
                            <ShieldIcon size={14} /> {isSuspended ? 'Restore' : 'Suspend'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Pagination Bar */}
              {pagination.totalPages > 1 && (
                <div className="job-pagination-bar">
                  <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                    Page {pagination.page} of {pagination.totalPages}
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
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
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
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Modals */}
      {selectedJobForDetails && (
        <JobDetailsModal
          isOpen={Boolean(selectedJobForDetails)}
          onClose={() => setSelectedJobForDetails(null)}
          job={selectedJobForDetails}
          user={user}
          role={role}
          has={has}
          appliedApp={isStudent ? getStudentAppForJob(selectedJobForDetails._id, selectedJobForDetails.recruitmentRound) : null}
          onApplyClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForApply(j);
          }}
          onEditClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForForm(j);
            setIsFormModalOpen(true);
          }}
          onStatusClick={(j, st) => handleStatusChange(j, st)}
          onReopenClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForReopen(j);
          }}
          onSuspendClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForSuspend(j);
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

      {selectedJobForSuspend && (
        <JobSuspendModal
          isOpen={Boolean(selectedJobForSuspend)}
          onClose={() => setSelectedJobForSuspend(null)}
          job={selectedJobForSuspend}
          onConfirm={handleConfirmSuspend}
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

      {selectedJobForApply && (
        <JobApplyModal
          isOpen={Boolean(selectedJobForApply)}
          onClose={() => setSelectedJobForApply(null)}
          job={selectedJobForApply}
          onSuccess={handleApplySuccess}
        />
      )}
    </PortalLayout>
  );
}
