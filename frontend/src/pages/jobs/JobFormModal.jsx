import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { companyService } from '../../services/company.service.js';
import {
  XIcon,
  PlusIcon,
  TrashIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  AlertCircleIcon
} from '../../components/common/Icons.jsx';

const DEFAULT_FORM = {
  companyId: '',
  title: '',
  description: '',
  jobType: 'FULL_TIME',
  category: 'Software Engineering',
  workMode: 'ON_SITE',
  location: 'Surat, Gujarat',
  vacancies: 1,
  compensation: {
    salaryMin: '',
    salaryMax: '',
    currency: 'INR',
    salaryFormat: 'PER_ANNUM',
    additionalPerks: ''
  },
  selectionProcess: ['Resume Screening', 'Technical Assessment', 'HR Interview'],
  eligibilityMode: 'RESTRICTED',
  eligibilityCriteria: {
    allowedDepartmentIds: [],
    allowedCourseIds: [],
    allowedPassingYears: [new Date().getFullYear(), new Date().getFullYear() + 1],
    minCgpa: 6.0,
    maxActiveBacklogs: 0,
    requiredSkills: '',
    preferredSkills: '',
    requiresNaandiTraining: true
  },
  deadline: '',
  status: 'OPEN'
};

/**
 * Reusable Searchable Checkbox List Component
 * Provides "All" option at top, search filter, Select All, Clear All, and count badge.
 */
function SearchableCheckboxList({
  title,
  items = [],
  selectedIds = [],
  isAllSelected = false,
  onToggleAll,
  onToggleItem,
  onSelectAllVisible,
  onClearAll,
  allLabel = 'All',
  allSubLabel = '',
  searchPlaceholder = 'Search...',
  emptyText = 'No items available',
  loading = false,
  error = null,
  disabled = false,
  badgeKey = 'code'
}) {
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q)) ||
        (item.level && item.level.toLowerCase().includes(q))
    );
  }, [items, search]);

  const allVisibleIds = useMemo(() => filteredItems.map((i) => String(i._id)), [filteredItems]);

  return (
    <div className="searchable-box">
      <div className="searchable-box-header">
        <div className="searchable-box-search-wrap">
          <SearchIcon size={14} className="searchable-box-search-icon" />
          <input
            type="text"
            className="searchable-box-search-input"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={disabled}
          />
          {search && (
            <button
              type="button"
              className="searchable-box-clear-search"
              onClick={() => setSearch('')}
              title="Clear search"
            >
              <XIcon size={12} />
            </button>
          )}
        </div>

        <div className="searchable-box-toolbar">
          <div className="searchable-box-actions">
            <button
              type="button"
              className="searchable-box-btn"
              onClick={() => onSelectAllVisible?.(allVisibleIds)}
              disabled={disabled || filteredItems.length === 0}
            >
              Select All
            </button>
            <span style={{ color: 'var(--line)' }}>|</span>
            <button
              type="button"
              className="searchable-box-btn"
              onClick={() => onClearAll?.()}
              disabled={disabled || (selectedIds.length === 0 && !isAllSelected)}
            >
              Clear All
            </button>
          </div>
          <span className="searchable-box-count">
            {isAllSelected
              ? `All Selected (${items.length})`
              : `${selectedIds.length} of ${items.length} selected`}
          </span>
        </div>
      </div>

      <div className="searchable-box-list">
        {loading ? (
          <div className="searchable-box-empty">Loading {title.toLowerCase()}...</div>
        ) : error ? (
          <div className="searchable-box-empty" style={{ color: 'var(--red)' }}>
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="searchable-box-empty">{emptyText}</div>
        ) : (
          <>
            {/* "All" Option at the top */}
            {!search && (
              <div
                className={`searchable-item-row is-all-option ${isAllSelected ? 'is-selected' : ''}`}
                onClick={onToggleAll}
                role="checkbox"
                aria-checked={isAllSelected}
              >
                <input
                  type="checkbox"
                  className="searchable-item-checkbox"
                  checked={isAllSelected}
                  onChange={() => {}} // handled by row onClick
                  disabled={disabled}
                />
                <div className="searchable-item-content">
                  <span className="searchable-item-name">{allLabel}</span>
                  {allSubLabel && <span className="searchable-item-sub">{allSubLabel}</span>}
                </div>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="searchable-box-empty">No results matching "{search}"</div>
            ) : (
              filteredItems.map((item) => {
                const isChecked = !isAllSelected && selectedIds.includes(String(item._id));
                return (
                  <div
                    key={item._id}
                    className={`searchable-item-row ${isChecked ? 'is-selected' : ''}`}
                    onClick={() => onToggleItem?.(String(item._id))}
                    role="checkbox"
                    aria-checked={isChecked}
                  >
                    <input
                      type="checkbox"
                      className="searchable-item-checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by row onClick
                      disabled={disabled}
                    />
                    <div className="searchable-item-content">
                      <span className="searchable-item-name">{item.name}</span>
                      {item.subText && (
                        <span className="searchable-item-sub">{item.subText}</span>
                      )}
                    </div>
                    {item[badgeKey] && (
                      <span className="searchable-item-badge">{item[badgeKey]}</span>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function JobFormModal({
  isOpen,
  onClose,
  job, // if provided, edit mode
  user,
  role,
  onSave
}) {
  const isEdit = Boolean(job?._id);
  const isAdmin =
    role?.id === 'ROLE_PLACEMENT_HEAD' ||
    role?.id === 'ROLE_SUPER_ADMIN' ||
    user?.roleId === 'ROLE_PLACEMENT_HEAD' ||
    user?.roleId === 'ROLE_SUPER_ADMIN';

  // Active Tab state
  const [activeTab, setActiveTab] = useState('basic');

  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [newSelectionStep, setNewSelectionStep] = useState('');

  // Eligibility specific state
  const [isAllDepartments, setIsAllDepartments] = useState(true);
  const [selectedDeptIds, setSelectedDeptIds] = useState([]);
  const [isAllCourses, setIsAllCourses] = useState(true);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);

  // Available graduation year options
  const currentYear = new Date().getFullYear();
  const passingYearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  // Fetch departments, courses, and companies (if admin)
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    async function loadLookups() {
      try {
        setLoadingLookups(true);
        setLookupError(null);
        const [deptRes, courseRes] = await Promise.all([
          departmentService.listDepartments({ limit: 100 }),
          courseService.listCourses({ limit: 100 })
        ]);

        if (mounted) {
          const deptList = deptRes?.departments || deptRes?.items || deptRes || [];
          const courseList = courseRes?.courses || courseRes?.items || courseRes || [];
          setDepartments(Array.isArray(deptList) ? deptList : []);
          setCourses(Array.isArray(courseList) ? courseList : []);
        }

        if (isAdmin && !isEdit) {
          const compRes = await companyService.listCompanies({ limit: 100 });
          if (mounted) {
            const compList = compRes?.companies || compRes?.items || compRes || [];
            setCompanies(Array.isArray(compList) ? compList : []);
          }
        }
      } catch (err) {
        console.error('Failed to load lookup data:', err);
        if (mounted) {
          setLookupError('Failed to load departments and courses. Please refresh or try again.');
        }
      } finally {
        if (mounted) setLoadingLookups(false);
      }
    }
    loadLookups();
    return () => {
      mounted = false;
    };
  }, [isOpen, isAdmin, isEdit]);

  // Populate form in edit mode or reset on open
  useEffect(() => {
    if (!isOpen) return;

    // Reset active tab to first tab on open
    setActiveTab('basic');

    if (job) {
      // Format deadline for datetime-local input
      let formattedDeadline = '';
      if (job.deadline) {
        const d = new Date(job.deadline);
        if (!isNaN(d.getTime())) {
          formattedDeadline = d.toISOString().slice(0, 16);
        }
      }

      const crit = job.eligibilityCriteria || {};
      const savedDeptIds = (crit.allowedDepartmentIds || []).map((d) => String(d._id || d));
      const savedCourseIds = (crit.allowedCourseIds || []).map((c) => String(c._id || c));

      // If empty array, it means All was selected
      const hasDeptRestrictions = savedDeptIds.length > 0;
      const hasCourseRestrictions = savedCourseIds.length > 0;

      setIsAllDepartments(!hasDeptRestrictions);
      setSelectedDeptIds(savedDeptIds);
      setIsAllCourses(!hasCourseRestrictions);
      setSelectedCourseIds(savedCourseIds);

      setFormData({
        companyId: job.companyId?._id || job.companyId || '',
        title: job.title || '',
        description: job.description || '',
        jobType: job.jobType || 'FULL_TIME',
        category: job.category || '',
        workMode: job.workMode || 'ON_SITE',
        location: job.location || '',
        vacancies: job.vacancies || 1,
        compensation: {
          salaryMin: job.compensation?.salaryMin ?? '',
          salaryMax: job.compensation?.salaryMax ?? '',
          currency: job.compensation?.currency || 'INR',
          salaryFormat: job.compensation?.salaryFormat || 'PER_ANNUM',
          additionalPerks: job.compensation?.additionalPerks || ''
        },
        selectionProcess: Array.isArray(job.selectionProcess) ? [...job.selectionProcess] : [],
        eligibilityMode: job.eligibilityMode || 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: savedDeptIds,
          allowedCourseIds: savedCourseIds,
          allowedPassingYears: crit.allowedPassingYears || [],
          minCgpa: crit.minCgpa ?? 0,
          maxActiveBacklogs: crit.maxActiveBacklogs ?? '',
          requiredSkills: Array.isArray(crit.requiredSkills) ? crit.requiredSkills.join(', ') : '',
          preferredSkills: Array.isArray(crit.preferredSkills) ? crit.preferredSkills.join(', ') : '',
          requiresNaandiTraining: crit.requiresNaandiTraining !== false
        },
        deadline: formattedDeadline,
        status: job.status || 'DRAFT'
      });
    } else {
      // Default future deadline (14 days from now)
      const future = new Date();
      future.setDate(future.getDate() + 14);
      future.setHours(23, 59, 0, 0);

      setIsAllDepartments(true);
      setSelectedDeptIds([]);
      setIsAllCourses(true);
      setSelectedCourseIds([]);

      setFormData({
        ...DEFAULT_FORM,
        deadline: future.toISOString().slice(0, 16)
      });
    }
    setErrors({});
  }, [isOpen, job]);

  // Compute available courses filtered by selected departments
  const availableCourses = useMemo(() => {
    if (isAllDepartments) {
      return courses.map((c) => {
        const deptName = c.departmentId?.name || c.departmentId?.code || '';
        return {
          ...c,
          subText: deptName ? `Dept: ${deptName}` : c.level
        };
      });
    }

    if (selectedDeptIds.length === 0) {
      return [];
    }

    return courses
      .filter((c) => {
        const deptId = c.departmentId?._id ? String(c.departmentId._id) : String(c.departmentId || '');
        return selectedDeptIds.includes(deptId);
      })
      .map((c) => {
        const deptName = c.departmentId?.name || c.departmentId?.code || '';
        return {
          ...c,
          subText: deptName ? `Dept: ${deptName}` : c.level
        };
      });
  }, [courses, isAllDepartments, selectedDeptIds]);

  // Refresh course selections when departments change: purge obsolete course IDs
  useEffect(() => {
    if (isAllCourses) return;

    setSelectedCourseIds((prevSelected) => {
      const valid = prevSelected.filter((id) =>
        availableCourses.some((c) => String(c._id) === String(id))
      );
      if (valid.length === 0 && prevSelected.length > 0) {
        setIsAllCourses(true);
        return [];
      }
      return valid;
    });
  }, [availableCourses, isAllCourses]);

  // Department Action Handlers
  const handleToggleAllDepartments = () => {
    setIsAllDepartments(true);
    setSelectedDeptIds([]);
    setIsAllCourses(true);
    setSelectedCourseIds([]);
    if (errors.departments) {
      setErrors((prev) => ({ ...prev, departments: null }));
    }
  };

  const handleToggleDepartment = (deptId) => {
    setIsAllDepartments(false);
    setSelectedDeptIds((prev) => {
      const exists = prev.includes(deptId);
      const updated = exists ? prev.filter((id) => id !== deptId) : [...prev, deptId];
      return updated;
    });
    if (errors.departments) {
      setErrors((prev) => ({ ...prev, departments: null }));
    }
  };

  const handleSelectAllDepartments = (visibleIds) => {
    setIsAllDepartments(false);
    setSelectedDeptIds((prev) => {
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
    if (errors.departments) {
      setErrors((prev) => ({ ...prev, departments: null }));
    }
  };

  const handleClearAllDepartments = () => {
    setIsAllDepartments(false);
    setSelectedDeptIds([]);
  };

  // Course Action Handlers
  const handleToggleAllCourses = () => {
    setIsAllCourses(true);
    setSelectedCourseIds([]);
    if (errors.courses) {
      setErrors((prev) => ({ ...prev, courses: null }));
    }
  };

  const handleToggleCourse = (courseId) => {
    setIsAllCourses(false);
    setSelectedCourseIds((prev) => {
      const exists = prev.includes(courseId);
      const updated = exists ? prev.filter((id) => id !== courseId) : [...prev, courseId];
      return updated;
    });
    if (errors.courses) {
      setErrors((prev) => ({ ...prev, courses: null }));
    }
  };

  const handleSelectAllCourses = (visibleIds) => {
    setIsAllCourses(false);
    setSelectedCourseIds((prev) => {
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
    if (errors.courses) {
      setErrors((prev) => ({ ...prev, courses: null }));
    }
  };

  const handleClearAllCourses = () => {
    setIsAllCourses(false);
    setSelectedCourseIds([]);
  };

  // Form field change handlers
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleCompensationChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      compensation: { ...prev.compensation, [field]: value }
    }));
    if (errors.compensation) {
      setErrors((prev) => ({ ...prev, compensation: null }));
    }
  };

  const handleCriteriaChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      eligibilityCriteria: { ...prev.eligibilityCriteria, [field]: value }
    }));
  };

  const handleTogglePassingYear = (year) => {
    const current = formData.eligibilityCriteria.allowedPassingYears || [];
    const exists = current.includes(year);
    const updated = exists ? current.filter((y) => y !== year) : [...current, year];
    handleCriteriaChange('allowedPassingYears', updated);
  };

  const handleAddSelectionStep = () => {
    if (!newSelectionStep.trim()) return;
    setFormData((prev) => ({
      ...prev,
      selectionProcess: [...prev.selectionProcess, newSelectionStep.trim()]
    }));
    setNewSelectionStep('');
  };

  const handleRemoveSelectionStep = (index) => {
    setFormData((prev) => ({
      ...prev,
      selectionProcess: prev.selectionProcess.filter((_, i) => i !== index)
    }));
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Job title is required (minimum 2 characters).';
    } else if (formData.title.trim().length < 2) {
      newErrors.title = 'Job title must be at least 2 characters.';
    } else if (formData.title.trim().length > 150) {
      newErrors.title = 'Job title cannot exceed 150 characters.';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Job description & responsibilities are required (minimum 10 characters).';
    } else if (formData.description.trim().length < 10) {
      newErrors.description = 'Job description must be at least 10 characters.';
    }

    if (!formData.vacancies || Number(formData.vacancies) < 1) {
      newErrors.vacancies = 'At least 1 vacancy is required.';
    }

    if (
      (formData.workMode === 'ON_SITE' || formData.workMode === 'HYBRID') &&
      !formData.location?.trim()
    ) {
      newErrors.location = 'Location is required for On-Site or Hybrid jobs.';
    }

    if (isAdmin && !isEdit && !formData.companyId) {
      newErrors.companyId = 'Please select a recruiting company.';
    }

    // Compensation check
    const minSal = formData.compensation.salaryMin !== '' ? Number(formData.compensation.salaryMin) : null;
    const maxSal = formData.compensation.salaryMax !== '' ? Number(formData.compensation.salaryMax) : null;
    if (minSal !== null && maxSal !== null && maxSal < minSal) {
      newErrors.compensation = 'Maximum salary cannot be less than minimum salary.';
    }

    // Eligibility check
    if (formData.eligibilityMode === 'RESTRICTED') {
      if (!isAllDepartments && selectedDeptIds.length === 0) {
        newErrors.departments = 'Please select at least one department or choose "All Departments".';
      }
      if (!isAllCourses && selectedCourseIds.length === 0) {
        newErrors.courses = 'Please select at least one course or choose "All Courses".';
      }
    }

    if (!formData.deadline) {
      newErrors.deadline = 'Application deadline is required.';
    } else {
      const deadlineDate = new Date(formData.deadline);
      if (isNaN(deadlineDate.getTime())) {
        newErrors.deadline = 'Please enter a valid deadline date.';
      } else if (formData.status === 'OPEN' && deadlineDate <= new Date()) {
        newErrors.deadline = 'Application deadline must be in the future for an active job.';
      }
    }

    setErrors(newErrors);

    // Auto-navigate to first tab with error
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.title || newErrors.description || newErrors.vacancies || newErrors.location || newErrors.companyId) {
        setActiveTab('basic');
      } else if (newErrors.compensation) {
        setActiveTab('compensation');
      } else if (newErrors.departments || newErrors.courses) {
        setActiveTab('eligibility');
      } else if (newErrors.deadline) {
        setActiveTab('hiring');
      }
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const crit = formData.eligibilityCriteria;

      // Parse comma-separated skills
      const parseSkills = (str) =>
        str ? str.split(',').map((s) => s.trim()).filter(Boolean) : [];

      // Backend unrestricted representation: empty array [] means all / unrestricted
      const payloadAllowedDeptIds =
        formData.eligibilityMode === 'ALL_STUDENTS' || isAllDepartments
          ? []
          : selectedDeptIds;

      const payloadAllowedCourseIds =
        formData.eligibilityMode === 'ALL_STUDENTS' || isAllCourses
          ? []
          : selectedCourseIds;

      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        jobType: formData.jobType,
        category: formData.category?.trim() || undefined,
        workMode: formData.workMode,
        location: formData.location?.trim() || undefined,
        vacancies: Number(formData.vacancies),
        compensation: {
          salaryMin: formData.compensation.salaryMin !== '' ? Number(formData.compensation.salaryMin) : undefined,
          salaryMax: formData.compensation.salaryMax !== '' ? Number(formData.compensation.salaryMax) : undefined,
          currency: formData.compensation.currency || 'INR',
          salaryFormat: formData.compensation.salaryFormat || 'PER_ANNUM',
          additionalPerks: formData.compensation.additionalPerks?.trim() || undefined
        },
        selectionProcess: formData.selectionProcess,
        eligibilityMode: formData.eligibilityMode,
        eligibilityCriteria: {
          allowedDepartmentIds: payloadAllowedDeptIds,
          allowedCourseIds: payloadAllowedCourseIds,
          allowedPassingYears: crit.allowedPassingYears || [],
          minCgpa: Number(crit.minCgpa || 0),
          maxActiveBacklogs: crit.maxActiveBacklogs !== '' && crit.maxActiveBacklogs !== null ? Number(crit.maxActiveBacklogs) : null,
          requiredSkills: parseSkills(crit.requiredSkills),
          preferredSkills: parseSkills(crit.preferredSkills),
          requiresNaandiTraining: Boolean(crit.requiresNaandiTraining)
        },
        deadline: new Date(formData.deadline).toISOString(),
        status: formData.status
      };

      if (isAdmin && !isEdit) {
        payload.companyId = formData.companyId;
      }

      await onSave(payload, isEdit ? job._id : null);
      onClose();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        submit: err.message || 'Failed to save job posting. Please check all fields.'
      }));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  // Tabs configuration with error tracking
  const tabs = [
    {
      id: 'basic',
      label: '1. Basic Info',
      hasError: Boolean(errors.title || errors.description || errors.vacancies || errors.location || errors.companyId)
    },
    {
      id: 'compensation',
      label: '2. Compensation',
      hasError: Boolean(errors.compensation)
    },
    {
      id: 'eligibility',
      label: '3. Target Eligibility',
      hasError: Boolean(errors.departments || errors.courses)
    },
    {
      id: 'hiring',
      label: `4. Hiring Process (${formData.selectionProcess.length})`,
      hasError: Boolean(errors.deadline)
    }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="860px">
      <div className="job-modal-header">
        <h2>{isEdit ? `Edit Job Posting: ${job?.jobId || ''}` : 'Create New Job Posting'}</h2>
        <p>
          {isEdit
            ? 'Update job requirements, compensation, eligible departments, and hiring stages.'
            : 'Fill in the details below to configure and publish a campus recruitment opportunity.'}
        </p>
      </div>

      {errors.submit && (
        <div className="notice error" style={{ marginBottom: '16px' }}>
          <AlertCircleIcon size={16} /> {errors.submit}
        </div>
      )}

      {/* Tabs Navigation Bar matching Workshop modal design */}
      <div className="job-form-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`job-form-tab-btn ${activeTab === tab.id ? 'active' : ''} ${tab.hasError ? 'has-error' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.hasError && <span className="tab-error-dot" title="Has validation errors" />}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* ========================================================
            TAB 1: BASIC INFO
            ======================================================== */}
        {activeTab === 'basic' && (
          <div className="job-form-tab-pane">
            <div className="form-grid">
              {/* Admin Company Selector */}
              {isAdmin && !isEdit && (
                <div className="field">
                  <label>
                    Recruiting Company <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => handleChange('companyId', e.target.value)}
                  >
                    <option value="">Select Company Profile...</option>
                    {companies.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.companyName} ({c.companyId || 'ID Pending'})
                      </option>
                    ))}
                  </select>
                  {errors.companyId && <span className="field-error">{errors.companyId}</span>}
                </div>
              )}

              {/* Title & Category */}
              <div className="job-form-grid-2">
                <div className="field">
                  <label>
                    Job Title <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Graduate Software Engineer, Product Analyst"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                  />
                  {errors.title && <span className="field-error">{errors.title}</span>}
                </div>

                <div className="field">
                  <label>Category / Domain</label>
                  <input
                    type="text"
                    placeholder="e.g. Software Engineering, Data & AI, Finance"
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                  />
                </div>
              </div>

              {/* Job Type, Work Mode, Location & Vacancies */}
              <div className="job-form-grid-4">
                <div className="field">
                  <label>Job Type</label>
                  <select
                    value={formData.jobType}
                    onChange={(e) => handleChange('jobType', e.target.value)}
                  >
                    <option value="FULL_TIME">Full-Time</option>
                    <option value="INTERNSHIP">Internship</option>
                    <option value="PART_TIME">Part-Time</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </div>

                <div className="field">
                  <label>Work Mode</label>
                  <select
                    value={formData.workMode}
                    onChange={(e) => handleChange('workMode', e.target.value)}
                  >
                    <option value="ON_SITE">On-Site</option>
                    <option value="HYBRID">Hybrid</option>
                    <option value="REMOTE">Remote</option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Location {formData.workMode !== 'REMOTE' && <span style={{ color: 'var(--red)' }}>*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder={formData.workMode === 'REMOTE' ? 'Optional (Remote)' : 'e.g. Surat, Mumbai'}
                    value={formData.location}
                    onChange={(e) => handleChange('location', e.target.value)}
                  />
                  {errors.location && <span className="field-error">{errors.location}</span>}
                </div>

                <div className="field">
                  <label>
                    Vacancies <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.vacancies}
                    onChange={(e) => handleChange('vacancies', e.target.value)}
                  />
                  {errors.vacancies && <span className="field-error">{errors.vacancies}</span>}
                </div>
              </div>

              {/* Unified Job Description & Responsibilities */}
              <div className="field">
                <label>
                  Job Description & Key Responsibilities <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <textarea
                  rows="6"
                  placeholder="Provide a comprehensive description of the role, including day-to-day responsibilities, expected deliverables, required tech stack or tools, team culture, and mentorship opportunities..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                  Combine the role overview, day-to-day responsibilities, and team expectations into this description.
                </span>
                {errors.description && <span className="field-error">{errors.description}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: COMPENSATION
            ======================================================== */}
        {activeTab === 'compensation' && (
          <div className="job-form-tab-pane">
            <div className="form-grid">
              <div className="job-form-grid-4">
                <div className="field">
                  <label>Min Salary / Pay</label>
                  <input
                    type="number"
                    placeholder="e.g. 500000"
                    value={formData.compensation.salaryMin}
                    onChange={(e) => handleCompensationChange('salaryMin', e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Max Salary / Pay</label>
                  <input
                    type="number"
                    placeholder="e.g. 800000"
                    value={formData.compensation.salaryMax}
                    onChange={(e) => handleCompensationChange('salaryMax', e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Pay Period</label>
                  <select
                    value={formData.compensation.salaryFormat}
                    onChange={(e) => handleCompensationChange('salaryFormat', e.target.value)}
                  >
                    <option value="PER_ANNUM">Per Annum (LPA)</option>
                    <option value="PER_MONTH">Per Month</option>
                    <option value="STIPEND">Stipend</option>
                  </select>
                </div>

                <div className="field">
                  <label>Currency</label>
                  <input
                    type="text"
                    value={formData.compensation.currency}
                    onChange={(e) => handleCompensationChange('currency', e.target.value)}
                  />
                </div>
              </div>

              {errors.compensation && (
                <span className="field-error" style={{ display: 'block' }}>
                  {errors.compensation}
                </span>
              )}

              <div className="field" style={{ marginTop: '12px' }}>
                <label>Additional Perks & Benefits (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Health Insurance, Relocation Allowance, Performance Bonus, Flexible Working Hours"
                  value={formData.compensation.additionalPerks}
                  onChange={(e) => handleCompensationChange('additionalPerks', e.target.value)}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                  Mention healthcare benefits, annual bonuses, flexible work privileges, or allowances.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 3: TARGET ELIGIBILITY
            ======================================================== */}
        {activeTab === 'eligibility' && (
          <div className="job-form-tab-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <strong style={{ fontSize: '0.94rem', color: 'var(--navy)' }}>Eligibility Mode</strong>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                  Choose whether this opportunity is open university-wide or restricted to specific criteria
                </p>
              </div>

              {/* Segmented Mode Selector */}
              <div className="eligibility-mode-pill-group">
                <button
                  type="button"
                  className={`eligibility-mode-pill ${formData.eligibilityMode === 'ALL_STUDENTS' ? 'active' : ''}`}
                  onClick={() => handleChange('eligibilityMode', 'ALL_STUDENTS')}
                >
                  All Students (Open)
                </button>
                <button
                  type="button"
                  className={`eligibility-mode-pill ${formData.eligibilityMode === 'RESTRICTED' ? 'active' : ''}`}
                  onClick={() => handleChange('eligibilityMode', 'RESTRICTED')}
                >
                  Restricted Criteria
                </button>
              </div>
            </div>

            {formData.eligibilityMode === 'ALL_STUDENTS' ? (
              <div
                style={{
                  padding: '20px 24px',
                  background: 'var(--teal-pale)',
                  border: '1px solid #c7e9ed',
                  borderRadius: '10px',
                  color: 'var(--navy)',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}
              >
                <CheckIcon size={24} color="var(--teal)" />
                <div>
                  <strong>University-Wide Open Drive:</strong> All registered and verified students across all
                  departments, courses, and graduation batches are eligible to view and apply for this job posting.
                </div>
              </div>
            ) : (
              <>
                {/* Searchable Checkbox Lists for Departments & Courses */}
                <div className="job-form-grid-2" style={{ marginBottom: '16px' }}>
                  {/* Column 1: Departments */}
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        Eligible Departments <span style={{ color: 'var(--red)' }}>*</span>
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 400 }}>
                        {isAllDepartments ? 'All faculties eligible' : `${selectedDeptIds.length} selected`}
                      </span>
                    </label>

                    <SearchableCheckboxList
                      title="Departments"
                      items={departments}
                      selectedIds={selectedDeptIds}
                      isAllSelected={isAllDepartments}
                      onToggleAll={handleToggleAllDepartments}
                      onToggleItem={handleToggleDepartment}
                      onSelectAllVisible={handleSelectAllDepartments}
                      onClearAll={handleClearAllDepartments}
                      allLabel="All Departments"
                      allSubLabel="Allow students from all university faculties"
                      searchPlaceholder="Search departments by name or code..."
                      emptyText="No departments found"
                      loading={loadingLookups}
                      error={lookupError}
                      badgeKey="code"
                    />
                    {errors.departments && <span className="field-error">{errors.departments}</span>}
                  </div>

                  {/* Column 2: Courses */}
                  <div className="field" style={{ margin: 0 }}>
                    <label style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        Eligible Courses / Degrees <span style={{ color: 'var(--red)' }}>*</span>
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--muted)', fontWeight: 400 }}>
                        {isAllCourses ? 'All courses eligible' : `${selectedCourseIds.length} selected`}
                      </span>
                    </label>

                    <SearchableCheckboxList
                      title="Courses"
                      items={availableCourses}
                      selectedIds={selectedCourseIds}
                      isAllSelected={isAllCourses}
                      onToggleAll={handleToggleAllCourses}
                      onToggleItem={handleToggleCourse}
                      onSelectAllVisible={handleSelectAllCourses}
                      onClearAll={handleClearAllCourses}
                      allLabel="All Courses"
                      allSubLabel={
                        isAllDepartments
                          ? 'All courses across all departments'
                          : 'All courses belonging to selected departments'
                      }
                      searchPlaceholder="Search courses by name or level..."
                      emptyText={
                        !isAllDepartments && selectedDeptIds.length === 0
                          ? 'Please select at least one department on the left to view courses.'
                          : 'No courses found for selected departments.'
                      }
                      loading={loadingLookups}
                      error={lookupError}
                      disabled={!isAllDepartments && selectedDeptIds.length === 0}
                      badgeKey="code"
                    />
                    {errors.courses && <span className="field-error">{errors.courses}</span>}
                  </div>
                </div>

                {/* Academic Cutoffs & Skills Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginTop: '12px'
                  }}
                >
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--navy)' }}>
                    Academic Cutoffs, Batches & Naandi Verification
                  </h4>

                  <div className="job-form-grid-3" style={{ marginBottom: '14px' }}>
                    <div className="field">
                      <label>Minimum CGPA</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        placeholder="0.0 - 10.0 (0 for none)"
                        value={formData.eligibilityCriteria.minCgpa}
                        onChange={(e) => handleCriteriaChange('minCgpa', e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Max Backlogs Allowed</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0 (leave empty for any)"
                        value={formData.eligibilityCriteria.maxActiveBacklogs}
                        onChange={(e) => handleCriteriaChange('maxActiveBacklogs', e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Eligible Passing Batches</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {passingYearOptions.map((yr) => {
                          const active = (formData.eligibilityCriteria.allowedPassingYears || []).includes(yr);
                          return (
                            <button
                              key={yr}
                              type="button"
                              className={`passing-year-chip ${active ? 'active' : ''}`}
                              onClick={() => handleTogglePassingYear(yr)}
                            >
                              {active ? `✓ ${yr}` : yr}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Mandatory Naandi Training Checkbox */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      marginBottom: '14px'
                    }}
                  >
                    <label
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        margin: 0
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.eligibilityCriteria.requiresNaandiTraining}
                        onChange={(e) => handleCriteriaChange('requiresNaandiTraining', e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--teal)', marginTop: '2px' }}
                      />
                      <div>
                        <strong style={{ fontSize: '0.86rem', color: 'var(--navy)' }}>
                          Require Mandatory Naandi Training Completion
                        </strong>
                        <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--muted)' }}>
                          Only students whose Naandi Training certificate or training completion has been verified
                          authoritatively by the Placement Cell will be eligible.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Skills Grid */}
                  <div className="job-form-grid-2">
                    <div className="field">
                      <label>Required Skills (comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. JavaScript, React, Node.js, SQL"
                        value={formData.eligibilityCriteria.requiredSkills}
                        onChange={(e) => handleCriteriaChange('requiredSkills', e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Preferred Skills (comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Docker, AWS, TypeScript, Git"
                        value={formData.eligibilityCriteria.preferredSkills}
                        onChange={(e) => handleCriteriaChange('preferredSkills', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 4: HIRING PROCESS & PUBLISHING
            ======================================================== */}
        {activeTab === 'hiring' && (
          <div className="job-form-tab-pane">
            <div className="form-grid">
              {/* Selection Stages Builder */}
              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Hiring & Selection Stages</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="e.g. Coding Assessment, Technical Interview, HR Round"
                    value={newSelectionStep}
                    onChange={(e) => setNewSelectionStep(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSelectionStep();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleAddSelectionStep}
                    style={{ flexShrink: 0 }}
                  >
                    <PlusIcon size={16} /> Add Stage
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {formData.selectionProcess.map((step, idx) => (
                    <span
                      key={idx}
                      className="badge neutral"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        fontSize: '0.82rem'
                      }}
                    >
                      <b>{idx + 1}.</b> {step}
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectionStep(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--red)',
                          display: 'grid',
                          placeItems: 'center'
                        }}
                        title="Remove stage"
                      >
                        <XIcon size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Deadline & Publish Status */}
              <div className="job-form-grid-2">
                <div className="field">
                  <label>
                    Application Deadline <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.deadline}
                    onChange={(e) => handleChange('deadline', e.target.value)}
                  />
                  {errors.deadline && <span className="field-error">{errors.deadline}</span>}
                </div>

                {!isEdit ? (
                  <div className="field">
                    <label>Publish Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => handleChange('status', e.target.value)}
                    >
                      <option value="OPEN">Open (Accepting Applications Immediately)</option>
                      <option value="DRAFT">Draft (Save privately for later)</option>
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label>Current Status</label>
                    <input type="text" value={formData.status} disabled />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions Footer with Tab Navigation */}
        <div
          className="modal-actions"
          style={{
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            {activeTab !== 'basic' && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (activeTab === 'hiring') setActiveTab('eligibility');
                  else if (activeTab === 'eligibility') setActiveTab('compensation');
                  else if (activeTab === 'compensation') setActiveTab('basic');
                }}
              >
                ← Back
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>

            {activeTab !== 'hiring' ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (activeTab === 'basic') setActiveTab('compensation');
                  else if (activeTab === 'compensation') setActiveTab('eligibility');
                  else if (activeTab === 'eligibility') setActiveTab('hiring');
                }}
              >
                Next Step →
              </button>
            ) : null}

            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving Job Posting…' : isEdit ? 'Save Changes' : 'Publish Job Posting'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
