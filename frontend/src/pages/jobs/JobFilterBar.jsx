import React from 'react';
import { SearchIcon, RefreshCwIcon, FilterIcon } from '../../components/common/Icons.jsx';

export function JobFilterBar({
  searchInput = '',
  onSearchChange,
  onSearchSubmit,
  selectedStatus = '',
  onStatusChange,
  showStatusFilter = true,
  statusOptions,
  selectedJobType = '',
  onJobTypeChange,
  selectedWorkMode = '',
  onWorkModeChange,
  selectedCompany = '',
  onCompanyChange,
  companies = [],
  showCompanyFilter = false,
  selectedDepartment = '',
  onDepartmentChange,
  departments = [],
  showDepartmentFilter = false,
  selectedCourse = '',
  onCourseChange,
  courses = [],
  showCourseFilter = false,
  sortBy = '',
  onSortChange,
  showSortFilter = true,
  sortOptions,
  onReset,
  hasActiveFilters = false
}) {
  return (
    <div className="job-table-filters-card">
      <form onSubmit={onSearchSubmit} className="job-table-filters-form">
        {/* Search Input */}
        <div className="filter-item-search">
          <SearchIcon size={16} className="filter-search-icon" />
          <input
            type="text"
            placeholder="Search by Job ID (JOB-XXXX), title, keywords…"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Company Dropdown (Head / Coordinator) */}
        {showCompanyFilter && companies.length > 0 && (
          <div className="filter-item-select">
            <select
              value={selectedCompany}
              onChange={(e) => onCompanyChange(e.target.value)}
              aria-label="Filter by Company"
            >
              <option value="">All Companies</option>
              {companies.map((comp) => (
                <option key={comp._id} value={comp._id}>
                  {comp.companyName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status Dropdown */}
        {showStatusFilter && (
          <div className="filter-item-select">
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              aria-label="Filter by Status"
            >
              {statusOptions ? (
                statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="">All Statuses</option>
                  <option value="OPEN">Open (Active)</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PAUSED">Paused</option>
                  <option value="CLOSED">Closed</option>
                </>
              )}
            </select>
          </div>
        )}

        {/* Job Type Dropdown */}
        <div className="filter-item-select">
          <select
            value={selectedJobType}
            onChange={(e) => onJobTypeChange(e.target.value)}
            aria-label="Filter by Job Type"
          >
            <option value="">All Job Types</option>
            <option value="FULL_TIME">Full-Time</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="PART_TIME">Part-Time</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </div>

        {/* Work Mode Dropdown */}
        <div className="filter-item-select">
          <select
            value={selectedWorkMode}
            onChange={(e) => onWorkModeChange(e.target.value)}
            aria-label="Filter by Work Mode"
          >
            <option value="">All Work Modes</option>
            <option value="ON_SITE">On-Site</option>
            <option value="HYBRID">Hybrid</option>
            <option value="REMOTE">Remote</option>
          </select>
        </div>

        {/* Department Dropdown */}
        {showDepartmentFilter && departments.length > 0 && (
          <div className="filter-item-select">
            <select
              value={selectedDepartment}
              onChange={(e) => onDepartmentChange(e.target.value)}
              aria-label="Filter by Department"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name || d.code}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Course Dropdown */}
        {showCourseFilter && courses.length > 0 && (
          <div className="filter-item-select">
            <select
              value={selectedCourse}
              onChange={(e) => onCourseChange(e.target.value)}
              aria-label="Filter by Course"
            >
              <option value="">All Courses</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name || c.code}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort By Dropdown */}
        {showSortFilter && (
          <div className="filter-item-select">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              aria-label="Sort Order"
            >
              {sortOptions ? (
                sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="newest">Sort: Most Recent</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="deadline">Sort: Deadline Soonest</option>
                  <option value="vacancies">Sort: Vacancies (High to Low)</option>
                </>
              )}
            </select>
          </div>
        )}

        {/* Search Submit Button */}
        <button type="submit" className="primary filter-submit-btn">
          Search
        </button>

        {/* Reset Filters Button */}
        {hasActiveFilters && (
          <button
            type="button"
            className="ghost filter-reset-btn"
            onClick={onReset}
            title="Clear all active search and filter constraints"
          >
            Clear Filters
          </button>
        )}
      </form>
    </div>
  );
}
