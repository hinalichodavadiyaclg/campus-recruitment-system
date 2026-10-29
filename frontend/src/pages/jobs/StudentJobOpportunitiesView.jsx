import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { studentService } from '../../services/student.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { JobEmptyState } from './JobEmptyState.jsx';
import { JobDetailsModal } from './JobDetailsModal.jsx';
import { JobApplyModal } from './JobApplyModal.jsx';
import { JobFormModal } from './JobFormModal.jsx';
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
  AwardIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GridIcon,
  ListIcon,
  XIcon,
  PlusIcon
} from '../../components/common/Icons.jsx';
import {
  formatSalary,
  formatRelativeTime,
  formatDate,
  getJobTypeLabel,
  getWorkModeLabel
} from '../../utils/job-helpers.js';
import './JobPostings.css';

// Curated pastel palettes for company avatars
const COMPANY_PALETTES = [
  { bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' }, // Sky / Blue
  { bg: '#ccfbf1', color: '#0f766e', border: '#99f6e4' }, // Soft Teal
  { bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' }, // Soft Indigo
  { bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' }, // Mint / Emerald
  { bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' }, // Violet / Purple
  { bg: '#fef3c7', color: '#d97706', border: '#fde68a' }  // Amber / Warm Gold
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

const PRESET_SALARY_OPTIONS = [
  { label: 'Any', value: '' },
  { label: '₹3 LPA+', value: '300000' },
  { label: '₹6 LPA+', value: '600000' },
  { label: '₹10 LPA+', value: '1000000' },
  { label: '₹15 LPA+', value: '1500000' }
];

export function StudentJobOpportunitiesView() {
  const { user, role, has } = useAuth();
  const { toast } = useToast();

  // Student Profile Data (for personalized discovery & skill matching)
  const [studentProfile, setStudentProfile] = useState(null);

  // Search Input & Active Search
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Primary & Real-World Filters
  const [selectedJobTypes, setSelectedJobTypes] = useState([]);
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [datePosted, setDatePosted] = useState('');
  const [closingSoon, setClosingSoon] = useState(false);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'deadline' | 'vacancies' | 'salary'

  // Dynamic filter options derived from real job data
  const [knownCategories, setKnownCategories] = useState([]);
  const [knownLocations, setKnownLocations] = useState([]);

  // Sidebar & Responsive State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // Collapsible Accordion sections in sidebar
  const [openSections, setOpenSections] = useState({
    jobType: true,
    workMode: true,
    deadline: true,
    salary: true,
    category: true,
    location: true,
    datePosted: false
  });

  const toggleSection = (section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Pagination State
  const [page, setPage] = useState(1);
  const limit = 9;

  // Data & Loading State
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 9, total: 0, totalPages: 1 });
  const [studentApplications, setStudentApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Request race-condition guard
  const activeRequestIdRef = useRef(0);

  // Modals
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null);
  const [selectedJobForApply, setSelectedJobForApply] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  // 1. Load Student Profile once on mount
  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      try {
        const profile = await studentService.getMyProfile();
        if (mounted && profile) {
          setStudentProfile(profile);
        }
      } catch {
        // Non-fatal if profile not yet completed
      }
    }
    loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Load Student's actual applications (to authoritatively show 'Applied' status)
  const loadStudentApplications = useCallback(async () => {
    if (!has('APPLICATION_READ')) {
      setStudentApplications([]);
      return;
    }
    try {
      const data = await applicationService.listApplications({ limit: 100 });
      setStudentApplications(data?.items || []);
    } catch {
      // Non-fatal background fetch
    }
  }, [has]);

  useEffect(() => {
    loadStudentApplications();
  }, [loadStudentApplications]);

  // 3. Main Jobs Fetch
  const fetchJobs = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    try {
      setLoading(true);
      setError(null);

      const params = {
        page,
        limit,
        search: appliedSearch || undefined,
        workMode: selectedWorkMode || undefined,
        category: selectedCategory || undefined,
        location: selectedLocation || undefined,
        minSalary: minSalary && Number(minSalary) > 0 ? Number(minSalary) : undefined,
        datePosted: datePosted || undefined,
        closingSoon: closingSoon ? 'true' : undefined,
        sortBy: sortBy || 'recent'
      };

      // Single jobType passed to backend if exactly 1 is chosen
      if (selectedJobTypes.length === 1) {
        params.jobType = selectedJobTypes[0];
      }

      const res = await jobService.listJobs(params);

      // Guard against stale asynchronous responses
      if (requestId !== activeRequestIdRef.current) return;

      let loadedJobs = res?.jobs || res?.items || [];

      // Multi-job-type client filter if multiple are selected
      if (selectedJobTypes.length > 1) {
        loadedJobs = loadedJobs.filter((j) => selectedJobTypes.includes(j.jobType));
      }

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

      // Collect real categories & locations from received jobs to build dynamic filter menus
      if (loadedJobs.length > 0) {
        setKnownCategories((prev) => {
          const set = new Set(prev);
          loadedJobs.forEach((j) => {
            if (j.category?.trim()) set.add(j.category.trim());
          });
          return Array.from(set).sort();
        });

        setKnownLocations((prev) => {
          const set = new Set(prev);
          loadedJobs.forEach((j) => {
            if (j.location?.trim() && j.workMode !== 'REMOTE') {
              set.add(j.location.trim());
            }
          });
          return Array.from(set).sort();
        });
      }
    } catch (err) {
      if (requestId === activeRequestIdRef.current) {
        setError(err.message || 'Failed to load recruitment opportunities. Please try again.');
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    page,
    limit,
    appliedSearch,
    selectedJobTypes,
    selectedWorkMode,
    selectedCategory,
    selectedLocation,
    minSalary,
    datePosted,
    closingSoon,
    sortBy
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Search Form Submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  // Clear Search Text
  const handleClearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
  };

  // Reset All Filters
  const handleResetFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setSelectedJobTypes([]);
    setSelectedWorkMode('');
    setSelectedCategory('');
    setSelectedLocation('');
    setMinSalary('');
    setDatePosted('');
    setClosingSoon(false);
    setSortBy('recent');
    setPage(1);
  };

  // Toggle Job Type selection
  const handleJobTypeToggle = (type) => {
    setSelectedJobTypes((prev) => {
      const exists = prev.includes(type);
      return exists ? prev.filter((t) => t !== type) : [...prev, type];
    });
    setPage(1);
  };

  // Active Filter Chips Generation
  const activeChips = useMemo(() => {
    const chips = [];

    if (appliedSearch) {
      chips.push({
        id: 'search',
        label: `"${appliedSearch}"`,
        onRemove: () => {
          setSearchInput('');
          setAppliedSearch('');
          setPage(1);
        }
      });
    }

    selectedJobTypes.forEach((type) => {
      chips.push({
        id: `type-${type}`,
        label: getJobTypeLabel(type),
        onRemove: () => handleJobTypeToggle(type)
      });
    });

    if (selectedWorkMode) {
      chips.push({
        id: 'workMode',
        label: getWorkModeLabel(selectedWorkMode),
        onRemove: () => {
          setSelectedWorkMode('');
          setPage(1);
        }
      });
    }

    if (selectedCategory) {
      chips.push({
        id: 'category',
        label: `Category: ${selectedCategory}`,
        onRemove: () => {
          setSelectedCategory('');
          setPage(1);
        }
      });
    }

    if (selectedLocation) {
      chips.push({
        id: 'location',
        label: `Location: ${selectedLocation}`,
        onRemove: () => {
          setSelectedLocation('');
          setPage(1);
        }
      });
    }

    if (minSalary && Number(minSalary) > 0) {
      const lpa = (Number(minSalary) / 100000).toFixed(0);
      chips.push({
        id: 'salary',
        label: `Min ₹${lpa} LPA`,
        onRemove: () => {
          setMinSalary('');
          setPage(1);
        }
      });
    }

    if (datePosted) {
      const labels = { '24h': 'Past 24 hours', '7d': 'Past 7 days', '30d': 'Past 30 days' };
      chips.push({
        id: 'datePosted',
        label: `Posted: ${labels[datePosted] || datePosted}`,
        onRemove: () => {
          setDatePosted('');
          setPage(1);
        }
      });
    }

    if (closingSoon) {
      chips.push({
        id: 'closingSoon',
        label: 'Closing Soon (≤ 7 days)',
        onRemove: () => {
          setClosingSoon(false);
          setPage(1);
        }
      });
    }

    return chips;
  }, [
    appliedSearch,
    selectedJobTypes,
    selectedWorkMode,
    selectedCategory,
    selectedLocation,
    minSalary,
    datePosted,
    closingSoon
  ]);

  const hasActiveFilters = activeChips.length > 0;

  // Authoritatively match student application records
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
    toast(`Application submitted successfully! ID: ${application.applicationId}`);
    loadStudentApplications();
    fetchJobs();
  };

  const handleSaveJob = async (payload) => {
    try {
      await jobService.createJob(payload);
      toast('Job posting created successfully.');
      setIsFormModalOpen(false);
      fetchJobs();
    } catch (err) {
      toast(`Failed to save job: ${err.message}`);
    }
  };

  // Subtitle with personalized student details
  const studentDepartment =
    studentProfile?.branch ||
    studentProfile?.department ||
    user?.departmentName ||
    user?.department;
  const studentBatch = studentProfile?.passingYear || user?.passingYear;

  const subtitle = studentDepartment || studentBatch
    ? `Curated recruitment drives and job openings for ${[studentDepartment, studentBatch ? `${studentBatch} Batch` : null].filter(Boolean).join(' • ')}.`
    : 'Discover campus placement drives and career opportunities tailored for your career journey.';

  // Student Profile Skills set for informational matching
  const studentSkillSet = useMemo(() => {
    const rawSkills = studentProfile?.skills || user?.skills || [];
    return new Set(rawSkills.map((s) => String(s).toLowerCase().trim()));
  }, [studentProfile, user]);

  return (
    <PortalLayout
      title="Job Opportunities"
      subtitle={subtitle}
      category="Recruitment Module"
      section="Recruitment"
      currentPath="/jobs"
      actions={
        has('JOB_CREATE') && (
          <button
            type="button"
            className="primary"
            onClick={() => setIsFormModalOpen(true)}
          >
            <PlusIcon size={16} /> Post New Job
          </button>
        )
      }
    >
      {/* 1. Prominent Search Bar (LinkedIn / Indeed Inspired) */}
      <section className="job-search-hero-bar" aria-label="Job Search">
        <form onSubmit={handleSearchSubmit} className="job-search-form">
          <div className="job-search-main-input-wrap">
            <SearchIcon size={20} className="job-search-icon" aria-hidden="true" />
            <input
              type="text"
              id="job-discovery-search"
              placeholder="Search by job title, company name, skills, or keywords…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search job opportunities"
            />
            {searchInput && (
              <button
                type="button"
                className="job-search-clear-btn"
                onClick={handleClearSearch}
                title="Clear search text"
                aria-label="Clear search text"
              >
                <XIcon size={16} />
              </button>
            )}
          </div>

          <button type="submit" className="primary job-search-submit-btn">
            <SearchIcon size={16} /> Find Jobs
          </button>
        </form>
      </section>

      {/* Mobile Filter Toggle Button */}
      <div className="mobile-filter-bar">
        <button
          type="button"
          className="secondary"
          onClick={() => setMobileFilterOpen((prev) => !prev)}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}
        >
          <FilterIcon size={16} /> {mobileFilterOpen ? 'Hide Filters' : 'Show Filters'}
          {hasActiveFilters && ` (${activeChips.length})`}
        </button>
      </div>

      {/* 3. Main Discovery Section: Collapsible Sidebar + Results Toolbar + Grid */}
      <div className={`job-explorer-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Left Filter Sidebar */}
        <aside
          className={`job-filter-sidebar ${mobileFilterOpen ? 'mobile-open' : ''}`}
          aria-label="Filter Options"
        >
          <div className="job-filter-header">
            <h3>
              <FilterIcon size={18} color="var(--navy)" /> Filters
              {hasActiveFilters && (
                <span className="job-filter-count-pill">{activeChips.length}</span>
              )}
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

          <div className="job-filter-sections-list">
            {/* 1. Job Type */}
            <div className="job-accordion-group">
              <button
                type="button"
                className="job-accordion-header"
                onClick={() => toggleSection('jobType')}
                aria-expanded={openSections.jobType}
              >
                <span className="job-filter-title">Job Type</span>
                <ChevronDownIcon
                  size={15}
                  className={`accordion-chevron ${openSections.jobType ? 'open' : ''}`}
                />
              </button>
              {openSections.jobType && (
                <div className="job-filter-options">
                  {['FULL_TIME', 'INTERNSHIP', 'PART_TIME', 'CONTRACT'].map((type) => (
                    <label key={type} className="filter-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedJobTypes.includes(type)}
                        onChange={() => handleJobTypeToggle(type)}
                      />
                      <span>{getJobTypeLabel(type)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Work Mode */}
            <div className="job-accordion-group">
              <button
                type="button"
                className="job-accordion-header"
                onClick={() => toggleSection('workMode')}
                aria-expanded={openSections.workMode}
              >
                <span className="job-filter-title">Work Mode</span>
                <ChevronDownIcon
                  size={15}
                  className={`accordion-chevron ${openSections.workMode ? 'open' : ''}`}
                />
              </button>
              {openSections.workMode && (
                <div className="job-filter-options">
                  <label className="filter-radio-label">
                    <input
                      type="radio"
                      name="sidebar-workMode"
                      value=""
                      checked={!selectedWorkMode}
                      onChange={() => {
                        setSelectedWorkMode('');
                        setPage(1);
                      }}
                    />
                    <span>All Modes</span>
                  </label>
                  {[
                    { id: 'ON_SITE', label: 'On-site' },
                    { id: 'HYBRID', label: 'Hybrid' },
                    { id: 'REMOTE', label: 'Remote' }
                  ].map((mode) => (
                    <label key={mode.id} className="filter-radio-label">
                      <input
                        type="radio"
                        name="sidebar-workMode"
                        value={mode.id}
                        checked={selectedWorkMode === mode.id}
                        onChange={() => {
                          setSelectedWorkMode(mode.id);
                          setPage(1);
                        }}
                      />
                      <span>{mode.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Application Deadline */}
            <div className="job-accordion-group">
              <button
                type="button"
                className="job-accordion-header"
                onClick={() => toggleSection('deadline')}
                aria-expanded={openSections.deadline}
              >
                <span className="job-filter-title">Application Deadline</span>
                <ChevronDownIcon
                  size={15}
                  className={`accordion-chevron ${openSections.deadline ? 'open' : ''}`}
                />
              </button>
              {openSections.deadline && (
                <div className="job-filter-options">
                  <label className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={closingSoon}
                      onChange={(e) => {
                        setClosingSoon(e.target.checked);
                        setPage(1);
                      }}
                    />
                    <span>Closing Soon (≤ 7 days)</span>
                  </label>
                </div>
              )}
            </div>

            {/* D. Job Category (Dynamic from real job data) */}
            {knownCategories.length > 0 && (
              <div className="job-accordion-group">
                <button
                  type="button"
                  className="job-accordion-header"
                  onClick={() => toggleSection('category')}
                  aria-expanded={openSections.category}
                >
                  <span className="job-filter-title">Job Category</span>
                  <ChevronDownIcon
                    size={15}
                    className={`accordion-chevron ${openSections.category ? 'open' : ''}`}
                  />
                </button>
                {openSections.category && (
                  <div className="job-filter-options">
                    <select
                      className="sidebar-select"
                      value={selectedCategory}
                      onChange={(e) => {
                        setSelectedCategory(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All Categories</option>
                      {knownCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* E. Location (Dynamic from real job data) */}
            {knownLocations.length > 0 && (
              <div className="job-accordion-group">
                <button
                  type="button"
                  className="job-accordion-header"
                  onClick={() => toggleSection('location')}
                  aria-expanded={openSections.location}
                >
                  <span className="job-filter-title">Location</span>
                  <ChevronDownIcon
                    size={15}
                    className={`accordion-chevron ${openSections.location ? 'open' : ''}`}
                  />
                </button>
                {openSections.location && (
                  <div className="job-filter-options">
                    <select
                      className="sidebar-select"
                      value={selectedLocation}
                      onChange={(e) => {
                        setSelectedLocation(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All Locations</option>
                      {knownLocations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* F. Salary / Stipend */}
            <div className="job-accordion-group">
              <button
                type="button"
                className="job-accordion-header"
                onClick={() => toggleSection('salary')}
                aria-expanded={openSections.salary}
              >
                <span className="job-filter-title">Min Compensation</span>
                <ChevronDownIcon
                  size={15}
                  className={`accordion-chevron ${openSections.salary ? 'open' : ''}`}
                />
              </button>
              {openSections.salary && (
                <div className="job-filter-options">
                  <div className="salary-preset-chips">
                    {PRESET_SALARY_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        className={`salary-preset-chip ${minSalary === opt.value ? 'active' : ''}`}
                        onClick={() => {
                          setMinSalary(opt.value);
                          setPage(1);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="salary-custom-input-wrap">
                    <span className="salary-currency-prefix">₹</span>
                    <input
                      type="number"
                      placeholder="e.g. 500000"
                      value={minSalary}
                      onChange={(e) => {
                        setMinSalary(e.target.value);
                        setPage(1);
                      }}
                      className="salary-number-input"
                    />
                  </div>
                  <span className="salary-disclaimer-text">
                    Undisclosed compensation jobs remain visible unless a minimum is set.
                  </span>
                </div>
              )}
            </div>

            {/* G. Date Posted */}
            <div className="job-accordion-group">
              <button
                type="button"
                className="job-accordion-header"
                onClick={() => toggleSection('datePosted')}
                aria-expanded={openSections.datePosted}
              >
                <span className="job-filter-title">Date Posted</span>
                <ChevronDownIcon
                  size={15}
                  className={`accordion-chevron ${openSections.datePosted ? 'open' : ''}`}
                />
              </button>
              {openSections.datePosted && (
                <div className="job-filter-options">
                  {[
                    { id: '', label: 'All Time' },
                    { id: '24h', label: 'Past 24 hours' },
                    { id: '7d', label: 'Past 7 days' },
                    { id: '30d', label: 'Past 30 days' }
                  ].map((dp) => (
                    <label key={dp.id} className="filter-radio-label">
                      <input
                        type="radio"
                        name="sidebar-datePosted"
                        value={dp.id}
                        checked={datePosted === dp.id}
                        onChange={() => {
                          setDatePosted(dp.id);
                          setPage(1);
                        }}
                      />
                      <span>{dp.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>


          </div>
        </aside>

        {/* Right Main Column: Results Toolbar + Job Cards Grid */}
        <section className="job-cards-container" aria-label="Job Results">
          {/* Results Toolbar */}
          <div className="job-results-toolbar">
            <div className="job-toolbar-left">
              <button
                type="button"
                className="job-toggle-sidebar-btn"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? 'Expand sidebar filters' : 'Collapse sidebar filters'}
              >
                <FilterIcon size={14} />
                <span>{sidebarCollapsed ? 'Show Filters' : 'Hide Filters'}</span>
              </button>

              <span className="job-count-text">
                Showing <b className="text-navy">{jobs.length}</b> of{' '}
                <b className="text-navy">{pagination.total || jobs.length}</b> opportunities
              </span>
            </div>

            <div className="job-toolbar-right">
              <div className="job-toolbar-sort-wrap">
                <span className="job-sort-label">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="job-toolbar-sort-select"
                  aria-label="Sort jobs by"
                >
                  <option value="recent">Recently Posted</option>
                  <option value="deadline">Deadline Soon</option>
                  <option value="vacancies">Highest Vacancies</option>
                  <option value="salary">Highest Salary</option>
                </select>
              </div>

              {/* View Mode Toggle: Grid vs List (Naukri style) */}
              <div className="job-toolbar-view-toggle" role="group" aria-label="View format">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Grid View (2 columns)"
                  aria-label="Grid View"
                >
                  <GridIcon size={15} />
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List View (Full width)"
                  aria-label="List View"
                >
                  <ListIcon size={15} />
                </button>
              </div>

              <button
                type="button"
                className="ghost job-toolbar-refresh-btn"
                onClick={fetchJobs}
                title="Refresh listings"
                aria-label="Refresh listings"
              >
                <RefreshCwIcon size={14} className={loading ? 'spin-refresh' : ''} />
                <span className="hide-on-mobile">Refresh</span>
              </button>
            </div>
          </div>

          {/* Active Filter Chips Bar */}
          {hasActiveFilters && (
            <div className="job-active-filter-chips-bar" aria-label="Active Filters">
              <div className="active-chips-list">
                {activeChips.map((chip) => (
                  <span key={chip.id} className="active-filter-chip">
                    <span className="chip-text">{chip.label}</span>
                    <button
                      type="button"
                      className="chip-remove-btn"
                      onClick={chip.onRemove}
                      aria-label={`Remove filter ${chip.label}`}
                    >
                      <XIcon size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="job-clear-all-chips-btn"
                onClick={handleResetFilters}
              >
                Clear All
              </button>
            </div>
          )}

          {/* Loading, Error, Empty, and Job Grid */}
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
                  ? 'There are no active recruitment postings matching your selected filters. Try broadening your criteria or clearing filters.'
                  : 'No campus recruitment drives are currently accepting applications. New opportunities will appear here as approved companies publish openings.'
              }
            />
          ) : (
            <>
              <div className={`job-grid ${viewMode === 'list' ? 'list-view' : ''}`}>
                {jobs.map((job) => {
                  const companyName = job.companyId?.companyName || 'Company';
                  const palette = getCompanyPalette(companyName);
                  const studentApp = getStudentAppForJob(job._id, job.recruitmentRound);
                  const appStatus = studentApp?.status;
                  const isActivelyApplied = appStatus === 'APPLIED' || appStatus === 'UNDER_REVIEW';
                  const isShortlisted =
                    appStatus === 'SHORTLISTED' ||
                    appStatus === 'ASSESSMENT' ||
                    appStatus === 'INTERVIEW';
                  const isSelected = appStatus === 'SELECTED';
                  const isRejected = appStatus === 'REJECTED';
                  const isWithdrawn = appStatus === 'WITHDRAWN';

                  const isSuspended = Boolean(job.isSuspended);
                  const isDeadlinePassed = new Date(job.deadline) < new Date();
                  const daysUntilDeadline = Math.ceil(
                    (new Date(job.deadline) - new Date()) / (1000 * 60 * 60 * 24)
                  );
                  const isClosingSoon =
                    !isDeadlinePassed && daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
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
                      ((job.compensation.salaryMin !== undefined &&
                        job.compensation.salaryMin !== null &&
                        Number(job.compensation.salaryMin) > 0) ||
                        (job.compensation.salaryMax !== undefined &&
                          job.compensation.salaryMax !== null &&
                          Number(job.compensation.salaryMax) > 0))
                  );
                  const salaryText = formatSalary(job.compensation);

                  // Informational skills (strict single line, no description)
                  const requiredSkills = Array.isArray(job.eligibilityCriteria?.requiredSkills)
                    ? job.eligibilityCriteria.requiredSkills
                    : [];

                  // Formal Eligibility Failure summary
                  let formalIneligibleReason = '';
                  if (job.eligibility && job.eligibility.isEligible === false) {
                    const checks = job.eligibility.checks || {};
                    if (checks.naandiTraining === false || checks.naandiTraining?.passed === false) {
                      formalIneligibleReason = 'Naandi Training completion required';
                    } else if (checks.cgpa === false || checks.cgpa?.passed === false) {
                      formalIneligibleReason = `CGPA cutoff not met (Min ${job.eligibilityCriteria?.minCgpa || 0})`;
                    } else if (checks.department === false || checks.department?.passed === false) {
                      formalIneligibleReason = 'Department not eligible';
                    } else if (checks.course === false || checks.course?.passed === false) {
                      formalIneligibleReason = 'Course not eligible';
                    } else if (checks.passingYear === false || checks.passingYear?.passed === false) {
                      formalIneligibleReason = 'Graduating batch not eligible';
                    } else if (checks.backlogs === false || checks.backlogs?.passed === false) {
                      formalIneligibleReason = 'Exceeds maximum active backlogs';
                    } else {
                      formalIneligibleReason =
                        job.eligibility.ineligibleReason || 'Formal criteria requirements not met';
                    }
                  }

                  return (
                    <article key={job._id} className="job-card">
                      <div className="job-card-main">
                        {/* Header: Company Avatar + (Title & Status) + Company Name */}
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
                              <BuildingIcon
                                size={20}
                                color={palette.color}
                                className="job-company-icon"
                              />
                            </div>
                          </div>

                          <div className="job-brand-info">
                            <div className="job-title-row">
                              <h3
                                className="job-card-title"
                                title={job.title}
                                onClick={() => setSelectedJobForDetails(job)}
                              >
                                {job.title}
                              </h3>
                              <div className="job-status-pill-wrap">
                                {isSelected ? (
                                  <span className="job-badge-pill selected">Selected 🎉</span>
                                ) : isShortlisted ? (
                                  <span className="job-badge-pill shortlisted">
                                    {appStatus === 'INTERVIEW' ? 'Interview' : 'Shortlisted'}
                                  </span>
                                ) : isActivelyApplied ? (
                                  <span className="job-badge-pill applied">
                                    {appStatus === 'UNDER_REVIEW' ? 'Under Review' : 'Applied'}
                                  </span>
                                ) : isWithdrawn ? (
                                  <span className="job-badge-pill withdrawn">Withdrawn</span>
                                ) : isRejected ? (
                                  <span className="job-badge-pill rejected">Not Selected</span>
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
                          </div>
                        </div>

                        {/* Structured Specifications Box (Naukri style) */}
                        <div className="job-card-specs-box">
                          <div className="job-spec-item" title="Job Type and Work Mode">
                            <BriefcaseIcon size={14} className="job-spec-icon" />
                            <span className="job-spec-val">
                              {getJobTypeLabel(job.jobType)} • {getWorkModeLabel(job.workMode)}
                            </span>
                          </div>

                          {locationText && (
                            <div className="job-spec-item" title="Location">
                              <MapPinIcon size={14} className="job-spec-icon" />
                              <span className="job-spec-val" title={locationText}>
                                {locationText}
                              </span>
                            </div>
                          )}

                          <div className="job-spec-item" title="Compensation">
                            <AwardIcon size={14} className="job-spec-icon" />
                            <span
                              className={`job-spec-val ${hasSalary ? 'spec-salary' : 'spec-muted'}`}
                            >
                              {salaryText}
                            </span>
                          </div>

                          <div className="job-spec-item" title="Application Deadline & Vacancies">
                            <CalendarIcon size={14} className="job-spec-icon" />
                            <span className={`job-spec-val ${isClosingSoon ? 'spec-urgent' : ''}`}>
                              {isDeadlinePassed ? 'Closed' : formatDate(job.deadline)} ({vacancyText})
                            </span>
                          </div>
                        </div>

                        {/* Key Skills Row - Strictly ONE Single Line without wrapping */}
                        {requiredSkills.length > 0 && (
                          <div
                            className="job-naukri-skills-row"
                            title={`Skills: ${requiredSkills.join(', ')}`}
                          >
                            <span className="job-skills-tag-label">Skills:</span>
                            <div className="job-skills-chips-single-line">
                              {requiredSkills.slice(0, 3).map((skill) => (
                                <span key={skill} className="job-skill-chip" title={skill}>
                                  {skill}
                                </span>
                              ))}
                              {requiredSkills.length > 3 && (
                                <span
                                  className="job-skill-chip more"
                                  title={requiredSkills.slice(3).join(', ')}
                                >
                                  +{requiredSkills.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer Actions & Posted Time (Naukri style) */}
                      <div className="job-card-footer">
                        <div className="job-card-footer-left">
                          <ClockIcon size={12} color="var(--muted)" />
                          <span className="job-posted-time">
                            {formatRelativeTime(job.createdAt || job.publishedAt) || 'Recently'}
                          </span>
                        </div>

                        <div className="job-card-footer-actions">
                          <button
                            type="button"
                            className="job-btn-secondary"
                            onClick={() => setSelectedJobForDetails(job)}
                          >
                            View Details
                          </button>

                          {isSelected ? (
                            <button
                              type="button"
                              className="job-btn-status-pill selected"
                              onClick={() => setSelectedJobForDetails(job)}
                              title="Congratulations! You have been selected. Click for details."
                            >
                              ★ Selected
                            </button>
                          ) : isShortlisted ? (
                            <button
                              type="button"
                              className="job-btn-status-pill shortlisted"
                              onClick={() => setSelectedJobForDetails(job)}
                              title={`Status: ${appStatus}. Click for details.`}
                            >
                              Shortlisted
                            </button>
                          ) : isActivelyApplied ? (
                            <button
                              type="button"
                              className="job-btn-applied"
                              onClick={() => setSelectedJobForDetails(job)}
                              title={`Status: ${appStatus}. Click to view details.`}
                            >
                              <CheckCircleIcon size={14} /> Applied
                            </button>
                          ) : isWithdrawn ? (
                            <button
                              type="button"
                              className="job-btn-withdrawn"
                              onClick={() => setSelectedJobForDetails(job)}
                              title="You withdrew your application for this recruitment drive. Click to view details."
                            >
                              Withdrawn
                            </button>
                          ) : isRejected ? (
                            <button
                              type="button"
                              className="job-btn-rejected"
                              onClick={() => setSelectedJobForDetails(job)}
                              title="Application was not selected for this recruitment drive."
                            >
                              Not Selected
                            </button>
                          ) : !isEligible ? (
                            <button
                              type="button"
                              className="job-btn-ineligible"
                              onClick={() => setSelectedJobForDetails(job)}
                              title={
                                formalIneligibleReason
                                  ? `${formalIneligibleReason} — Click to view details`
                                  : 'Formal criteria requirements not met'
                              }
                            >
                              Ineligible
                            </button>
                          ) : isSuspended || isDeadlinePassed || job.status !== 'OPEN' ? (
                            <button type="button" className="job-btn-disabled" disabled>
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
          appliedApp={getStudentAppForJob(
            selectedJobForDetails._id,
            selectedJobForDetails.recruitmentRound
          )}
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

      {isFormModalOpen && (
        <JobFormModal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          onSave={handleSaveJob}
        />
      )}
    </PortalLayout>
  );
}
