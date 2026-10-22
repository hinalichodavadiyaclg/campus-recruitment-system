import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { JobEmptyState } from './JobEmptyState.jsx';
import { JobDetailsModal } from './JobDetailsModal.jsx';
import { JobApplyModal } from './JobApplyModal.jsx';
import {
  BriefcaseIcon,
  SearchIcon,
  FilterIcon,
  MapPinIcon,
  CalendarIcon,
  ClockIcon,
  BuildingIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AwardIcon,
  GraduationCapIcon
} from '../../components/common/Icons.jsx';
import {
  formatSalary,
  formatRelativeTime,
  formatDate,
  getJobTypeLabel,
  getWorkModeLabel
} from '../../utils/job-helpers.js';
import './JobPostings.css';

// Curated pastel palettes for company avatars (matching dashboard Quick Actions aesthetic)
// Zero red/pink hues — red indicates danger/rejection/closed
const COMPANY_PALETTES = [
  { bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' }, // Sky / Blue (exact Add Student)
  { bg: '#ccfbf1', color: '#0f766e', border: '#99f6e4' }, // Soft Teal (VVWU portal theme)
  { bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' }, // Soft Indigo / Royal
  { bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' }, // Mint / Emerald (exact Add Company)
  { bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' }, // Violet / Purple (exact Import Students)
  { bg: '#fef3c7', color: '#d97706', border: '#fde68a' }  // Amber / Warm Gold (exact Import Companies)
];

function getCompanyPalette(name = '') {
  const clean = String(name || '').trim().toLowerCase();
  if (!clean) return COMPANY_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COMPANY_PALETTES.length;
  return COMPANY_PALETTES[index];
}

export function StudentJobOpportunitiesView() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [selectedJobTypes, setSelectedJobTypes] = useState([]);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'deadline' | 'vacancies'
  const [minSalary, setMinSalary] = useState('');

  // Mobile sidebar toggle
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const limit = 9;

  // Data State
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 9, total: 0, totalPages: 1 });
  const [studentApplications, setStudentApplications] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null);
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
      } catch {
        // Non-fatal
      }
    }
    loadLookups();
    return () => {
      mounted = false;
    };
  }, []);

  // Load student applications to identify applied status
  const loadStudentApplications = useCallback(async () => {
    try {
      const data = await applicationService.listApplications({ limit: 100 });
      setStudentApplications(data?.items || []);
    } catch {
      // Background non-fatal
    }
  }, []);

  useEffect(() => {
    loadStudentApplications();
  }, [loadStudentApplications]);

  // Main Jobs Fetch for Students (Backend automatically limits to OPEN, non-suspended, non-expired)
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
        workMode: selectedWorkMode || undefined
      };

      if (selectedJobTypes.length === 1) {
        params.jobType = selectedJobTypes[0];
      }

      if (eligibleOnly) {
        params.eligibleOnly = true;
      }

      const res = await jobService.listJobs(params);
      let loadedJobs = res?.jobs || res?.items || [];

      // Multi-type filtering if multiple checked
      if (selectedJobTypes.length > 1) {
        loadedJobs = loadedJobs.filter((j) => selectedJobTypes.includes(j.jobType));
      }

      // Min salary filter
      if (minSalary && Number(minSalary) > 0) {
        const minVal = Number(minSalary);
        loadedJobs = loadedJobs.filter((j) => {
          const sal = j.compensation?.salaryMin || j.compensation?.salaryMax;
          return sal !== undefined && sal !== null && sal >= minVal;
        });
      }

      // Sorting
      loadedJobs.sort((a, b) => {
        if (sortBy === 'deadline') {
          return new Date(a.deadline) - new Date(b.deadline);
        }
        if (sortBy === 'vacancies') {
          return (b.vacancies || 0) - (a.vacancies || 0);
        }
        return new Date(b.createdAt || b.publishedAt) - new Date(a.createdAt || a.publishedAt);
      });

      setJobs(loadedJobs);
      setPagination({
        page: res?.page || res?.pagination?.page || page,
        limit: res?.limit || res?.pagination?.limit || limit,
        total: res?.total ?? res?.pagination?.total ?? loadedJobs.length,
        totalPages:
          res?.totalPages ||
          res?.pagination?.totalPages ||
          Math.ceil((res?.total ?? loadedJobs.length) / limit) ||
          1
      });
    } catch (err) {
      setError(err.message || 'Failed to load recruitment opportunities. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, appliedSearch, selectedDept, selectedCourse, selectedWorkMode, selectedJobTypes, eligibleOnly, sortBy, minSalary]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedDept('');
    setSelectedCourse('');
    setSelectedWorkMode('');
    setSelectedJobTypes([]);
    setEligibleOnly(false);
    setSortBy('recent');
    setMinSalary('');
    setPage(1);
  };

  const handleJobTypeToggle = (type) => {
    setSelectedJobTypes((prev) => {
      const exists = prev.includes(type);
      return exists ? prev.filter((t) => t !== type) : [...prev, type];
    });
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    appliedSearch || selectedDept || selectedCourse || selectedWorkMode || selectedJobTypes.length > 0 || eligibleOnly || minSalary || sortBy !== 'recent'
  );

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

  const handleApplySuccess = (application) => {
    toast(`Application submitted successfully! Application ID: ${application.applicationId}`);
    loadStudentApplications();
    fetchJobs();
  };

  return (
    <PortalLayout
      title="Job Opportunities"
      subtitle="Discover recruitment opportunities relevant to your career goals."
      category="Recruitment Module"
      section="Recruitment"
      currentPath="/jobs"
    >
      {/* 1. Hero Search Bar */}
      <form onSubmit={handleSearchSubmit} className="job-search-hero-bar">
        <div className="job-search-inputs-grid">
          <div className="job-search-input-wrap">
            <SearchIcon size={18} className="job-search-icon" />
            <input
              type="text"
              placeholder="Search by Job title, Company, or keywords…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

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

          <button type="submit" className="primary job-search-btn">
            Find Jobs
          </button>
        </div>
      </form>

      {/* Mobile Filter Toggle */}
      <div className="mobile-filter-bar">
        <button
          type="button"
          className="secondary"
          onClick={() => setMobileFilterOpen((prev) => !prev)}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
        >
          <FilterIcon size={16} /> {mobileFilterOpen ? 'Hide Filters' : 'Show Filters'}
        </button>
      </div>

      {/* 2. Two-Column Discovery Layout */}
      <div className="job-explorer-layout">
        {/* Left Filter Sidebar */}
        <aside className={`job-filter-sidebar ${mobileFilterOpen ? 'mobile-open' : ''}`}>
          <div className="job-filter-header">
            <h3>
              <FilterIcon size={17} color="var(--navy)" /> Job Filter
            </h3>
            {hasActiveFilters && (
              <button
                type="button"
                className="job-filter-reset-btn"
                onClick={handleResetFilters}
              >
                Reset All
              </button>
            )}
          </div>

          {/* Eligible Only Toggle */}
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
              {['FULL_TIME', 'INTERNSHIP', 'PART_TIME', 'CONTRACT'].map((type) => (
                <label key={type} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedJobTypes.includes(type)}
                    onChange={() => handleJobTypeToggle(type)}
                  />
                  {getJobTypeLabel(type)}
                </label>
              ))}
            </div>
          </div>

          {/* Course / Degree Filter */}
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
              placeholder="e.g. 400000"
              value={minSalary}
              onChange={(e) => {
                setMinSalary(e.target.value);
                setPage(1);
              }}
              style={{
                width: '100%',
                height: '38px',
                borderRadius: '7px',
                border: '1px solid var(--line)',
                padding: '0 10px',
                fontSize: '0.85rem'
              }}
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

          {/* Loading, Error, Empty, and Grid */}
          {loading ? (
            <JobEmptyState loading={true} />
          ) : error ? (
            <JobEmptyState error={error} onRetry={fetchJobs} />
          ) : jobs.length === 0 ? (
            <JobEmptyState
              isFiltered={hasActiveFilters}
              onResetFilters={handleResetFilters}
              title={hasActiveFilters ? 'No Matching Opportunities' : 'No Open Job Opportunities'}
              message={
                hasActiveFilters
                  ? 'There are no active recruitment postings matching your selected filters. Try broadening your criteria.'
                  : 'No campus recruitment drives are currently accepting applications. New opportunities will appear here as approved companies publish openings.'
              }
            />
          ) : (
            <>
              <div className="job-grid">
                {jobs.map((job) => {
                  const companyName = job.companyId?.companyName || 'Company';
                  const palette = getCompanyPalette(companyName);
                  const appliedApp = getStudentAppForJob(job._id, job.recruitmentRound);
                  const isSuspended = Boolean(job.isSuspended);
                  const isDeadlinePassed = new Date(job.deadline) < new Date();
                  const daysUntilDeadline = Math.ceil((new Date(job.deadline) - new Date()) / (1000 * 60 * 60 * 24));
                  const isClosingSoon = !isDeadlinePassed && daysUntilDeadline <= 3 && daysUntilDeadline >= 0;
                  const isEligible = job.eligibility ? job.eligibility.isEligible : true;

                  // Vacancy text
                  const vacCount = Number(job.vacancies) || 1;
                  const vacancyText = `${vacCount} ${vacCount === 1 ? 'vacancy' : 'vacancies'}`;

                  // Work mode & Location text
                  let locationText = '';
                  if (job.workMode === 'REMOTE') {
                    locationText = 'Remote';
                  } else if (job.location?.trim()) {
                    locationText = job.location.trim();
                  } else if (job.workMode === 'HYBRID') {
                    locationText = 'Hybrid (Campus / Remote)';
                  } else {
                    locationText = 'Campus / On-Site';
                  }

                  // Salary formatted
                  const hasSalary = Boolean(
                    job.compensation &&
                    ((job.compensation.salaryMin !== undefined && job.compensation.salaryMin !== null && Number(job.compensation.salaryMin) > 0) ||
                      (job.compensation.salaryMax !== undefined && job.compensation.salaryMax !== null && Number(job.compensation.salaryMax) > 0))
                  );
                  const salaryText = formatSalary(job.compensation);

                  // Required skills
                  const reqSkills = Array.isArray(job.eligibilityCriteria?.requiredSkills)
                    ? job.eligibilityCriteria.requiredSkills.filter(Boolean)
                    : [];
                  const visibleSkills = reqSkills.slice(0, 3);
                  const extraSkillsCount = reqSkills.length > 3 ? reqSkills.length - 3 : 0;

                  // Concise eligibility summary
                  let eligibilitySummaryText = '';
                  let eligibilityStatusClass = 'neutral';
                  let eligibilityIcon = <GraduationCapIcon size={13} />;

                  if (appliedApp) {
                    eligibilityStatusClass = 'applied';
                    eligibilityIcon = <CheckCircleIcon size={13} />;
                    eligibilitySummaryText = 'Application submitted';
                  } else if (job.eligibility && job.eligibility.isEligible === false) {
                    eligibilityStatusClass = 'ineligible';
                    eligibilityIcon = <AlertCircleIcon size={13} />;
                    const checks = job.eligibility.checks || {};
                    if (checks.naandiTraining === false || checks.naandiTraining?.passed === false) {
                      eligibilitySummaryText = 'Naandi Training completion required';
                    } else if (checks.cgpa === false || checks.cgpa?.passed === false) {
                      eligibilitySummaryText = `CGPA cutoff not met (Min ${job.eligibilityCriteria?.minCgpa || 0})`;
                    } else if (checks.department === false || checks.department?.passed === false) {
                      eligibilitySummaryText = 'Department not eligible';
                    } else if (checks.course === false || checks.course?.passed === false) {
                      eligibilitySummaryText = 'Course not eligible';
                    } else if (checks.passingYear === false || checks.passingYear?.passed === false) {
                      eligibilitySummaryText = 'Graduating batch not eligible';
                    } else if (checks.backlogs === false || checks.backlogs?.passed === false) {
                      eligibilitySummaryText = 'Exceeds maximum active backlogs';
                    } else {
                      eligibilitySummaryText = job.eligibility.ineligibleReason || 'Criteria requirements not met';
                    }
                  } else if (job.eligibilityMode === 'ALL_STUDENTS') {
                    eligibilityStatusClass = 'eligible';
                    eligibilityIcon = <CheckCircleIcon size={13} />;
                    const minCgpa = Number(job.eligibilityCriteria?.minCgpa || 0);
                    eligibilitySummaryText = minCgpa > 0
                      ? `Open to All Students • Min CGPA ${minCgpa}`
                      : 'Open to All Students • Any Passing Year';
                  } else {
                    eligibilityStatusClass = 'eligible';
                    eligibilityIcon = <GraduationCapIcon size={13} />;
                    const minCgpa = Number(job.eligibilityCriteria?.minCgpa || 0);
                    eligibilitySummaryText = minCgpa > 0
                      ? `Restricted criteria • Min CGPA ${minCgpa}`
                      : 'Restricted to eligible departments & batches';
                  }

                  return (
                    <article key={job._id} className="job-card">
                      <div className="job-card-main">
                        {/* Compact Unified Header: Pastel Circle Avatar + (Title & Status) + (Company & Posted Time) */}
                        <div className="job-card-header">
                          <div
                            className="job-company-avatar"
                            style={{
                              backgroundColor: palette.bg,
                              borderColor: palette.border
                            }}
                            aria-hidden="true"
                          >
                            {job.companyId?.logoUrl ? (
                              <img
                                src={job.companyId.logoUrl}
                                alt={companyName}
                                className="job-logo-img"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const next = e.currentTarget.nextElementSibling;
                                  if (next) next.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className="job-company-icon-wrap"
                              style={{
                                display: job.companyId?.logoUrl ? 'none' : 'flex'
                              }}
                            >
                              <BuildingIcon size={20} color={palette.color} className="job-company-icon" />
                            </div>
                          </div>

                          <div className="job-brand-info">
                            <div className="job-title-row">
                              <h3 className="job-card-title" title={job.title}>
                                {job.title}
                              </h3>
                              <div className="job-status-pill-wrap">
                                {appliedApp ? (
                                  <span className="job-badge-pill applied">Applied</span>
                                ) : isSuspended ? (
                                  <span className="job-badge-pill suspended">Suspended</span>
                                ) : isDeadlinePassed ? (
                                  <span className="job-badge-pill closed">Closed</span>
                                ) : isClosingSoon ? (
                                  <span className="job-badge-pill urgent">Closing Soon</span>
                                ) : (
                                  <span className="job-badge-pill open">Open</span>
                                )}
                              </div>
                            </div>

                            <p className="job-company-name" title={companyName}>
                              {companyName}
                            </p>
                            <span className="job-posted-time">
                              <ClockIcon size={11} /> {formatRelativeTime(job.createdAt || job.publishedAt) || 'Recently'}
                            </span>
                          </div>
                        </div>

                        {/* Structured Key Specifications Box */}
                        <div className="job-card-specs-box">
                          <div className="job-spec-item" title="Job Type and Work Mode">
                            <BriefcaseIcon size={13} className="job-spec-icon" />
                            <span className="job-spec-val">
                              {getJobTypeLabel(job.jobType)} • {getWorkModeLabel(job.workMode)}
                            </span>
                          </div>

                          {locationText && (
                            <div className="job-spec-item" title="Location">
                              <MapPinIcon size={13} className="job-spec-icon" />
                              <span className="job-spec-val" title={locationText}>
                                {locationText}
                              </span>
                            </div>
                          )}

                          <div className="job-spec-item" title="Compensation">
                            <AwardIcon size={13} className="job-spec-icon" />
                            <span className={`job-spec-val ${hasSalary ? 'spec-salary' : 'spec-muted'}`}>
                              {salaryText}
                            </span>
                          </div>

                          <div className="job-spec-item" title="Application Deadline & Vacancies">
                            <CalendarIcon size={13} className="job-spec-icon" />
                            <span className={`job-spec-val ${isClosingSoon ? 'spec-urgent' : ''}`}>
                              {isDeadlinePassed ? 'Closed' : formatDate(job.deadline)} ({vacancyText})
                            </span>
                          </div>
                        </div>

                        {/* Description Preview */}
                        <p className="job-card-description">
                          {job.description?.trim() || 'Role overview, responsibilities, and selection details available in job details.'}
                        </p>

                        {/* Required Skills Chips */}
                        {reqSkills.length > 0 && (
                          <div className="job-card-skills-row">
                            <span className="job-skills-label">Skills:</span>
                            <div className="job-skills-chips">
                              {visibleSkills.map((sk) => (
                                <span key={sk} className="job-skill-chip" title={sk}>
                                  {sk}
                                </span>
                              ))}
                              {extraSkillsCount > 0 && (
                                <span
                                  className="job-skill-chip more"
                                  title={`Additional required skills: ${reqSkills.slice(3).join(', ')}`}
                                >
                                  +{extraSkillsCount} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Concise Eligibility Summary */}
                        <div className={`job-card-eligibility-bar ${eligibilityStatusClass}`}>
                          <span className="job-eligibility-icon">{eligibilityIcon}</span>
                          <span className="job-eligibility-text truncate" title={eligibilitySummaryText}>
                            {eligibilitySummaryText}
                          </span>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="job-card-footer">
                        <button
                          type="button"
                          className="job-btn-secondary"
                          onClick={() => setSelectedJobForDetails(job)}
                        >
                          View Details
                        </button>

                        {appliedApp ? (
                          <button
                            type="button"
                            className="job-btn-applied"
                            onClick={() => setSelectedJobForDetails(job)}
                          >
                            <CheckCircleIcon size={14} /> Applied
                          </button>
                        ) : !isEligible ? (
                          <button
                            type="button"
                            className="job-btn-ineligible"
                            onClick={() => setSelectedJobForDetails(job)}
                            title="Click to view why you are not eligible"
                          >
                            Ineligible
                          </button>
                        ) : isSuspended || isDeadlinePassed || job.status !== 'OPEN' ? (
                          <button
                            type="button"
                            className="job-btn-disabled"
                            disabled
                          >
                            Unavailable
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="job-btn-primary"
                            onClick={() => setSelectedJobForApply(job)}
                          >
                            Apply Now →
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
          appliedApp={getStudentAppForJob(selectedJobForDetails._id, selectedJobForDetails.recruitmentRound)}
          onApplyClick={(j) => {
            setSelectedJobForDetails(null);
            setSelectedJobForApply(j);
          }}
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
