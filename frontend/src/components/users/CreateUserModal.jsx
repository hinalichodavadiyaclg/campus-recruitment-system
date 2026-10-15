import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import {
  GraduationCapIcon,
  BuildingIcon,
  BriefcaseIcon,
  ChartIcon,
  UserIcon,
  MapPinIcon
} from '../common/Icons.jsx';
import { userService } from '../../services/user.service.js';
import { roleService } from '../../services/role.service.js';
import { studentService } from '../../services/student.service.js';
import { companyService } from '../../services/company.service.js';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isValidMobile, MOBILE_VALIDATION_MESSAGE } from '../../utils/validation.js';

const CURRENT_YEAR = new Date().getFullYear();
const SEMESTER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const YEAR_OPTIONS = Array.from({ length: 26 }, (_, i) => CURRENT_YEAR - 5 + i);
const COMPANY_YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1800 + 1 },
  (_, i) => CURRENT_YEAR - i
);

const INITIAL_STUDENT_FORM = {
  universityId: '',
  firstName: '',
  lastName: '',
  mobileNumber: '',
  address: '',
  departmentId: '',
  department: '',
  courseId: '',
  branch: '',
  semester: '',
  cgpa: '',
  backlogs: '',
  passingYear: ''
};

const INITIAL_COMPANY_FORM = {
  companyName: '',
  industryType: '',
  hrRecruiterName: '',
  designation: '',
  website: '',
  yearEstablished: '',
  mobileNumber: '',
  officeAddress: '',
  description: ''
};

const INITIAL_OFFICER_FORM = {
  employeeId: '',
  firstName: '',
  lastName: '',
  mobileNumber: '',
  designation: '',
  role: '',
  departmentId: '',
  department: ''
};

export function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
  defaultType = 'STUDENT'
}) {
  const { user: currentUser, role, has } = useAuth();
  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || currentUser?.roleId === 'ROLE_PLACEMENT_COORDINATOR';
  const canAccessPlacementOfficers = !isCoordinator && (has('PLACEMENT_USER_IMPORT') || has('USER_CREATE'));

  const [activeTab, setActiveTab] = useState(() => (isCoordinator && defaultType === 'PLACEMENT' ? 'STUDENT' : defaultType));
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);

  // Common account state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Student specific fields
  const [studentForm, setStudentForm] = useState(INITIAL_STUDENT_FORM);

  // Company specific fields
  const [companyForm, setCompanyForm] = useState(INITIAL_COMPANY_FORM);

  // Placement Officer specific fields
  const [officerForm, setOfficerForm] = useState(INITIAL_OFFICER_FORM);

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setServerError('');
      const effectiveType = isCoordinator && defaultType === 'PLACEMENT' ? 'STUDENT' : defaultType;
      setActiveTab(effectiveType);
      setEmail('');
      setPassword('');
      setStudentForm(INITIAL_STUDENT_FORM);
      setCompanyForm(INITIAL_COMPANY_FORM);
      setOfficerForm(INITIAL_OFFICER_FORM);
      
      // Fetch Roles, Departments, and Courses
      Promise.all([
        roleService.listRoles().catch(() => []),
        departmentService.listDepartments({ limit: 100, isActive: true }).catch(() => ({ items: [] })),
        courseService.listCourses({ limit: 100, isActive: true }).catch(() => ({ items: [] }))
      ]).then(([rolesData, deptsData, coursesData]) => {
        setRoles(rolesData || []);
        if (rolesData && rolesData.length > 0) {
          if (effectiveType === 'STUDENT') {
            setSelectedRoleId('ROLE_STUDENT');
          } else if (effectiveType === 'COMPANY') {
            setSelectedRoleId('ROLE_COMPANY');
          } else {
            setSelectedRoleId('');
          }
        }

        const deptList = deptsData.items || deptsData || [];
        const courseList = coursesData.items || coursesData || [];
        setDepartments(deptList);
        setCourses(courseList);

        if (isCoordinator && currentUser?.departmentId) {
          const matchedCoordinatorDept = deptList.find(d => String(d._id) === String(currentUser.departmentId));
          setStudentForm(prev => ({
            ...prev,
            departmentId: String(currentUser.departmentId),
            department: matchedCoordinatorDept?.name || currentUser.departmentName || ''
          }));
        }
      });
    }
  }, [isOpen, defaultType, isCoordinator, currentUser?.departmentId]);

  const handleTabChange = (type) => {
    if (type === 'PLACEMENT' && !canAccessPlacementOfficers) return;
    setActiveTab(type);
    setFieldErrors({});
    setServerError('');
    if (type === 'STUDENT') {
      setSelectedRoleId('ROLE_STUDENT');
    } else if (type === 'COMPANY') {
      setSelectedRoleId('ROLE_COMPANY');
    } else {
      setSelectedRoleId('');
    }
  };

  const handleDepartmentChange = (deptId) => {
    const matchedDept = departments.find((d) => d._id === deptId);
    const deptName = matchedDept ? matchedDept.name : '';

    setStudentForm((prev) => ({
      ...prev,
      departmentId: deptId,
      department: deptName,
      courseId: '',
      branch: ''
    }));
    if (fieldErrors.departmentId) {
      setFieldErrors((prev) => ({ ...prev, departmentId: undefined }));
    }
  };

  const handleCourseChange = (cId) => {
    const matchedCourse = courses.find((c) => c._id === cId);
    setStudentForm((prev) => ({
      ...prev,
      courseId: cId,
      branch: matchedCourse ? matchedCourse.name : ''
    }));
    if (fieldErrors.courseId) {
      setFieldErrors((prev) => ({ ...prev, courseId: undefined }));
    }
  };

  const clearFieldError = (name) => {
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (serverError) {
      setServerError('');
    }
  };

  const filteredCourses = studentForm.departmentId
    ? courses.filter((c) => {
        const cDeptId = c.departmentId?._id || c.departmentId;
        return String(cDeptId) === String(studentForm.departmentId);
      })
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const errors = {};

    const emailVal = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailVal) {
      errors.email = 'Account Email is required.';
    } else if (!emailRegex.test(emailVal)) {
      errors.email = 'Please enter a valid email address.';
    } else if (emailVal.length > 254) {
      errors.email = 'Email address cannot exceed 254 characters.';
    }

    if (activeTab === 'STUDENT') {
      const uId = studentForm.universityId.trim();
      if (!uId) errors.universityId = 'University ID is required.';
      else if (uId.length > 100) errors.universityId = 'University ID cannot exceed 100 characters.';

      const fName = studentForm.firstName.trim();
      if (!fName) errors.firstName = 'First Name is required.';
      else if (fName.length > 100) errors.firstName = 'First Name cannot exceed 100 characters.';

      const lName = studentForm.lastName.trim();
      if (!lName) errors.lastName = 'Last Name is required.';
      else if (lName.length > 100) errors.lastName = 'Last Name cannot exceed 100 characters.';

      const sMob = studentForm.mobileNumber.trim();
      if (!sMob) errors.mobileNumber = 'Mobile Number is required.';
      else if (!isValidMobile(sMob)) errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;

      if (!studentForm.departmentId) errors.departmentId = 'Department is required. Please select a department.';
      if (!studentForm.courseId) errors.courseId = 'Course / Branch is required. Please select a course.';

      const semVal = Number(studentForm.semester);
      if (!studentForm.semester || Number.isNaN(semVal) || semVal < 1 || semVal > 12) {
        errors.semester = 'Please select a valid semester (1 to 12).';
      }

      const passYear = Number(studentForm.passingYear);
      if (!studentForm.passingYear || Number.isNaN(passYear) || passYear < 1990 || passYear > 2100) {
        errors.passingYear = 'Please select a valid passing year.';
      }

      const cgpaNum = Number(studentForm.cgpa);
      if (studentForm.cgpa === '' || Number.isNaN(cgpaNum)) {
        errors.cgpa = 'CGPA is required.';
      } else if (cgpaNum < 0 || cgpaNum > 10) {
        errors.cgpa = 'CGPA must be between 0.00 and 10.00.';
      }

      if (studentForm.address && studentForm.address.trim().length > 500) {
        errors.address = 'Address cannot exceed 500 characters.';
      }
    } else if (activeTab === 'COMPANY') {
      const cName = companyForm.companyName.trim();
      if (!cName) errors.companyName = 'Company Name is required.';
      else if (cName.length > 200) errors.companyName = 'Company Name cannot exceed 200 characters.';

      const cIndustry = companyForm.industryType.trim();
      if (!cIndustry) errors.industryType = 'Industry Type is required.';
      else if (cIndustry.length > 100) errors.industryType = 'Industry Type cannot exceed 100 characters.';

      const cHr = companyForm.hrRecruiterName.trim();
      if (!cHr) errors.hrRecruiterName = 'HR / Recruiter Name is required.';
      else if (cHr.length > 100) errors.hrRecruiterName = 'HR / Recruiter Name cannot exceed 100 characters.';

      const yearEst = Number(companyForm.yearEstablished);
      if (!companyForm.yearEstablished || Number.isNaN(yearEst) || yearEst < 1800 || yearEst > 2100) {
        errors.yearEstablished = 'Year Established must be between 1800 and 2100.';
      }

      const cDesig = companyForm.designation.trim();
      if (!cDesig) errors.designation = 'HR Designation is required.';
      else if (cDesig.length > 100) errors.designation = 'HR Designation cannot exceed 100 characters.';

      const cMob = companyForm.mobileNumber.trim();
      if (!cMob) errors.mobileNumber = 'Mobile Number is required.';
      else if (!isValidMobile(cMob)) errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;

      if (companyForm.website && companyForm.website.trim().length > 300) {
        errors.website = 'Website URL cannot exceed 300 characters.';
      }

      const cAddr = companyForm.officeAddress.trim();
      if (!cAddr) errors.officeAddress = 'Office Address is required.';
      else if (cAddr.length > 500) errors.officeAddress = 'Office Address cannot exceed 500 characters.';

      const cDesc = companyForm.description.trim();
      if (!cDesc) errors.description = 'Company Description is required.';
      else if (cDesc.length > 1000) errors.description = 'Company Description cannot exceed 1000 characters.';
    } else if (activeTab === 'PLACEMENT') {
      const empId = officerForm.employeeId.trim();
      if (!empId) errors.employeeId = 'Employee ID is required.';
      else if (empId.length > 50) errors.employeeId = 'Employee ID cannot exceed 50 characters.';

      const fName = officerForm.firstName.trim();
      if (!fName) errors.firstName = 'First Name is required.';
      else if (fName.length > 100) errors.firstName = 'First Name cannot exceed 100 characters.';

      const lName = officerForm.lastName.trim();
      if (!lName) errors.lastName = 'Last Name is required.';
      else if (lName.length > 100) errors.lastName = 'Last Name cannot exceed 100 characters.';

      const pMob = (officerForm.mobileNumber || '').trim();
      if (!pMob) errors.mobileNumber = 'Mobile Number is required.';
      else if (!isValidMobile(pMob)) errors.mobileNumber = MOBILE_VALIDATION_MESSAGE;

      const desig = officerForm.designation.trim();
      if (!desig) errors.designation = 'Designation is required.';
      else if (desig.length > 100) errors.designation = 'Designation cannot exceed 100 characters.';

      if (!selectedRoleId) {
        errors.role = 'Assigned Role is required. Please select a role.';
      } else if (selectedRoleId === 'ROLE_PLACEMENT_COORDINATOR' && !officerForm.departmentId) {
        errors.departmentId = 'Department is required for Placement Coordinator.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    try {
      let createdResult;

      if (activeTab === 'STUDENT') {
        const payload = {
          email: emailVal.toLowerCase(),
          universityId: studentForm.universityId.trim().toUpperCase(),
          firstName: studentForm.firstName.trim(),
          lastName: studentForm.lastName.trim(),
          mobileNumber: studentForm.mobileNumber.trim(),
          address: studentForm.address.trim(),
          branch: studentForm.branch.trim(),
          department: studentForm.department.trim(),
          semester: Number(studentForm.semester),
          cgpa: Number(studentForm.cgpa),
          backlogs: Number(studentForm.backlogs || 0),
          passingYear: Number(studentForm.passingYear)
        };
        if (studentForm.courseId) payload.courseId = studentForm.courseId;
        if (studentForm.departmentId) payload.departmentId = studentForm.departmentId;

        createdResult = await studentService.createStudent(payload);
      } else if (activeTab === 'COMPANY') {
        const payload = {
          email: emailVal.toLowerCase(),
          companyName: companyForm.companyName.trim(),
          industryType: companyForm.industryType.trim(),
          hrRecruiterName: companyForm.hrRecruiterName.trim(),
          yearEstablished: Number(companyForm.yearEstablished),
          designation: companyForm.designation.trim(),
          website: companyForm.website.trim(),
          mobileNumber: companyForm.mobileNumber.trim(),
          officeAddress: companyForm.officeAddress.trim(),
          description: companyForm.description.trim()
        };

        createdResult = await companyService.createCompany(payload);
      } else if (activeTab === 'PLACEMENT') {
        const payload = {
          email: emailVal.toLowerCase(),
          employeeId: officerForm.employeeId.trim(),
          firstName: officerForm.firstName.trim(),
          lastName: officerForm.lastName.trim(),
          mobileNumber: officerForm.mobileNumber.trim(),
          designation: officerForm.designation.trim(),
          role: selectedRoleId
        };
        if (selectedRoleId === 'ROLE_PLACEMENT_COORDINATOR' && officerForm.departmentId) {
          payload.departmentId = officerForm.departmentId;
          if (officerForm.department) payload.department = officerForm.department;
        }

        createdResult = await placementOfficerService.createPlacementOfficer(payload);
      }

      onClose();
      onSuccess(createdResult, activeTab);
    } catch (err) {
      const msg = err.message || 'Account creation failed.';
      setServerError(msg);
      if (err.details) {
        if (err.details.companyName) {
          setFieldErrors((prev) => ({ ...prev, companyName: err.details.companyName }));
        }
        if (err.details.email) {
          setFieldErrors((prev) => ({ ...prev, email: err.details.email }));
        }
      }
      if (msg.toLowerCase().includes('company name')) {
        setFieldErrors((prev) => ({ ...prev, companyName: err.details?.companyName || msg }));
      }
      if (msg.toLowerCase().includes('email')) {
        setFieldErrors((prev) => ({ ...prev, email: err.details?.email || msg }));
      }
      if (msg.toLowerCase().includes('university id')) {
        setFieldErrors((prev) => ({ ...prev, universityId: msg }));
      }
      if (msg.toLowerCase().includes('employee id')) {
        setFieldErrors((prev) => ({ ...prev, employeeId: msg }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Portal Account"
      maxWidth="760px"
    >
      {/* Persistent Account Type Selector */}
      <div style={{ marginTop: '4px', marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
          Select Account & Profile Type:
        </label>
        <div className="button-group" style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            id="tab-btn-student"
            className={activeTab === 'STUDENT' ? 'primary' : 'secondary'}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
            onClick={() => handleTabChange('STUDENT')}
          >
            <GraduationCapIcon size={14} /> Student
          </button>
          <button
            type="button"
            id="tab-btn-company"
            className={activeTab === 'COMPANY' ? 'primary' : 'secondary'}
            style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
            onClick={() => handleTabChange('COMPANY')}
          >
            <BuildingIcon size={14} /> Company
          </button>
          {canAccessPlacementOfficers && (
            <button
              type="button"
              id="tab-btn-placement"
              className={activeTab === 'PLACEMENT' ? 'primary' : 'secondary'}
              style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
              onClick={() => handleTabChange('PLACEMENT')}
            >
              <BriefcaseIcon size={14} /> Placement Officer
            </button>
          )}
        </div>
      </div>

      <form
        id="create-user-modal-form"
        autoComplete="off"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
        onSubmit={handleSubmit}
        noValidate
      >
        {serverError && (
          <div className="notice error" role="alert" style={{ marginBottom: '4px' }}>
            {serverError}
          </div>
        )}

        {/* Dynamic Fields for Student */}
        {activeTab === 'STUDENT' && (
          <>
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
                  <GraduationCapIcon size={16} color="var(--primary, #0284c7)" /> Student Account & Identity
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Official roll number, portal login email, and contact details
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="field">
                  <label htmlFor="st-uni">
                    University ID / Roll Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="st-uni"
                    placeholder="e.g. STU2026001"
                    value={studentForm.universityId}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, universityId: e.target.value });
                      clearFieldError('universityId');
                    }}
                    aria-invalid={Boolean(fieldErrors.universityId)}
                    style={fieldErrors.universityId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.universityId && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.universityId}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="cu-email">
                    Account Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="cu-email"
                    type="email"
                    placeholder="student@university.edu"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.email && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-fn">
                    First Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="st-fn"
                    placeholder="Given name"
                    value={studentForm.firstName}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, firstName: e.target.value });
                      clearFieldError('firstName');
                    }}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    style={fieldErrors.firstName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.firstName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.firstName}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-ln">
                    Last Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="st-ln"
                    placeholder="Surname / Family name"
                    value={studentForm.lastName}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, lastName: e.target.value });
                      clearFieldError('lastName');
                    }}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    style={fieldErrors.lastName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.lastName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.lastName}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-mob">
                    Mobile Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="st-mob"
                    type="tel"
                    placeholder="+91 9876543210"
                    maxLength={15}
                    value={studentForm.mobileNumber}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, mobileNumber: e.target.value });
                      clearFieldError('mobileNumber');
                    }}
                    aria-invalid={Boolean(fieldErrors.mobileNumber)}
                    style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
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
                  Department enrollment, course degree, and semester progress
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="field">
                  <label htmlFor="st-dept-select">
                    Department <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <select
                    id="st-dept-select"
                    value={studentForm.departmentId}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    disabled={isCoordinator}
                    aria-invalid={Boolean(fieldErrors.departmentId)}
                    style={fieldErrors.departmentId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  >
                    <option value="">— Select Academic Department —</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name} {d.code ? `(${d.code})` : ''}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.departmentId && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.departmentId}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-course-select">
                    Course / Specialization <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <select
                    id="st-course-select"
                    value={studentForm.courseId}
                    onChange={(e) => handleCourseChange(e.target.value)}
                    disabled={!studentForm.departmentId || filteredCourses.length === 0}
                    aria-invalid={Boolean(fieldErrors.courseId)}
                    style={fieldErrors.courseId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  >
                    <option value="">
                      {!studentForm.departmentId
                        ? '— Select a Department first —'
                        : filteredCourses.length === 0
                        ? 'No active courses in this department'
                        : '— Select Course / Degree —'}
                    </option>
                    {filteredCourses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} {c.code ? `(${c.code})` : ''}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.courseId && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.courseId}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-sem">
                    Current Semester <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <select
                    id="st-sem"
                    value={studentForm.semester}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, semester: e.target.value });
                      clearFieldError('semester');
                    }}
                    aria-invalid={Boolean(fieldErrors.semester)}
                    style={fieldErrors.semester ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  >
                    <option value="">— Select Semester —</option>
                    {SEMESTER_OPTIONS.map((sem) => (
                      <option key={sem} value={String(sem)}>
                        Semester {sem}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.semester && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.semester}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-passing-year">
                    Passing Year <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <select
                    id="st-passing-year"
                    value={studentForm.passingYear}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, passingYear: e.target.value });
                      clearFieldError('passingYear');
                    }}
                    aria-invalid={Boolean(fieldErrors.passingYear)}
                    style={fieldErrors.passingYear ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  >
                    <option value="">— Select Passing Year —</option>
                    {YEAR_OPTIONS.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
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

            {/* SECTION 3: Performance & Academic Standing */}
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
                  Cumulative CGPA and active backlog standing
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="field">
                  <label htmlFor="st-cgpa">
                    CGPA (0.00 – 10.00) <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="st-cgpa"
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    placeholder="e.g. 8.75"
                    value={studentForm.cgpa}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, cgpa: e.target.value });
                      clearFieldError('cgpa');
                    }}
                    aria-invalid={Boolean(fieldErrors.cgpa)}
                    style={fieldErrors.cgpa ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.cgpa && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.cgpa}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="st-backlogs">Active Backlogs</label>
                  <input
                    id="st-backlogs"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={studentForm.backlogs}
                    onChange={(e) => {
                      setStudentForm({ ...studentForm, backlogs: e.target.value });
                      clearFieldError('backlogs');
                    }}
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

            {/* SECTION 4: Residential Details */}
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
                  Permanent address or campus accommodation
                </p>
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="st-addr">Residential Address</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                    {studentForm.address ? studentForm.address.length : 0}/500
                  </span>
                </div>
                <textarea
                  id="st-addr"
                  rows={3}
                  placeholder="Permanent address or campus hostel details"
                  value={studentForm.address}
                  onChange={(e) => {
                    setStudentForm({ ...studentForm, address: e.target.value });
                    clearFieldError('address');
                  }}
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
          </>
        )}

        {/* Dynamic Fields for Company */}
        {activeTab === 'COMPANY' && (
          <>
            {/* SECTION 1: Company Identity */}
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
                  <BuildingIcon size={16} color="var(--primary, #0284c7)" /> Company Identity
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Organization name, domain, founding year, and web presence
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="field">
                  <label htmlFor="co-name">
                    Company Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="co-name"
                    placeholder="e.g. Acme Innovations Corp"
                    value={companyForm.companyName}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, companyName: e.target.value });
                      clearFieldError('companyName');
                    }}
                    maxLength={200}
                    aria-invalid={Boolean(fieldErrors.companyName)}
                    style={fieldErrors.companyName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.companyName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.companyName}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="co-ind">
                    Industry Type <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="co-ind"
                    placeholder="e.g. Software & Technology, Finance, Healthcare"
                    value={companyForm.industryType}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, industryType: e.target.value });
                      clearFieldError('industryType');
                    }}
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.industryType)}
                    style={fieldErrors.industryType ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.industryType && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.industryType}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="co-year">
                    Year Established <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <select
                    id="co-year"
                    value={companyForm.yearEstablished}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, yearEstablished: e.target.value });
                      clearFieldError('yearEstablished');
                    }}
                    aria-invalid={Boolean(fieldErrors.yearEstablished)}
                    style={fieldErrors.yearEstablished ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  >
                    <option value="">— Select Year Established —</option>
                    {COMPANY_YEAR_OPTIONS.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.yearEstablished && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.yearEstablished}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="co-web">Website URL</label>
                  <input
                    id="co-web"
                    type="url"
                    placeholder="https://company.example.com"
                    value={companyForm.website}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, website: e.target.value });
                      clearFieldError('website');
                    }}
                    maxLength={300}
                    aria-invalid={Boolean(fieldErrors.website)}
                    style={fieldErrors.website ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.website && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.website}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 2: Recruiter Contact Details */}
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
                  <UserIcon size={16} color="var(--primary, #0284c7)" /> Recruiter Contact
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Lead recruiter account credentials and contact point
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="field">
                  <label htmlFor="co-hr">
                    HR / Recruiter Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="co-hr"
                    placeholder="Full Name of Lead Recruiter"
                    value={companyForm.hrRecruiterName}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, hrRecruiterName: e.target.value });
                      clearFieldError('hrRecruiterName');
                    }}
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.hrRecruiterName)}
                    style={fieldErrors.hrRecruiterName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.hrRecruiterName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.hrRecruiterName}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="co-desig">
                    Designation / Role <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="co-desig"
                    placeholder="e.g. Talent Acquisition Lead"
                    value={companyForm.designation}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, designation: e.target.value });
                      clearFieldError('designation');
                    }}
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.designation)}
                    style={fieldErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.designation && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.designation}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="cu-email">
                    Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="cu-email"
                    type="email"
                    placeholder="recruiter@company.example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.email && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="co-mob">
                    Mobile Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="co-mob"
                    type="tel"
                    placeholder="+91 9876543210"
                    value={companyForm.mobileNumber}
                    onChange={(e) => {
                      setCompanyForm({ ...companyForm, mobileNumber: e.target.value });
                      clearFieldError('mobileNumber');
                    }}
                    maxLength={15}
                    aria-invalid={Boolean(fieldErrors.mobileNumber)}
                    style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  />
                  {fieldErrors.mobileNumber && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.mobileNumber}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* SECTION 3: Overview & Location */}
            <section className="form-section-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
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
                  <MapPinIcon size={16} color="var(--primary, #0284c7)" /> Overview & Location
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Physical office address and descriptive overview visible to candidates
                </p>
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="co-addr">
                    Office Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                    {companyForm.officeAddress ? companyForm.officeAddress.length : 0}/500
                  </span>
                </div>
                <textarea
                  id="co-addr"
                  rows={3}
                  placeholder="Headquarters or regional office address"
                  value={companyForm.officeAddress}
                  onChange={(e) => {
                    setCompanyForm({ ...companyForm, officeAddress: e.target.value });
                    clearFieldError('officeAddress');
                  }}
                  maxLength={500}
                  aria-invalid={Boolean(fieldErrors.officeAddress)}
                  style={fieldErrors.officeAddress ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                />
                {fieldErrors.officeAddress && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.officeAddress}
                  </span>
                )}
              </div>

              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="co-desc">
                    Company Description <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted, #64748b)' }}>
                    {companyForm.description ? companyForm.description.length : 0}/1000
                  </span>
                </div>
                <textarea
                  id="co-desc"
                  rows={3}
                  placeholder="Brief overview of company culture and operations"
                  value={companyForm.description}
                  onChange={(e) => {
                    setCompanyForm({ ...companyForm, description: e.target.value });
                    clearFieldError('description');
                  }}
                  maxLength={1000}
                  aria-invalid={Boolean(fieldErrors.description)}
                  style={fieldErrors.description ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                />
                {fieldErrors.description && (
                  <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.description}
                  </span>
                )}
              </div>
            </section>
          </>
        )}

        {/* Dynamic Fields for Placement Officer */}
        {activeTab === 'PLACEMENT' && (
          <>
            {/* SECTION 1: Professional Identity */}
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
                  <BriefcaseIcon size={16} color="var(--primary, #0284c7)" /> Professional Identity & Credentials
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Staff identifier, designation, and portal authorization role
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', alignItems: 'start' }}>
                <div className="field">
                  <label htmlFor="po-emp">
                    Employee ID <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="po-emp"
                    placeholder="e.g. EMP-PL-101"
                    value={officerForm.employeeId}
                    onChange={(e) => {
                      setOfficerForm({ ...officerForm, employeeId: e.target.value });
                      clearFieldError('employeeId');
                    }}
                    maxLength={50}
                    aria-invalid={Boolean(fieldErrors.employeeId)}
                    style={fieldErrors.employeeId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    autoComplete="off"
                  />
                  {fieldErrors.employeeId && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.employeeId}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="po-desig">
                    Designation (Job Title) <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="po-desig"
                    placeholder="e.g. Placement Coordinator / Officer"
                    value={officerForm.designation}
                    onChange={(e) => {
                      setOfficerForm({ ...officerForm, designation: e.target.value });
                      clearFieldError('designation');
                    }}
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.designation)}
                    style={fieldErrors.designation ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    autoComplete="off"
                  />
                  {fieldErrors.designation && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.designation}
                    </span>
                  )}
                </div>

                <div className="field" style={selectedRoleId === 'ROLE_PLACEMENT_COORDINATOR' ? {} : { gridColumn: '1 / -1' }}>
                  <label htmlFor="po-role">
                    Assigned Authorization Role <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <select
                    id="po-role"
                    value={selectedRoleId}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setSelectedRoleId(newRole);
                      if (newRole !== 'ROLE_PLACEMENT_COORDINATOR') {
                        setOfficerForm((prev) => ({ ...prev, departmentId: '', department: '' }));
                      }
                      clearFieldError('role');
                    }}
                    aria-invalid={Boolean(fieldErrors.role)}
                    style={fieldErrors.role ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                  >
                    <option value="">— Select Assigned Role —</option>
                    {roles
                      .filter((r) => ['ROLE_PLACEMENT_COORDINATOR', 'ROLE_PLACEMENT_HEAD'].includes(r._id))
                      .map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.name} ({r._id})
                        </option>
                      ))}
                  </select>
                  {fieldErrors.role && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.role}
                    </span>
                  )}
                </div>

                {selectedRoleId === 'ROLE_PLACEMENT_COORDINATOR' && (
                  <div className="field">
                    <label htmlFor="po-dept">
                      Assigned Department <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                    </label>
                    <select
                      id="po-dept"
                      value={officerForm.departmentId || ''}
                      onChange={(e) => {
                        const dId = e.target.value;
                        const matched = departments.find((d) => String(d._id) === String(dId));
                        setOfficerForm((prev) => ({
                          ...prev,
                          departmentId: dId,
                          department: matched ? matched.name : ''
                        }));
                        clearFieldError('departmentId');
                      }}
                      aria-invalid={Boolean(fieldErrors.departmentId)}
                      style={fieldErrors.departmentId ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    >
                      <option value="">— Select Department —</option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name} {d.code ? `(${d.code})` : ''}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.departmentId && (
                      <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                        {fieldErrors.departmentId}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* SECTION 2: Personal & Contact Information */}
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
                  <UserIcon size={16} color="var(--primary, #0284c7)" /> Personal Details & Contact
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                  Staff full name and official contact email
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                <div className="field">
                  <label htmlFor="po-fn">
                    First Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="po-fn"
                    placeholder="Given name"
                    value={officerForm.firstName}
                    onChange={(e) => {
                      setOfficerForm({ ...officerForm, firstName: e.target.value });
                      clearFieldError('firstName');
                    }}
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    style={fieldErrors.firstName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    autoComplete="off"
                  />
                  {fieldErrors.firstName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.firstName}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="po-ln">
                    Last Name <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="po-ln"
                    placeholder="Surname / Family name"
                    value={officerForm.lastName}
                    onChange={(e) => {
                      setOfficerForm({ ...officerForm, lastName: e.target.value });
                      clearFieldError('lastName');
                    }}
                    maxLength={100}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    style={fieldErrors.lastName ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    autoComplete="off"
                  />
                  {fieldErrors.lastName && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.lastName}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="po-email">
                    Official Email Address <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="po-email"
                    type="email"
                    placeholder="officer@university.edu"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearFieldError('email');
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    style={fieldErrors.email ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    autoComplete="off"
                  />
                  {fieldErrors.email && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.email}
                    </span>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="po-mob">
                    Mobile Number <span style={{ color: 'var(--red, #e53e3e)' }}>*</span>
                  </label>
                  <input
                    id="po-mob"
                    type="tel"
                    placeholder="+91 9876543210"
                    value={officerForm.mobileNumber}
                    onChange={(e) => {
                      setOfficerForm({ ...officerForm, mobileNumber: e.target.value });
                      clearFieldError('mobileNumber');
                    }}
                    maxLength={15}
                    aria-invalid={Boolean(fieldErrors.mobileNumber)}
                    style={fieldErrors.mobileNumber ? { borderColor: 'var(--red, #e53e3e)' } : {}}
                    autoComplete="off"
                  />
                  {fieldErrors.mobileNumber && (
                    <span className="field-error" style={{ color: 'var(--red, #e53e3e)', fontSize: '0.82rem', marginTop: '4px', display: 'block' }}>
                      {fieldErrors.mobileNumber}
                    </span>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '12px'
          }}
        >
          <button className="ghost" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? 'Creating…' : `Register ${activeTab === 'STUDENT' ? 'Student' : activeTab === 'COMPANY' ? 'Company' : 'Placement Officer'} Account`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

