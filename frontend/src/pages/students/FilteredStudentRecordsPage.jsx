import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { studentService } from '../../services/student.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { importService } from '../../services/import.service.js';
import { filterStudents, getAvailableCourses, shouldResetCourseSelection } from '../../utils/student-filter.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import {
  ArrowLeftIcon,
  DownloadIcon,
  ClockIcon,
  SearchIcon
} from '../../components/common/Icons.jsx';

function getHashQueryParams() {
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

export function FilteredStudentRecordsPage() {
  const { user: currentUser, role, has } = useAuth();
  const { toast } = useToast();

  const isCoordinator = role?.id === 'ROLE_PLACEMENT_COORDINATOR' || currentUser?.roleId === 'ROLE_PLACEMENT_COORDINATOR';
  const coordinatorDeptId = currentUser?.departmentId;

  const queryParams = useMemo(() => getHashQueryParams(), []);
  const [search, setSearch] = useState(queryParams.get('search') || '');
  const [departmentFilter, setDepartmentFilter] = useState(() => {
    if (isCoordinator && coordinatorDeptId) return String(coordinatorDeptId);
    return '';
  });
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState(queryParams.get('semester') || '');
  const [minCgpaFilter, setMinCgpaFilter] = useState(queryParams.get('cgpa') || queryParams.get('minCgpa') || '');
  const [backlogFilter, setBacklogFilter] = useState(queryParams.get('backlogs') || '');

  useEffect(() => {
    if (!isCoordinator && (window.location.hash.includes('course') || window.location.hash.includes('department'))) {
      const cleanHash = window.location.hash.split('?')[0];
      window.history.replaceState(null, '', cleanHash);
    }
  }, [isCoordinator]);

  useEffect(() => {
    if (isCoordinator && coordinatorDeptId && departmentFilter !== String(coordinatorDeptId)) {
      setDepartmentFilter(String(coordinatorDeptId));
    }
  }, [isCoordinator, coordinatorDeptId, departmentFilter]);

  const [students, setStudents] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [coursesList, setCoursesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Pagination for display preview
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsData, deptsData, coursesData] = await Promise.all([
        studentService.listStudents({ limit: 500 }),
        departmentService.listDepartments({ limit: 100, isActive: true }).catch(() => ({ items: [] })),
        courseService.listCourses({ limit: 100, isActive: true }).catch(() => ({ items: [] }))
      ]);
      const resolvedDepts = deptsData.items || deptsData || [];
      const resolvedCourses = coursesData.items || coursesData || [];
      setStudents(studentsData.items || []);
      setDepartmentsList(resolvedDepts);
      setCoursesList(resolvedCourses);
    } catch (err) {
      toast(err.message || 'Failed to load student records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableCourses = useMemo(() => {
    if (isCoordinator) {
      if (coordinatorDeptId) {
        const scoped = getAvailableCourses(coursesList, coordinatorDeptId);
        return scoped.length > 0 ? scoped : coursesList;
      }
      return coursesList;
    }
    return getAvailableCourses(coursesList, departmentFilter);
  }, [coursesList, departmentFilter, isCoordinator, coordinatorDeptId]);

  const handleDepartmentFilterChange = (newDeptId) => {
    if (isCoordinator && coordinatorDeptId) return;
    setDepartmentFilter(newDeptId);
    setCurrentPage(1);
    if (!newDeptId || shouldResetCourseSelection(courseFilter, newDeptId, coursesList)) {
      setCourseFilter('');
    }
  };

  // Reset to page 1 on search or filter change
  const handleSearchChange = (val) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const filteredStudents = useMemo(() => {
    return filterStudents({
      students,
      search,
      departmentId: departmentFilter,
      courseId: courseFilter,
      departments: departmentsList,
      courses: coursesList,
      semester: semesterFilter,
      minCgpa: minCgpaFilter,
      backlogs: backlogFilter
    });
  }, [students, search, departmentFilter, courseFilter, departmentsList, coursesList, semesterFilter, minCgpaFilter, backlogFilter]);

  // Paginated slice for read-only preview table
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, currentPage]);

  const handleBackToImport = () => {
    window.location.hash = '#/import/student';
  };

  const handleDownloadExcel = async () => {
    setExporting(true);
    try {
      await importService.exportData('student', {
        filtered: true,
        search,
        department: departmentFilter,
        course: courseFilter,
        semester: semesterFilter,
        minCgpa: minCgpaFilter,
        backlogs: backlogFilter
      });
      toast(`Exported ${filteredStudents.length} matching student record(s) to Excel.`);
    } catch (err) {
      toast(err.message || 'Failed to download filtered Excel.');
    } finally {
      setExporting(false);
    }
  };

  // Active filter label breakdown
  const activeDeptObj = departmentsList.find((d) => String(d._id) === String(departmentFilter));
  const activeCourseObj = coursesList.find((c) => String(c._id) === String(courseFilter));

  const filterSummaryParts = [];
  if (search.trim()) filterSummaryParts.push(`Search: "${search.trim()}"`);
  if (activeDeptObj) filterSummaryParts.push(`Department: ${activeDeptObj.name}`);
  if (activeCourseObj) filterSummaryParts.push(`Course: ${activeCourseObj.name}`);
  if (semesterFilter) filterSummaryParts.push(`Semester: ${semesterFilter}`);
  if (minCgpaFilter) filterSummaryParts.push(`Min CGPA: ${minCgpaFilter}`);
  if (backlogFilter) {
    const bLabel =
      backlogFilter === '0'
        ? '0 Backlogs (Clean)'
        : backlogFilter === 'max1'
        ? 'Max 1 Backlog'
        : backlogFilter === 'max2'
        ? 'Max 2 Backlogs'
        : 'Has Backlogs (>0)';
    filterSummaryParts.push(bLabel);
  }

  const subtitleText = filterSummaryParts.length > 0
    ? `Filtered view by ${filterSummaryParts.join(' • ')}`
    : 'All student records (Read-Only) — filter by department, course, semester, CGPA or backlogs and export to Excel';

  const headerActions = (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        className="secondary"
        type="button"
        id="btn-back-to-import"
        onClick={handleBackToImport}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '9px 14px',
          fontWeight: 600,
          fontSize: '0.88rem',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        <ArrowLeftIcon size={16} /> Back to Import Page
      </button>

      <button
        className="primary"
        type="button"
        id="btn-download-filtered-excel"
        disabled={exporting || filteredStudents.length === 0}
        onClick={handleDownloadExcel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 18px',
          fontWeight: 600,
          fontSize: '0.88rem',
          borderRadius: '8px',
          backgroundColor: '#1d68ff',
          color: '#ffffff',
          border: 'none',
          cursor: exporting || filteredStudents.length === 0 ? 'not-allowed' : 'pointer',
          opacity: exporting || filteredStudents.length === 0 ? 0.65 : 1
        }}
      >
        {exporting ? (
          <>
            <ClockIcon size={16} /> Generating Excel...
          </>
        ) : (
          <>
            <DownloadIcon size={16} /> Download Filtered Excel ({filteredStudents.length})
          </>
        )}
      </button>
    </div>
  );

  return (
    <PortalLayout
      title="Student Records"
      subtitle={subtitleText}
      actions={headerActions}
      currentPath="/students"
      category="STUDENTS"
      section="Students"
    >
      <section className="page-body">
        {/* Filter Toolbar Card */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'end',
              gap: '8px',
              flexWrap: 'nowrap',
              overflowX: 'auto',
              paddingBottom: '4px'
            }}
          >
            <div style={{ flex: '1 1 180px', minWidth: '140px' }}>
              <label
                htmlFor="filtered-search-input"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Search Records
              </label>
              <input
                id="filtered-search-input"
                type="text"
                placeholder="ID, Name, Email, Branch…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem'
                }}
              />
            </div>

            {!isCoordinator && (
              <div style={{ flex: '1 1 145px', minWidth: '130px' }}>
                <label
                  htmlFor="filtered-dept-select"
                  style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
                >
                  Department
                </label>
                <select
                  id="filtered-dept-select"
                  value={String(departmentFilter || '')}
                  disabled={isCoordinator && Boolean(coordinatorDeptId)}
                  title={isCoordinator && Boolean(coordinatorDeptId) ? 'Department locked to your assigned department' : 'Filter by department'}
                  onChange={(e) => handleDepartmentFilterChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 8px',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.84rem',
                    backgroundColor: isCoordinator && Boolean(coordinatorDeptId) ? '#f1f5f9' : '#ffffff',
                    cursor: isCoordinator && Boolean(coordinatorDeptId) ? 'not-allowed' : 'default',
                    opacity: isCoordinator && Boolean(coordinatorDeptId) ? 0.85 : 1
                  }}
                >
                  {!isCoordinator && <option value="">All Departments</option>}
                  {departmentsList
                    .filter((d) => !isCoordinator || !coordinatorDeptId || String(d._id) === String(coordinatorDeptId))
                    .map((d) => (
                      <option key={d._id} value={String(d._id)}>
                        {d.name} {d.code ? `(${d.code})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div style={{ flex: '1 1 135px', minWidth: '120px' }}>
              <label
                htmlFor="filtered-course-select"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Course
              </label>
              <select
                id="filtered-course-select"
                value={String(courseFilter || '')}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setCurrentPage(1);
                }}
                disabled={!isCoordinator && !departmentFilter}
                title={!isCoordinator && !departmentFilter ? 'Please select a department first' : 'Filter by course'}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  backgroundColor: (!isCoordinator && !departmentFilter) ? '#f1f5f9' : '#ffffff',
                  cursor: (!isCoordinator && !departmentFilter) ? 'not-allowed' : 'default',
                  opacity: (!isCoordinator && !departmentFilter) ? 0.75 : 1
                }}
              >
                <option value="">
                  {!isCoordinator && !departmentFilter
                    ? 'Select Department First'
                    : availableCourses.length === 0
                    ? 'No courses'
                    : 'All Courses'}
                </option>
                {availableCourses.map((c) => (
                  <option key={c._id} value={String(c._id)}>
                    {c.name} {c.code ? `(${c.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '0 1 110px', minWidth: '95px' }}>
              <label
                htmlFor="filtered-semester-select"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Semester
              </label>
              <select
                id="filtered-semester-select"
                value={semesterFilter}
                onChange={(e) => {
                  setSemesterFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>
                    Sem {sem}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '0 1 95px', minWidth: '85px' }}>
              <label
                htmlFor="filtered-cgpa-input"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Min CGPA
              </label>
              <input
                id="filtered-cgpa-input"
                type="number"
                min="0"
                max="10"
                step="0.1"
                placeholder="e.g. 7.0"
                value={minCgpaFilter}
                onChange={(e) => {
                  setMinCgpaFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem'
                }}
              />
            </div>

            <div style={{ flex: '0 1 130px', minWidth: '120px' }}>
              <label
                htmlFor="filtered-backlogs-select"
                style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '5px', whiteSpace: 'nowrap' }}
              >
                Active Backlogs
              </label>
              <select
                id="filtered-backlogs-select"
                value={backlogFilter}
                onChange={(e) => {
                  setBacklogFilter(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  backgroundColor: '#ffffff'
                }}
              >
                <option value="">All Status</option>
                <option value="0">0 (Clean)</option>
                <option value="max1">Max 1</option>
                <option value="max2">Max 2</option>
                <option value="has">Has Backlogs</option>
              </select>
            </div>

            <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
              {(search || departmentFilter || courseFilter || semesterFilter || minCgpaFilter || backlogFilter) && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSearch('');
                    setDepartmentFilter(isCoordinator && coordinatorDeptId ? coordinatorDeptId : '');
                    setCourseFilter('');
                    setSemesterFilter('');
                    setMinCgpaFilter('');
                    setBacklogFilter('');
                    setCurrentPage(1);
                    if (window.location.hash.includes('?')) {
                      const cleanHash = window.location.hash.split('?')[0];
                      window.history.replaceState(null, '', cleanHash);
                    }
                  }}
                  style={{
                    padding: '7px 12px',
                    fontSize: '0.80rem',
                    color: '#64748b',
                    borderRadius: '7px',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Status summary pill */}
          <div
            style={{
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#1e40af',
                  backgroundColor: '#eff6ff',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  border: '1px solid #dbeafe'
                }}
              >
                ✓ {filteredStudents.length} of {students.length} students matching
              </span>
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Strictly read-only preview • Entire matching dataset is exported to Excel
              </span>
            </div>
          </div>
        </div>

        {/* Read-Only Table Card */}
        <article className="card table-card" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>UNIVERSITY ID</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>STUDENT NAME</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>EMAIL</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>MOBILE NUMBER</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>DEPARTMENT</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>COURSE / BRANCH</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>SEM</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>PASSING YEAR</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>CGPA</th>
                  <th style={{ padding: '12px 14px', fontSize: '0.78rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>BACKLOGS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '36px', textAlign: 'center', color: '#64748b' }}>
                      Loading filtered student records…
                    </td>
                  </tr>
                ) : paginatedStudents.length > 0 ? (
                  paginatedStudents.map((s) => {
                    const fullName = [s.firstName, s.lastName].filter(Boolean).join(' ') || '—';
                    const deptName = s.departmentId?.name || s.department || '—';
                    const courseName = s.courseId?.name || s.branch || '—';
                    const formattedCgpa = s.cgpa !== undefined && s.cgpa !== null ? Number(s.cgpa).toFixed(2) : '—';
                    const backlogs = s.backlogs ?? 0;

                    return (
                      <tr key={s._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {s.universityId || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1e293b' }}>
                          {fullName}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {s.email || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {s.mobileNumber || s.phone || '—'}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {deptName}
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {courseName}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569' }}>
                          {s.semester ?? '—'}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569' }}>
                          {s.passingYear ?? '—'}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          {formattedCgpa}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              backgroundColor: backlogs > 0 ? '#fef2f2' : '#f0fdf4',
                              color: backlogs > 0 ? '#b91c1c' : '#15803d'
                            }}
                          >
                            {backlogs}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="10" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ maxWidth: '380px', margin: '0 auto' }}>
                        <SearchIcon size={36} color="#94a3b8" style={{ marginBottom: '8px' }} />
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: '#1e293b' }}>
                          No student records found
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b' }}>
                          No students matched your active filter criteria. Try adjusting the search term or department and course filters.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredStudents.length > PAGE_SIZE && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderTop: '1px solid #e2e8f0',
                fontSize: '0.84rem',
                color: '#64748b'
              }}
            >
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                {Math.min(currentPage * PAGE_SIZE, filteredStudents.length)} of {filteredStudents.length} matching students
              </span>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '5px 12px', fontSize: '0.82rem', borderRadius: '6px' }}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '5px 12px', fontSize: '0.82rem', borderRadius: '6px' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </article>
      </section>
    </PortalLayout>
  );
}
