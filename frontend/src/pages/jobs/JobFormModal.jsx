import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { companyService } from '../../services/company.service.js';
import {
  XIcon,
  PlusIcon,
  SearchIcon,
  CheckIcon,
  AlertCircleIcon,
  TrashIcon,
  RefreshCwIcon
} from '../../components/common/Icons.jsx';
import {
  getJobTypeLabel,
  getWorkModeLabel,
  formatDate
} from '../../utils/job-helpers.js';

const DEFAULT_FORM = {
  companyId: '',
  title: '',
  category: 'Software Engineering',
  jobType: 'FULL_TIME',
  workMode: 'ON_SITE',
  location: 'Surat, Gujarat',
  vacancies: 1,
  description: '',
  responsibilities: [''],
  compensation: {
    salaryMin: '',
    salaryMax: '',
    currency: 'INR',
    salaryFormat: 'PER_ANNUM',
    additionalPerks: ''
  },
  selectionProcess: ['Resume Screening', 'Technical Assessment', 'HR Interview'],
  eligibilityMode: 'ALL_STUDENTS',
  eligibilityCriteria: {
    allowedDepartmentIds: [],
    allowedCourseIds: [],
    allowedPassingYears: [], // Default to unrestricted passing years
    minCgpa: 6.0,
    maxActiveBacklogs: 0,
    requiredSkills: '',
    preferredSkills: '',
    requiresNaandiTraining: true
  },
  deadline: '',
  status: 'OPEN'
};

const STEPS = [
  { id: 'info', num: 1, title: 'Job Information' },
  { id: 'compensation', num: 2, title: 'Compensation' },
  { id: 'eligibility', num: 3, title: 'Student Eligibility' },
  { id: 'hiring', num: 4, title: 'Hiring & Review' }
];

export function JobFormModal({
  isOpen,
  onClose,
  job,
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

  // Step state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Form Data
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
  const [selectedDegreeLevel, setSelectedDegreeLevel] = useState('ALL'); // 'ALL' | 'UG' | 'PG'
  const [deptSearch, setDeptSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');

  // Passing Year Eligibility State
  const currentYear = new Date().getFullYear();
  const [passingYearMode, setPassingYearMode] = useState('ANY'); // 'ANY' | 'SELECTED'
  const [availablePassingYears, setAvailablePassingYears] = useState(() =>
    Array.from({ length: 8 }, (_, i) => currentYear - 3 + i)
  );
  const [customYearInput, setCustomYearInput] = useState('');

  // Fetch departments, courses, and companies with retry support
  const loadLookups = useCallback(async () => {
    try {
      setLoadingLookups(true);
      setLookupError(null);
      const [deptRes, courseRes] = await Promise.all([
        departmentService.listDepartments({ limit: 100 }),
        courseService.listCourses({ limit: 100 })
      ]);

      const deptList = deptRes?.items || deptRes?.departments || (Array.isArray(deptRes) ? deptRes : []);
      const courseList = courseRes?.items || courseRes?.courses || (Array.isArray(courseRes) ? courseRes : []);
      setDepartments(Array.isArray(deptList) ? deptList : []);
      setCourses(Array.isArray(courseList) ? courseList : []);

      if (isAdmin && !isEdit) {
        const compRes = await companyService.listCompanies({ limit: 100 });
        const compList = compRes?.companies || compRes?.items || (Array.isArray(compRes) ? compRes : []);
        setCompanies(Array.isArray(compList) ? compList : []);
      }
    } catch (err) {
      console.error('Failed to load lookup data:', err);
      setLookupError('Failed to load departments and courses. Please check connection and click Retry.');
    } finally {
      setLoadingLookups(false);
    }
  }, [isAdmin, isEdit]);

  useEffect(() => {
    if (!isOpen) return;
    loadLookups();
  }, [isOpen, loadLookups]);

  // Reset or initialize on modal open
  useEffect(() => {
    if (!isOpen) return;

    setCurrentStepIndex(0);
    setErrors({});
    setDeptSearch('');
    setCourseSearch('');
    setCustomYearInput('');

    if (job) {
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
      const savedPassingYears = (crit.allowedPassingYears || []).map(Number).filter(Boolean);

      const hasDeptRestrictions = savedDeptIds.length > 0;
      const hasCourseRestrictions = savedCourseIds.length > 0;
      const hasYearRestrictions = savedPassingYears.length > 0;

      setIsAllDepartments(!hasDeptRestrictions);
      setSelectedDeptIds(savedDeptIds);
      setIsAllCourses(!hasCourseRestrictions);
      setSelectedCourseIds(savedCourseIds);
      setSelectedDegreeLevel('ALL');

      if (hasYearRestrictions) {
        setPassingYearMode('SELECTED');
        setAvailablePassingYears((prev) =>
          Array.from(new Set([...prev, ...savedPassingYears])).sort((a, b) => a - b)
        );
      } else {
        setPassingYearMode('ANY');
      }

      // Normalize responsibilities to array of strings
      let initialResponsibilities = [''];
      if (Array.isArray(job.responsibilities) && job.responsibilities.length > 0) {
        initialResponsibilities = [...job.responsibilities];
      } else if (typeof job.responsibilities === 'string' && job.responsibilities.trim()) {
        initialResponsibilities = job.responsibilities
          .split('\n')
          .map((r) => r.trim().replace(/^[-*•]\s*/, ''))
          .filter(Boolean);
        if (initialResponsibilities.length === 0) initialResponsibilities = [''];
      }

      setFormData({
        companyId: job.companyId?._id || job.companyId || '',
        title: job.title || '',
        category: job.category || 'Software Engineering',
        jobType: job.jobType || 'FULL_TIME',
        workMode: job.workMode || 'ON_SITE',
        location: job.location || '',
        vacancies: job.vacancies || 1,
        description: job.description || '',
        responsibilities: initialResponsibilities,
        compensation: {
          salaryMin: job.compensation?.salaryMin ?? '',
          salaryMax: job.compensation?.salaryMax ?? '',
          currency: job.compensation?.currency || 'INR',
          salaryFormat: job.compensation?.salaryFormat || 'PER_ANNUM',
          additionalPerks: job.compensation?.additionalPerks || ''
        },
        selectionProcess: Array.isArray(job.selectionProcess) ? [...job.selectionProcess] : [],
        eligibilityMode: job.eligibilityMode || (hasDeptRestrictions || hasCourseRestrictions || hasYearRestrictions ? 'RESTRICTED' : 'ALL_STUDENTS'),
        eligibilityCriteria: {
          allowedDepartmentIds: savedDeptIds,
          allowedCourseIds: savedCourseIds,
          allowedPassingYears: savedPassingYears,
          minCgpa: crit.minCgpa ?? 0,
          maxActiveBacklogs: crit.maxActiveBacklogs ?? '',
          requiredSkills: Array.isArray(crit.requiredSkills) ? crit.requiredSkills.join(', ') : '',
          preferredSkills: Array.isArray(crit.preferredSkills) ? crit.preferredSkills.join(', ') : '',
          requiresNaandiTraining: true
        },
        deadline: formattedDeadline,
        status: job.status || 'DRAFT'
      });
    } else {
      const future = new Date();
      future.setDate(future.getDate() + 14);
      future.setHours(23, 59, 0, 0);

      setIsAllDepartments(true);
      setSelectedDeptIds([]);
      setIsAllCourses(true);
      setSelectedCourseIds([]);
      setSelectedDegreeLevel('ALL');
      setPassingYearMode('ANY');

      setFormData({
        ...DEFAULT_FORM,
        responsibilities: [''],
        eligibilityMode: 'ALL_STUDENTS',
        deadline: future.toISOString().slice(0, 16)
      });
    }
  }, [isOpen, job]);

  // Form field changes
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

  // Passing Year Mode & Selection Handlers
  const handlePassingYearModeChange = (mode) => {
    setPassingYearMode(mode);
    if (mode === 'ANY') {
      handleCriteriaChange('allowedPassingYears', []);
    } else if (mode === 'SELECTED') {
      const existing = formData.eligibilityCriteria.allowedPassingYears || [];
      if (existing.length === 0) {
        handleCriteriaChange('allowedPassingYears', [currentYear]);
      }
    }
    if (errors.passingYears) {
      setErrors((prev) => ({ ...prev, passingYears: null }));
    }
  };

  const handleTogglePassingYear = (year) => {
    const current = formData.eligibilityCriteria.allowedPassingYears || [];
    const exists = current.includes(year);
    const updated = exists ? current.filter((y) => y !== year) : [...current, year];
    handleCriteriaChange('allowedPassingYears', updated);
    if (errors.passingYears) {
      setErrors((prev) => ({ ...prev, passingYears: null }));
    }
  };

  const handleAddCustomYear = () => {
    const y = parseInt(customYearInput.trim(), 10);
    if (!y || isNaN(y) || y < 1990 || y > 2100) {
      setErrors((prev) => ({ ...prev, passingYears: 'Enter a valid graduation year between 1990 and 2100.' }));
      return;
    }
    setAvailablePassingYears((prev) => Array.from(new Set([...prev, y])).sort((a, b) => a - b));
    const current = formData.eligibilityCriteria.allowedPassingYears || [];
    if (!current.includes(y)) {
      handleCriteriaChange('allowedPassingYears', [...current, y]);
    }
    setCustomYearInput('');
    if (errors.passingYears) {
      setErrors((prev) => ({ ...prev, passingYears: null }));
    }
  };

  // Repeatable responsibility items handlers
  const handleResponsibilityChange = (index, value) => {
    setFormData((prev) => {
      const updated = [...prev.responsibilities];
      updated[index] = value;
      return { ...prev, responsibilities: updated };
    });
    if (errors.responsibilities) {
      setErrors((prev) => ({ ...prev, responsibilities: null }));
    }
  };

  const handleAddResponsibility = () => {
    setFormData((prev) => ({
      ...prev,
      responsibilities: [...prev.responsibilities, '']
    }));
  };

  const handleRemoveResponsibility = (index) => {
    setFormData((prev) => {
      const updated = prev.responsibilities.filter((_, i) => i !== index);
      return { ...prev, responsibilities: updated.length > 0 ? updated : [''] };
    });
  };

  // Selection process stage actions
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

  // Department selection handlers
  const handleToggleAllDepartments = (checked) => {
    if (checked) {
      setIsAllDepartments(true);
      setSelectedDeptIds([]);
      setIsAllCourses(true);
      setSelectedCourseIds([]);
      setSelectedDegreeLevel('ALL');
    } else {
      setIsAllDepartments(false);
      setSelectedDeptIds([]);
      setIsAllCourses(false);
      setSelectedCourseIds([]);
    }
    if (errors.departments) {
      setErrors((prev) => ({ ...prev, departments: null }));
    }
  };

  const handleToggleDepartment = (deptId, checked) => {
    const idStr = String(deptId);
    let nextDepts = [];

    if (isAllDepartments) {
      if (!checked) {
        nextDepts = departments
          .filter((d) => String(d._id) !== idStr)
          .map((d) => String(d._id));
        setIsAllDepartments(false);
        setSelectedDeptIds(nextDepts);
      }
      return;
    }

    if (checked) {
      nextDepts = Array.from(new Set([...selectedDeptIds, idStr]));
      if (departments.length > 0 && nextDepts.length === departments.length) {
        setIsAllDepartments(true);
        setSelectedDeptIds([]);
      } else {
        setSelectedDeptIds(nextDepts);
      }
    } else {
      nextDepts = selectedDeptIds.filter((id) => id !== idStr);
      setSelectedDeptIds(nextDepts);

      // Clean up orphaned course selections
      if (!isAllCourses) {
        setSelectedCourseIds((prev) =>
          prev.filter((cId) => {
            const courseObj = courses.find((c) => String(c._id) === String(cId));
            const cDeptId = String(courseObj?.departmentId?._id || courseObj?.departmentId || '');
            return nextDepts.includes(cDeptId);
          })
        );
      }
    }

    if (errors.departments) {
      setErrors((prev) => ({ ...prev, departments: null }));
    }
  };

  // Filtered courses based on selected departments
  const availableCourses = useMemo(() => {
    if (isAllDepartments) return courses;
    return courses.filter((c) => {
      const dId = String(c.departmentId?._id || c.departmentId || '');
      return selectedDeptIds.includes(dId);
    });
  }, [courses, isAllDepartments, selectedDeptIds]);

  // Course degree level helpers
  const isUndergradCourse = (course) => {
    const lvl = String(course?.level || '').toUpperCase();
    return lvl === 'UNDERGRADUATE' || lvl === 'UG';
  };

  const isPostgradCourse = (course) => {
    const lvl = String(course?.level || '').toUpperCase();
    return lvl === 'POSTGRADUATE' || lvl === 'PG';
  };

  // Course selection handlers
  const handleToggleAllCourses = (checked) => {
    if (checked) {
      setIsAllCourses(true);
      setSelectedCourseIds([]);
      setSelectedDegreeLevel('ALL');
    } else {
      setIsAllCourses(false);
      setSelectedCourseIds([]);
    }
    if (errors.courses) {
      setErrors((prev) => ({ ...prev, courses: null }));
    }
  };

  const handleToggleCourse = (courseId, checked) => {
    const idStr = String(courseId);

    if (isAllCourses) {
      if (!checked) {
        const remaining = availableCourses
          .filter((c) => String(c._id) !== idStr)
          .map((c) => String(c._id));
        setIsAllCourses(false);
        setSelectedCourseIds(remaining);
      }
      return;
    }

    if (checked) {
      const updated = Array.from(new Set([...selectedCourseIds, idStr]));
      if (availableCourses.length > 0 && updated.length >= availableCourses.length) {
        setIsAllCourses(true);
        setSelectedCourseIds([]);
      } else {
        setSelectedCourseIds(updated);
      }
    } else {
      setSelectedCourseIds((prev) => prev.filter((id) => id !== idStr));
    }

    if (errors.courses) {
      setErrors((prev) => ({ ...prev, courses: null }));
    }
  };

  const handleSelectDegreeLevel = (level) => {
    setSelectedDegreeLevel(level);

    if (level === 'ALL') {
      setIsAllCourses(true);
      setSelectedCourseIds([]);
    } else if (level === 'UG') {
      setIsAllCourses(false);
      const ugIds = availableCourses.filter(isUndergradCourse).map((c) => String(c._id));
      setSelectedCourseIds(ugIds);
    } else if (level === 'PG') {
      setIsAllCourses(false);
      const pgIds = availableCourses.filter(isPostgradCourse).map((c) => String(c._id));
      setSelectedCourseIds(pgIds);
    }

    if (errors.courses) {
      setErrors((prev) => ({ ...prev, courses: null }));
    }
  };

  // Filtered lists for search
  const filteredDepartments = useMemo(() => {
    if (!deptSearch.trim()) return departments;
    const q = deptSearch.toLowerCase().trim();
    return departments.filter(
      (d) =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.code || '').toLowerCase().includes(q)
    );
  }, [departments, deptSearch]);

  const filteredCourses = useMemo(() => {
    let list = availableCourses;

    if (selectedDegreeLevel === 'UG') {
      list = list.filter(isUndergradCourse);
    } else if (selectedDegreeLevel === 'PG') {
      list = list.filter(isPostgradCourse);
    }

    if (!courseSearch.trim()) return list;
    const q = courseSearch.toLowerCase().trim();
    return list.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.level || '').toLowerCase().includes(q)
    );
  }, [availableCourses, selectedDegreeLevel, courseSearch]);

  // Step-by-Step Validation
  const validateStep = (stepIdx, targetStatus = formData.status) => {
    const newErrors = {};

    if (stepIdx === 0) {
      if (!formData.title?.trim()) {
        newErrors.title = 'Job title is required (minimum 2 characters).';
      } else if (formData.title.trim().length < 2) {
        newErrors.title = 'Job title must be at least 2 characters.';
      }

      if (!formData.category?.trim()) {
        newErrors.category = 'Job Category / Domain is required.';
      }

      if (!formData.description?.trim()) {
        newErrors.description = 'Job description is required (minimum 10 characters).';
      } else if (formData.description.trim().length < 10) {
        newErrors.description = 'Job description must be at least 10 characters.';
      }

      // Validate repeatable responsibilities
      const cleanedResp = (formData.responsibilities || [])
        .map((r) => (typeof r === 'string' ? r.trim() : ''))
        .filter(Boolean);
      if (cleanedResp.length === 0) {
        newErrors.responsibilities = 'At least one job responsibility is required.';
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
        newErrors.companyId = 'Please select a recruiting company profile.';
      }
    } else if (stepIdx === 1) {
      const minSal = formData.compensation.salaryMin !== '' && formData.compensation.salaryMin !== null ? Number(formData.compensation.salaryMin) : null;
      const maxSal = formData.compensation.salaryMax !== '' && formData.compensation.salaryMax !== null ? Number(formData.compensation.salaryMax) : null;

      if (minSal !== null && minSal < 0) {
        newErrors.compensation = 'Minimum salary must be nonnegative.';
      } else if (maxSal !== null && maxSal < 0) {
        newErrors.compensation = 'Maximum salary must be nonnegative.';
      } else if (minSal !== null && maxSal !== null && maxSal < minSal) {
        newErrors.compensation = 'Maximum salary cannot be less than minimum salary.';
      }
    } else if (stepIdx === 2) {
      if (formData.eligibilityMode === 'RESTRICTED') {
        if (!isAllDepartments && selectedDeptIds.length === 0) {
          newErrors.departments = 'Select at least one department or choose "Select All Departments".';
        }
        if (!isAllCourses && selectedCourseIds.length === 0) {
          newErrors.courses = 'Select at least one course or choose "Select All Courses".';
        }
        if (passingYearMode === 'SELECTED') {
          const years = formData.eligibilityCriteria.allowedPassingYears || [];
          if (years.length === 0) {
            newErrors.passingYears = 'Please select at least one passing year or switch to "Any Passing Year".';
          }
        }
      }
    } else if (stepIdx === 3) {
      if (!formData.deadline) {
        newErrors.deadline = 'Application deadline is required.';
      } else {
        const d = new Date(formData.deadline);
        if (isNaN(d.getTime())) {
          newErrors.deadline = 'Please enter a valid deadline.';
        } else if (targetStatus === 'OPEN' && d <= new Date()) {
          newErrors.deadline = 'Deadline must be in the future for an active job.';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStepIndex)) return;
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleStepClick = (idx) => {
    if (idx < currentStepIndex || validateStep(currentStepIndex)) {
      setCurrentStepIndex(idx);
    }
  };

  // Full validation before save
  const validateAll = (targetStatus = formData.status) => {
    for (let i = 0; i < STEPS.length; i++) {
      if (!validateStep(i, targetStatus)) {
        setCurrentStepIndex(i);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e, overrideStatus) => {
    if (e && e.preventDefault) e.preventDefault();
    const finalStatus = overrideStatus || (isEdit ? formData.status : 'OPEN');

    if (!validateAll(finalStatus)) return;

    try {
      setSaving(true);
      const crit = formData.eligibilityCriteria;
      const parseSkills = (str) =>
        str ? str.split(',').map((s) => s.trim()).filter(Boolean) : [];

      const payloadAllowedDeptIds =
        formData.eligibilityMode === 'ALL_STUDENTS' || isAllDepartments
          ? []
          : selectedDeptIds;

      const payloadAllowedCourseIds =
        formData.eligibilityMode === 'ALL_STUDENTS' || isAllCourses
          ? []
          : selectedCourseIds;

      const payloadAllowedPassingYears =
        formData.eligibilityMode === 'ALL_STUDENTS' || passingYearMode === 'ANY'
          ? []
          : (crit.allowedPassingYears || []);

      const cleanedResponsibilities = (formData.responsibilities || [])
        .map((r) => (typeof r === 'string' ? r.trim() : ''))
        .filter(Boolean);

      const payload = {
        title: formData.title.trim(),
        category: formData.category?.trim() || undefined,
        jobType: formData.jobType,
        workMode: formData.workMode,
        location: formData.location?.trim() || undefined,
        vacancies: Number(formData.vacancies),
        description: formData.description.trim(),
        responsibilities: cleanedResponsibilities,
        compensation: {
          salaryMin: formData.compensation.salaryMin !== '' && formData.compensation.salaryMin !== null ? Number(formData.compensation.salaryMin) : undefined,
          salaryMax: formData.compensation.salaryMax !== '' && formData.compensation.salaryMax !== null ? Number(formData.compensation.salaryMax) : undefined,
          currency: formData.compensation.currency || 'INR',
          salaryFormat: formData.compensation.salaryFormat || 'PER_ANNUM',
          additionalPerks: formData.compensation.additionalPerks?.trim() || undefined
        },
        selectionProcess: formData.selectionProcess,
        eligibilityMode: formData.eligibilityMode,
        eligibilityCriteria: {
          allowedDepartmentIds: payloadAllowedDeptIds,
          allowedCourseIds: payloadAllowedCourseIds,
          allowedPassingYears: payloadAllowedPassingYears,
          minCgpa: Number(crit.minCgpa || 0),
          maxActiveBacklogs: crit.maxActiveBacklogs !== '' && crit.maxActiveBacklogs !== null ? Number(crit.maxActiveBacklogs) : null,
          requiredSkills: parseSkills(crit.requiredSkills),
          preferredSkills: parseSkills(crit.preferredSkills),
          requiresNaandiTraining: true // University mandatory policy - fail-closed authoritative
        },
        deadline: new Date(formData.deadline).toISOString(),
        status: isEdit ? (formData.status || 'DRAFT') : finalStatus
      };

      if (isAdmin && !isEdit && formData.companyId) {
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

  // Safe Close confirmation if dirty
  const handleSafeClose = () => {
    const isDirty =
      Boolean(formData.title.trim()) ||
      Boolean(formData.description.trim()) ||
      formData.responsibilities.some((r) => r && r.trim());

    if (isDirty && !window.confirm('You have unsaved changes in this form. Are you sure you want to discard them and close?')) {
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

  const cleanedRespCount = (formData.responsibilities || [])
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .filter(Boolean).length;

  return (
    <Modal isOpen={isOpen} onClose={handleSafeClose} maxWidth="860px">
      <div className="job-modal-header" style={{ marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--ink)' }}>
          {isEdit ? `Edit Job Posting: ${job?.jobId || ''}` : 'Create New Job Posting'}
        </h2>
      </div>

      {errors.submit && (
        <div className="notice error" style={{ marginBottom: '16px' }}>
          <AlertCircleIcon size={16} /> {errors.submit}
        </div>
      )}

      {/* 4-Step Wizard Stepper Bar */}
      <div className="job-wizard-stepper">
        {STEPS.map((step, idx) => {
          const isActive = currentStepIndex === idx;
          const isCompleted = currentStepIndex > idx;
          return (
            <React.Fragment key={step.id}>
              <button
                type="button"
                className={`job-wizard-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => handleStepClick(idx)}
              >
                <span className="job-wizard-step-num">
                  {isCompleted ? '✓' : step.num}
                </span>
                <span>{step.title}</span>
              </button>
              {idx < STEPS.length - 1 && <div className="job-wizard-step-divider" />}
            </React.Fragment>
          );
        })}
      </div>

      <form onSubmit={(e) => handleSubmit(e)}>
        {/* ========================================================
            STEP 1: JOB INFORMATION
            ======================================================== */}
        {currentStepIndex === 0 && (
          <div className="job-form-tab-pane">
            <div className="form-grid">
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
                    placeholder="e.g. Graduate Software Engineer, Business Analyst"
                    value={formData.title}
                    onChange={(e) => handleChange('title', e.target.value)}
                  />
                  {errors.title && <span className="field-error">{errors.title}</span>}
                </div>

                <div className="field">
                  <label>
                    Job Category / Domain <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Software Engineering, Data & Analytics, Finance"
                    value={formData.category}
                    onChange={(e) => handleChange('category', e.target.value)}
                  />
                  {errors.category && <span className="field-error">{errors.category}</span>}
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
                    placeholder={formData.workMode === 'REMOTE' ? 'Remote / Anywhere' : 'e.g. Surat, Mumbai'}
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

              {/* Separate Job Description */}
              <div className="field">
                <label>
                  Job Description & Role Overview <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <textarea
                  rows="4"
                  placeholder="Provide an overview of the role, team context, and candidate expectations..."
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                />
                {errors.description && <span className="field-error">{errors.description}</span>}
              </div>

              {/* Separate Job Responsibilities - Repeatable List */}
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0 }}>
                    Job Responsibilities & Deliverables <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <button
                    type="button"
                    className="ghost"
                    onClick={handleAddResponsibility}
                    style={{ fontSize: '0.8rem', padding: '3px 8px', height: '28px', color: 'var(--teal)' }}
                  >
                    <PlusIcon size={13} /> Add Responsibility
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '8px' }}>
                  Specify individual day-to-day duties, project deliverables, and team expectations.
                </div>

                <div className="job-resp-builder">
                  {formData.responsibilities.map((resp, index) => (
                    <div key={index} className="job-resp-row">
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--muted)', width: '22px' }}>
                        {index + 1}.
                      </span>
                      <input
                        type="text"
                        placeholder={`e.g. ${index === 0 ? 'Develop full-stack web applications using Node.js & React' : 'Write comprehensive unit tests and automated regression suites'}`}
                        value={resp}
                        onChange={(e) => handleResponsibilityChange(index, e.target.value)}
                      />
                      <button
                        type="button"
                        className="job-resp-remove-btn"
                        onClick={() => handleRemoveResponsibility(index)}
                        disabled={formData.responsibilities.length <= 1}
                        title="Remove responsibility"
                        aria-label="Remove responsibility"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {errors.responsibilities && (
                  <span className="field-error" style={{ marginTop: '6px', display: 'block' }}>
                    {errors.responsibilities}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 2: COMPENSATION & BENEFITS
            ======================================================== */}
        {currentStepIndex === 1 && (
          <div className="job-form-tab-pane">
            <div className="form-grid">
              <div className="job-form-grid-4">
                <div className="field">
                  <label>Minimum Pay / Salary</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 500000"
                    value={formData.compensation.salaryMin}
                    onChange={(e) => handleCompensationChange('salaryMin', e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Maximum Pay / Salary</label>
                  <input
                    type="number"
                    min="0"
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

              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '-6px', marginBottom: '8px' }}>
                Note: Leave salary fields blank if compensation is undisclosed or will be determined upon interview.
              </div>

              <div className="field">
                <label>Additional Perks & Benefits</label>
                <textarea
                  rows="3"
                  placeholder="e.g. Health insurance, performance bonus, PF, free meals, transport assistance..."
                  value={formData.compensation.additionalPerks}
                  onChange={(e) => handleCompensationChange('additionalPerks', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 3: STUDENT ELIGIBILITY
            ======================================================== */}
        {currentStepIndex === 2 && (
          <div className="job-form-tab-pane">
            {lookupError && (
              <div className="notice error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span>{lookupError}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={loadLookups}
                  style={{ height: '28px', padding: '0 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCwIcon size={12} /> Retry
                </button>
              </div>
            )}

            {/* 1. Student Eligibility Scope — 50/50 Equal-Width Segmented Selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '8px' }}>
                Student Eligibility Scope <span style={{ color: 'var(--red)' }}>*</span>
              </label>

              <div className="eligibility-scope-segmented" role="tablist" aria-label="Student Eligibility Scope">
                <button
                  type="button"
                  role="tab"
                  id="tab-eligibility-all"
                  aria-selected={formData.eligibilityMode === 'ALL_STUDENTS'}
                  className={`eligibility-scope-tab ${formData.eligibilityMode === 'ALL_STUDENTS' ? 'active' : ''}`}
                  onClick={() => handleChange('eligibilityMode', 'ALL_STUDENTS')}
                >
                  {formData.eligibilityMode === 'ALL_STUDENTS' && <CheckIcon size={16} color="var(--teal)" />}
                  <span>Open to All Students</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  id="tab-eligibility-restricted"
                  aria-selected={formData.eligibilityMode === 'RESTRICTED'}
                  className={`eligibility-scope-tab ${formData.eligibilityMode === 'RESTRICTED' ? 'active' : ''}`}
                  onClick={() => handleChange('eligibilityMode', 'RESTRICTED')}
                >
                  {formData.eligibilityMode === 'RESTRICTED' && <CheckIcon size={16} color="var(--teal)" />}
                  <span>Restricted Criteria</span>
                </button>
              </div>

              {/* Short Explanation Banner */}
              <div className={`eligibility-scope-banner ${formData.eligibilityMode === 'ALL_STUDENTS' ? 'all-students' : 'restricted'}`}>
                {formData.eligibilityMode === 'ALL_STUDENTS' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckIcon size={16} color="var(--teal)" />
                    <span>
                      <strong>Institution-Wide Drive:</strong> All registered students across all departments, courses, and passing batches are eligible to apply without department restrictions.
                    </span>
                  </div>
                ) : (
                  <div>
                    <strong>Restricted Criteria Drive:</strong> Candidates must meet the explicitly selected departments, courses, passing batches, and academic cutoffs configured below.
                  </div>
                )}
              </div>
            </div>

            {/* Display department, course, and passing-year restrictions ONLY when "Restricted Criteria" is selected */}
            {formData.eligibilityMode === 'RESTRICTED' && (
              <>
                {/* Department Checklist Card */}
                <div
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isAllDepartments}
                        onChange={(e) => handleToggleAllDepartments(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                      />
                      <span>Select All Departments</span>
                    </label>

                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {isAllDepartments ? 'All departments eligible' : `${selectedDeptIds.length} of ${departments.length} departments selected`}
                    </span>
                  </div>

                  {/* Search Departments */}
                  <div className="dept-search-bar" style={{ marginBottom: '10px' }}>
                    <SearchIcon size={14} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search departments..."
                      value={deptSearch}
                      onChange={(e) => setDeptSearch(e.target.value)}
                    />
                    {deptSearch && (
                      <button
                        type="button"
                        onClick={() => setDeptSearch('')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--muted)'
                        }}
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </div>

                  {errors.departments && <div className="field-error" style={{ marginBottom: '8px' }}>{errors.departments}</div>}

                  {/* Departments Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: '8px',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      paddingRight: '4px'
                    }}
                  >
                    {loadingLookups ? (
                      <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>Loading departments...</span>
                    ) : filteredDepartments.length === 0 ? (
                      <span style={{ fontSize: '0.84rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                        No departments found.
                      </span>
                    ) : (
                      filteredDepartments.map((dept) => {
                        const isChecked = isAllDepartments || selectedDeptIds.includes(String(dept._id));
                        return (
                          <label
                            key={dept._id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer',
                              fontSize: '0.84rem',
                              color: 'var(--ink)',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              background: isChecked ? '#f1f5f9' : 'transparent',
                              margin: 0
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleToggleDepartment(dept._id, e.target.checked)}
                              style={{ width: '15px', height: '15px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                            />
                            <span style={{ fontWeight: 600 }}>{dept.code}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dept.name}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Course Checklist Card (Filtered by selected departments) */}
                <div
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                    background: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isAllCourses}
                        onChange={(e) => handleToggleAllCourses(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--teal)', cursor: 'pointer' }}
                      />
                      <span>Select All Courses</span>
                    </label>

                    {/* Degree Level Filter Chips */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className={`level-pill ${selectedDegreeLevel === 'ALL' ? 'active' : ''}`}
                        onClick={() => handleSelectDegreeLevel('ALL')}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`level-pill ${selectedDegreeLevel === 'UG' ? 'active' : ''}`}
                        onClick={() => handleSelectDegreeLevel('UG')}
                      >
                        UG
                      </button>
                      <button
                        type="button"
                        className={`level-pill ${selectedDegreeLevel === 'PG' ? 'active' : ''}`}
                        onClick={() => handleSelectDegreeLevel('PG')}
                      >
                        PG
                      </button>
                    </div>
                  </div>

                  {/* Course Search Bar */}
                  <div className="dept-search-bar" style={{ marginBottom: '10px' }}>
                    <SearchIcon size={14} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search courses in selected departments..."
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                    />
                    {courseSearch && (
                      <button
                        type="button"
                        onClick={() => setCourseSearch('')}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--muted)'
                        }}
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </div>

                  {errors.courses && <div className="field-error" style={{ marginBottom: '8px' }}>{errors.courses}</div>}

                  {/* Courses Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: '8px',
                      maxHeight: '190px',
                      overflowY: 'auto',
                      paddingRight: '4px'
                    }}
                  >
                    {availableCourses.length === 0 ? (
                      <span style={{ fontSize: '0.84rem', color: 'var(--muted)', fontStyle: 'italic', gridColumn: '1 / -1' }}>
                        No courses available. Please select one or more departments above.
                      </span>
                    ) : filteredCourses.length === 0 ? (
                      <span style={{ fontSize: '0.84rem', color: 'var(--muted)', fontStyle: 'italic', gridColumn: '1 / -1' }}>
                        No courses found matching "{courseSearch}".
                      </span>
                    ) : (
                      filteredCourses.map((c) => {
                        const isChecked = isAllCourses || selectedCourseIds.includes(String(c._id));
                        const isUG = isUndergradCourse(c);
                        const isPG = isPostgradCourse(c);

                        return (
                          <label
                            key={c._id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer',
                              fontSize: '0.82rem',
                              color: 'var(--ink)',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              background: isChecked ? '#f1f5f9' : 'transparent',
                              margin: 0
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handleToggleCourse(c._id, e.target.checked)}
                              style={{ width: '15px', height: '15px', accentColor: 'var(--teal)', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span style={{ fontWeight: 600 }}>{c.code}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.name}
                            </span>
                            {isUG && <span className="course-level-badge ug">UG</span>}
                            {isPG && <span className="course-level-badge pg">PG</span>}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Passing-Year Batch Restriction Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <label style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)', margin: 0 }}>
                      Passing-Year Batch Restriction
                    </label>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                      {passingYearMode === 'ANY'
                        ? 'All batches eligible'
                        : `${(formData.eligibilityCriteria.allowedPassingYears || []).length} batch(es) selected`}
                    </span>
                  </div>

                  <div className="passing-year-mode-wrap">
                    <button
                      type="button"
                      className={`passing-year-mode-btn ${passingYearMode === 'ANY' ? 'active' : ''}`}
                      onClick={() => handlePassingYearModeChange('ANY')}
                    >
                      {passingYearMode === 'ANY' && <CheckIcon size={14} color="var(--teal)" />}
                      <span>Any Passing Year</span>
                    </button>

                    <button
                      type="button"
                      className={`passing-year-mode-btn ${passingYearMode === 'SELECTED' ? 'active' : ''}`}
                      onClick={() => handlePassingYearModeChange('SELECTED')}
                    >
                      {passingYearMode === 'SELECTED' && <CheckIcon size={14} color="var(--teal)" />}
                      <span>Selected Passing Years</span>
                    </button>
                  </div>

                  {passingYearMode === 'ANY' ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      ✓ <strong>Unrestricted:</strong> Eligible students from all graduating batches and alumni years may apply.
                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '8px' }}>
                        Select one or more eligible graduating batches:
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                        {availablePassingYears.map((yr) => {
                          const active = (formData.eligibilityCriteria.allowedPassingYears || []).includes(yr);
                          return (
                            <button
                              key={yr}
                              type="button"
                              className={`passing-year-chip ${active ? 'active' : ''}`}
                              onClick={() => handleTogglePassingYear(yr)}
                            >
                              {active && '✓ '}
                              {yr}
                            </button>
                          );
                        })}
                      </div>

                      {/* Custom Year Addition */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          min="1990"
                          max="2100"
                          placeholder="Add batch year (e.g. 2024)"
                          value={customYearInput}
                          onChange={(e) => setCustomYearInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomYear();
                            }
                          }}
                          style={{ width: '190px', height: '32px', fontSize: '0.82rem' }}
                        />
                        <button
                          type="button"
                          className="secondary"
                          onClick={handleAddCustomYear}
                          style={{ height: '32px', padding: '0 10px', fontSize: '0.8rem' }}
                        >
                          + Add Year
                        </button>
                      </div>

                      {errors.passingYears && (
                        <span className="field-error" style={{ display: 'block', marginTop: '6px' }}>
                          {errors.passingYears}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Academic Cutoffs & Candidate Skills Card — Available for BOTH 'Open to All Students' and 'Restricted Criteria' */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px'
              }}
            >
              <h4 style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'var(--navy)' }}>
                Academic Cutoffs & Candidate Skills
              </h4>

              <div className="job-form-grid-2" style={{ marginBottom: '14px' }}>
                <div className="field">
                  <label>Minimum CGPA (0.0 - 10.0)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    placeholder="e.g. 6.5 (0 for no cutoff)"
                    value={formData.eligibilityCriteria.minCgpa}
                    onChange={(e) => handleCriteriaChange('minCgpa', e.target.value)}
                  />
                  {errors.minCgpa && <span className="field-error">{errors.minCgpa}</span>}
                </div>

                <div className="field">
                  <label>Max Active Backlogs Allowed</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 for clean record (leave blank for any)"
                    value={formData.eligibilityCriteria.maxActiveBacklogs}
                    onChange={(e) => handleCriteriaChange('maxActiveBacklogs', e.target.value)}
                  />
                </div>
              </div>

              {/* Skills Grid */}
              <div className="job-form-grid-2">
                <div className="field">
                  <label>Required Skills</label>
                  <input
                    type="text"
                    placeholder="e.g. JavaScript, React, SQL (comma-separated)"
                    value={formData.eligibilityCriteria.requiredSkills}
                    onChange={(e) => handleCriteriaChange('requiredSkills', e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Preferred Skills</label>
                  <input
                    type="text"
                    placeholder="e.g. TypeScript, Docker, Cloud (comma-separated)"
                    value={formData.eligibilityCriteria.preferredSkills}
                    onChange={(e) => handleCriteriaChange('preferredSkills', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 4: HIRING PROCESS & PUBLISHING + REVIEW
            ======================================================== */}
        {currentStepIndex === 3 && (
          <div className="job-form-tab-pane">
            <div className="form-grid">
              {/* Selection Stages Builder */}
              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Recruitment Selection Stages</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="e.g. Online Assessment, Technical Interview, HR Round"
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
                    <PlusIcon size={14} /> Add Stage
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

              {/* Deadline */}
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

              {/* Step 4 Review & Confirmation Card */}
              <div className="job-review-card">
                <h4>
                  <CheckIcon size={16} color="var(--teal)" /> Review Summary
                </h4>
                <div className="job-review-grid">
                  <div className="job-review-item">
                    <label>Job Title & Category</label>
                    <span>
                      {formData.title || 'Untitled'} &bull; {formData.category} ({getJobTypeLabel(formData.jobType)})
                    </span>
                  </div>

                  <div className="job-review-item">
                    <label>Work Mode & Location</label>
                    <span>
                      {getWorkModeLabel(formData.workMode)} {formData.location ? `(${formData.location})` : ''}
                    </span>
                  </div>

                  <div className="job-review-item">
                    <label>Vacancies & Compensation</label>
                    <span>
                      {formData.vacancies} open &bull;{' '}
                      {formData.compensation.salaryMin || formData.compensation.salaryMax
                        ? `${formData.compensation.currency} ${formData.compensation.salaryMin || 0} - ${formData.compensation.salaryMax || 0} (${formData.compensation.salaryFormat})`
                        : 'Undisclosed / Negotiable'}
                    </span>
                  </div>

                  <div className="job-review-item">
                    <label>Responsibilities Defined</label>
                    <span>
                      {cleanedRespCount} responsibility item{cleanedRespCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="job-review-item">
                    <label>Target Eligibility</label>
                    <span>
                      {formData.eligibilityMode === 'ALL_STUDENTS'
                        ? 'Open to All Students (Any Passing Year)'
                        : `${isAllDepartments ? 'All' : selectedDeptIds.length} Depts • ${passingYearMode === 'ANY' ? 'Any Year' : (formData.eligibilityCriteria.allowedPassingYears || []).join(', ') || 'Any Year'} • Min CGPA: ${formData.eligibilityCriteria.minCgpa || 0}`}
                    </span>
                  </div>

                  <div className="job-review-item">
                    <label>Selection Process</label>
                    <span>{formData.selectionProcess.length} stage(s) defined</span>
                  </div>

                  <div className="job-review-item">
                    <label>Application Deadline</label>
                    <span>{formData.deadline ? formatDate(formData.deadline) : 'Not specified'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Actions Footer with Wizard Navigation */}
        <div
          className="modal-actions"
          style={{
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            {currentStepIndex > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={handlePrevStep}
              >
                ← Back
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="ghost" onClick={handleSafeClose} disabled={saving}>
              Cancel
            </button>

            {currentStepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                className="primary"
                onClick={handleNextStep}
              >
                Next Step →
              </button>
            ) : isEdit ? (
              <button type="submit" className="primary" disabled={saving}>
                {saving ? 'Saving Job Posting…' : 'Save Changes'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={(e) => handleSubmit(e, 'DRAFT')}
                  disabled={saving}
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={(e) => handleSubmit(e, 'OPEN')}
                  disabled={saving}
                >
                  {saving ? 'Publishing…' : 'Publish Job Posting'}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
