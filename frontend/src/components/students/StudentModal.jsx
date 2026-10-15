import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal.jsx';
import { GraduationCapIcon, BuildingIcon, ChartIcon } from '../common/Icons.jsx';
import { studentService } from '../../services/student.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SEMESTER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 26 }, (_, i) => CURRENT_YEAR - 5 + i);

const INITIAL_FORM_STATE = {
  universityId: '',
  firstName: '',
  lastName: '',
  email: '',
  mobileNumber: '',
  departmentId: '',
  courseId: '',
  semester: '',
  passingYear: '',
  cgpa: '',
  backlogs: '',
  address: ''
};

export function StudentModal({ isOpen, student = null, onClose, onSuccess }) {
  const { user: currentUser, role } = useAuth();
  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || currentUser?.roleId === 'ROLE_PLACEMENT_COORDINATOR';
  const coordinatorDeptId = currentUser?.departmentId;

  const isEdit = Boolean(student?._id);

  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dynamic Departments State
  const [departments, setDepartments] = useState([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptError, setDeptError] = useState('');

  // Dynamic Courses State
  const [courses, setCourses] = useState([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseError, setCourseError] = useState('');

  // Fetch departments when modal opens
  const fetchDepartments = useCallback(async () => {
    setDeptLoading(true);
    setDeptError('');
    try {
      const res = await departmentService.listDepartments({ isActive: true, limit: 100 });
      let deptList = res.data?.items || res.items || [];
      if (isCoordinator && coordinatorDeptId) {
        const found = deptList.some((d) => String(d._id) === String(coordinatorDeptId));
        if (!found) {
          deptList = [
            ...deptList,
            {
              _id: coordinatorDeptId,
              name: currentUser?.departmentName || 'Assigned Department',
              code: currentUser?.departmentCode || ''
            }
          ];
        }
      }
      setDepartments(deptList);
      return deptList;
    } catch (err) {
      if (isCoordinator && coordinatorDeptId) {
        const fallbackList = [
          {
            _id: coordinatorDeptId,
            name: currentUser?.departmentName || 'Assigned Department',
            code: currentUser?.departmentCode || ''
          }
        ];
        setDepartments(fallbackList);
        return fallbackList;
      }
      setDeptError(err.message || 'Failed to load active departments.');
      return [];
    } finally {
      setDeptLoading(false);
    }
  }, [isCoordinator, coordinatorDeptId, currentUser]);

  // Fetch courses filtered by department
  const fetchCoursesForDepartment = useCallback(async (deptId) => {
    if (!deptId) {
      setCourses([]);
      return [];
    }
    setCourseLoading(true);
    setCourseError('');
    try {
      const res = await courseService.listCourses({ departmentId: deptId, isActive: true, limit: 100 });
      const courseList = res.data?.items || res.items || [];
      setCourses(courseList);
      return courseList;
    } catch (err) {
      setCourseError(err.message || 'Failed to load courses for selected department.');
      setCourses([]);
      return [];
    } finally {
      setCourseLoading(false);
    }
  }, []);

  // Initialize or reset form data when modal opens or student changes
  useEffect(() => {
    if (!isOpen) return;

    setFieldErrors({});
    setServerError('');

    let isMounted = true;

    async function init() {
      const loadedDepts = await fetchDepartments();
      if (!isMounted) return;

      if (student) {
        // Resolve departmentId: use direct property or match legacy department name
        let targetDeptId = student.departmentId?._id || student.departmentId || '';
        if (!targetDeptId && student.department && loadedDepts.length > 0) {
          const matchedDept = loadedDepts.find(
            (d) => d.name?.toLowerCase() === student.department?.toLowerCase()
          );
          if (matchedDept) targetDeptId = matchedDept._id;
        }

        let targetCourseId = student.courseId?._id || student.courseId || '';

        setFormData({
          universityId: student.universityId || '',
          firstName: student.firstName || '',
          lastName: student.lastName || '',
          email: student.email || '',
          mobileNumber: student.mobileNumber || '',
          departmentId: targetDeptId,
          courseId: targetCourseId,
          semester: student.semester != null ? String(student.semester) : '',
          passingYear: student.passingYear ? String(student.passingYear) : '',
          cgpa: student.cgpa != null ? String(student.cgpa) : '',
          backlogs: student.backlogs != null ? String(student.backlogs) : '',
          address: student.address || ''
        });

        if (targetDeptId) {
          const loadedCourses = await fetchCoursesForDepartment(targetDeptId);
          if (!isMounted) return;
          if (!targetCourseId && student.branch && loadedCourses.length > 0) {
            const matchedCourse = loadedCourses.find(
              (c) => c.name?.toLowerCase() === student.branch?.toLowerCase()
            );
            if (matchedCourse) {
              setFormData((prev) => ({ ...prev, courseId: matchedCourse._id }));
            }
          }
        }
      } else {
        const initDeptId = isCoordinator && coordinatorDeptId ? coordinatorDeptId : '';
        setFormData({
          ...INITIAL_FORM_STATE,
          departmentId: initDeptId
        });
        if (initDeptId) {
          await fetchCoursesForDepartment(initDeptId);
        } else {
          setCourses([]);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [isOpen, student, fetchDepartments, fetchCoursesForDepartment, isCoordinator, coordinatorDeptId]);

  // Handle Department Change: resets course selection and cascades
  const handleDepartmentChange = async (e) => {
    if (isCoordinator && coordinatorDeptId) return;
    const newDeptId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      departmentId: newDeptId,
      courseId: ''
    }));

    if (fieldErrors.departmentId) {
      setFieldErrors((prev) => ({ ...prev, departmentId: undefined }));
    }
    if (fieldErrors.courseId) {
      setFieldErrors((prev) => ({ ...prev, courseId: undefined }));
    }

    if (newDeptId) {
      await fetchCoursesForDepartment(newDeptId);
    } else {
      setCourses([]);
    }
  };

  // General field change handler
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  // Validate form fields client-side
  const validateForm = () => {
    const errors = {};

    const uniId = formData.universityId.trim();
    if (!uniId) {
      errors.universityId = 'University ID / Roll Number is required.';
    } else if (uniId.length > 100) {
      errors.universityId = 'University ID cannot exceed 100 characters.';
    }

    const fName = formData.firstName.trim();
    if (!fName) {
      errors.firstName = 'First Name is required.';
    } else if (fName.length > 100) {
      errors.firstName = 'First Name cannot exceed 100 characters.';
    }

    const lName = formData.lastName.trim();
    if (!lName) {
      errors.lastName = 'Last Name is required.';
    } else if (lName.length > 100) {
      errors.lastName = 'Last Name cannot exceed 100 characters.';
    }

    const emailVal = formData.email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal) {
      errors.email = 'Email Address is required.';
    } else if (!emailRegex.test(emailVal)) {
      errors.email = 'Please enter a valid email address.';
    } else if (emailVal.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    const mobile = formData.mobileNumber.trim();
    if (!mobile) {
      errors.mobileNumber = 'Mobile Number is required.';
    } else if (!isValidMobile(mobile)) {
      errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;
    }

    if (!formData.departmentId) {
      errors.departmentId = 'Department is required. Please select a department.';
    }

    if (!formData.courseId) {
      errors.courseId = 'Course / Specialization is required. Please select a course.';
    }

    const semVal = Number(formData.semester);
    if (!formData.semester || Number.isNaN(semVal) || semVal < 1 || semVal > 12) {
      errors.semester = 'Semester must be between 1 and 12.';
    }

    const passYearVal = Number(formData.passingYear);
    if (!formData.passingYear || Number.isNaN(passYearVal) || passYearVal < 1990 || passYearVal > 2100) {
      errors.passingYear = 'Please select a valid passing year.';
    }

    const cgpaVal = Number(formData.cgpa);
    if (formData.cgpa === '' || formData.cgpa === null || Number.isNaN(cgpaVal)) {
      errors.cgpa = 'CGPA is required.';
    } else if (cgpaVal < 0 || cgpaVal > 10) {
      errors.cgpa = 'CGPA must be between 0.00 and 10.00.';
    }

    const backlogsVal = Number(formData.backlogs);
    if (formData.backlogs !== '' && (Number.isNaN(backlogsVal) || backlogsVal < 0)) {
      errors.backlogs = 'Backlogs must be 0 or greater.';
    }

    if (formData.address && formData.address.length > 500) {
      errors.address = 'Address cannot exceed 500 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validateForm()) {
      return;
    }

    // Resolve matched department and course objects for legacy text support
    const selectedDept = departments.find((d) => d._id === formData.departmentId);
    const selectedCourse = courses.find((c) => c._id === formData.courseId);

    const deptName = selectedDept ? selectedDept.name : (student?.department || '');
    const courseName = selectedCourse ? selectedCourse.name : (student?.branch || '');

    const payload = {
      universityId: formData.universityId.trim().toUpperCase(),
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim().toLowerCase(),
      mobileNumber: formData.mobileNumber.trim(),
      departmentId: formData.departmentId,
      department: deptName,
      courseId: formData.courseId,
      branch: courseName,
      semester: Number(formData.semester),
      passingYear: Number(formData.passingYear),
      cgpa: Number(formData.cgpa),
      backlogs: Number(formData.backlogs || 0),
      address: formData.address.trim()
    };

    setSubmitting(true);

    try {
      let result;
      if (isEdit) {
        result = await studentService.updateStudent(student._id, payload);
      } else {
        result = await studentService.createStudent(payload);
      }
      onClose();
      onSuccess(result);
    } catch (err) {
      const errMsg = err.message || 'Operation failed. Please check the form and try again.';
      setServerError(errMsg);

      // Map backend duplicate conflict errors to specific fields
      if (errMsg.toLowerCase().includes('university id')) {
        setFieldErrors((prev) => ({ ...prev, universityId: errMsg }));
      } else if (errMsg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: errMsg }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Student Profile' : 'Create New Student'}
      maxWidth="760px"
    >
      <form
        id="student-modal-form"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginTop: '16px'
        }}
        onSubmit={handleSubmit}
        noValidate
      >
        {serverError && (
          <div
            className="notice error"
            role="alert"
            style={{ marginBottom: '4px' }}
          >
            {serverError}
          </div>
        )}

        {/* SECTION 1: Student Identity & Contact */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--navy, #173b76)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <GraduationCapIcon size={16} color="var(--primary, #0284c7)" /> Student Identity & Contact
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Official roll number, student name, and primary contact details
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 1. University ID / Roll Number */}
            <div className="field">
              <label htmlFor="st-uni-id">
                University ID / Roll Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="st-uni-id"
                name="universityId"
                value={formData.universityId}
                onChange={handleChange}
                placeholder="e.g. STU2026001"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.universityId)}
                style={fieldErrors.universityId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              />
              {fieldErrors.universityId && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.universityId}
                </span>
              )}
            </div>

            {/* 2. Email Address */}
            <div className="field">
              <label htmlFor="st-email">
                Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="st-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="student@university.edu"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.email)}
                style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              />
              {fieldErrors.email && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.email}
                </span>
              )}
            </div>

            {/* 3. First Name */}
            <div className="field">
              <label htmlFor="st-first-name">
                First Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="st-first-name"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Given name"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.firstName)}
                style={fieldErrors.firstName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              />
              {fieldErrors.firstName && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.firstName}
                </span>
              )}
            </div>

            {/* 4. Last Name */}
            <div className="field">
              <label htmlFor="st-last-name">
                Last Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="st-last-name"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                placeholder="Surname / Family name"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.lastName)}
                style={fieldErrors.lastName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              />
              {fieldErrors.lastName && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.lastName}
                </span>
              )}
            </div>

            {/* 5. Mobile Number */}
            <div className="field">
              <label htmlFor="st-mobile">
                Mobile Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="st-mobile"
                name="mobileNumber"
                type="tel"
                value={formData.mobileNumber}
                onChange={handleChange}
                placeholder="+91 9876543210"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.mobileNumber)}
                style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                maxLength={15}
              />
              {fieldErrors.mobileNumber && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.mobileNumber}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 2: Department & Academic Program */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--navy, #173b76)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <BuildingIcon size={16} color="var(--primary, #0284c7)" /> Department & Academic Program
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Department enrollment, degree specialization, and graduation year
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 6. Dynamic Department */}
            <div className="field">
              <label htmlFor="st-dept">
                Department <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                {isCoordinator && (
                  <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '6px', fontWeight: 'normal' }}>
                    (Locked to assigned department)
                  </span>
                )}
              </label>
              <select
                id="st-dept"
                name="departmentId"
                value={formData.departmentId}
                onChange={handleDepartmentChange}
                disabled={submitting || deptLoading || (isCoordinator && Boolean(coordinatorDeptId))}
                aria-invalid={Boolean(fieldErrors.departmentId)}
                style={{
                  ...(fieldErrors.departmentId ? { borderColor: 'var(--red, #e53e3e)' } : {}),
                  ...(isCoordinator && Boolean(coordinatorDeptId) ? { backgroundColor: '#f1f5f9', cursor: 'not-allowed' } : {})
                }}
              >
                {!isCoordinator && (
                  <option value="">
                    {deptLoading ? 'Loading departments…' : '— Select Academic Department —'}
                  </option>
                )}
                {departments
                  .filter((d) => !isCoordinator || !coordinatorDeptId || String(d._id) === String(coordinatorDeptId))
                  .map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} {d.code ? `(${d.code})` : ''}
                    </option>
                  ))}
              </select>
              {deptError && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ color: 'var(--red, #e53e3e)', fontSize: '0.8rem' }}>{deptError}</span>
                  <button
                    type="button"
                    className="link-button"
                    style={{ fontSize: '0.8rem', padding: 0 }}
                    onClick={fetchDepartments}
                  >
                    Retry
                  </button>
                </div>
              )}
              {fieldErrors.departmentId && !deptError && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.departmentId}
                </span>
              )}
            </div>

            {/* 7. Dynamic Course / Specialization */}
            <div className="field">
              <label htmlFor="st-course">
                Course / Specialization <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="st-course"
                name="courseId"
                value={formData.courseId}
                onChange={handleChange}
                disabled={submitting || !formData.departmentId || courseLoading}
                aria-invalid={Boolean(fieldErrors.courseId)}
                style={fieldErrors.courseId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              >
                <option value="">
                  {!formData.departmentId
                    ? '— Select a Department first —'
                    : courseLoading
                    ? 'Loading courses…'
                    : courses.length === 0
                    ? 'No active courses in this department'
                    : '— Select Course / Degree —'}
                </option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.code ? `(${c.code})` : ''} {c.level ? `• ${c.level}` : ''}
                  </option>
                ))}
              </select>
              {courseError && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ color: 'var(--red, #e53e3e)', fontSize: '0.8rem' }}>{courseError}</span>
                  <button
                    type="button"
                    className="link-button"
                    style={{ fontSize: '0.8rem', padding: 0 }}
                    onClick={() => fetchCoursesForDepartment(formData.departmentId)}
                  >
                    Retry
                  </button>
                </div>
              )}
              {fieldErrors.courseId && !courseError && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.courseId}
                </span>
              )}
            </div>

            {/* 8. Current Semester */}
            <div className="field">
              <label htmlFor="st-semester">
                Current Semester <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="st-semester"
                name="semester"
                value={formData.semester}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.semester)}
                style={fieldErrors.semester ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              >
                <option value="">— Select Current Semester —</option>
                {SEMESTER_OPTIONS.map((s) => (
                  <option key={s} value={String(s)}>
                    Semester {s}
                  </option>
                ))}
              </select>
              {fieldErrors.semester && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.semester}
                </span>
              )}
            </div>

            {/* 9. Passing Year */}
            <div className="field">
              <label htmlFor="st-passing-year">
                Passing Year <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <select
                id="st-passing-year"
                name="passingYear"
                value={formData.passingYear}
                onChange={handleChange}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.passingYear)}
                style={fieldErrors.passingYear ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              >
                <option value="">— Select Passing Year —</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
              {fieldErrors.passingYear && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.passingYear}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 3: Performance & Academic Records */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--navy, #173b76)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <ChartIcon size={16} color="var(--primary, #0284c7)" /> Academic Performance
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Cumulative CGPA and active backlog count
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* 10. CGPA */}
            <div className="field">
              <label htmlFor="st-cgpa">
                CGPA (0.00 – 10.00) <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
              </label>
              <input
                id="st-cgpa"
                name="cgpa"
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={formData.cgpa}
                onChange={handleChange}
                placeholder="e.g. 8.75"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.cgpa)}
                style={fieldErrors.cgpa ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              />
              {fieldErrors.cgpa && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.cgpa}
                </span>
              )}
            </div>

            {/* 11. Active Backlogs */}
            <div className="field">
              <label htmlFor="st-backlogs">Active Backlogs</label>
              <input
                id="st-backlogs"
                name="backlogs"
                type="number"
                min="0"
                step="1"
                value={formData.backlogs}
                onChange={handleChange}
                placeholder="0"
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.backlogs)}
                style={fieldErrors.backlogs ? { borderColor: 'var(--red, #e53e3e)' } : {}}
              />
              {fieldErrors.backlogs && (
                <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                  {fieldErrors.backlogs}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* SECTION 4: Residential & Address Details */}
        <section className="form-section-card">
          <div style={{ marginBottom: '12px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: '700',
                color: 'var(--navy, #173b76)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              📍 Residential Details
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
              Permanent home address or campus hostel accommodation
            </p>
          </div>

          {/* 12. Address */}
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="st-address">Residential / Campus Address</label>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                {formData.address ? formData.address.length : 0}/500
              </span>
            </div>
            <textarea
              id="st-address"
              name="address"
              rows="3"
              value={formData.address}
              onChange={handleChange}
              placeholder="Permanent address or campus hostel details"
              disabled={submitting}
              maxLength={500}
              style={fieldErrors.address ? { borderColor: 'var(--red, #e53e3e)' } : {}}
            />
            {fieldErrors.address && (
              <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                {fieldErrors.address}
              </span>
            )}
          </div>
        </section>

        {/* Action Buttons */}
        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '12px'
          }}
        >
          <button className="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Update Student Profile' : 'Create Student'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
