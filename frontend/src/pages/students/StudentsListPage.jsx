import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { studentService } from '../../services/student.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { importService } from '../../services/import.service.js';
import { filterStudents, getAvailableCourses, shouldResetCourseSelection } from '../../utils/student-filter.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { StudentModal } from '../../components/students/StudentModal.jsx';
import { CreateUserModal } from '../../components/users/CreateUserModal.jsx';
import {
  DownloadIcon,
  UploadIcon,
  FilterIcon,
  TrashIcon,
  PlusIcon
} from '../../components/common/Icons.jsx';

function getHashQueryParams() {
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(qIndex + 1));
}

export function StudentsListPage() {
  const { has } = useAuth();
  const { toast } = useToast();

  const queryParams = useMemo(() => getHashQueryParams(), []);
  const [search, setSearch] = useState(queryParams.get('search') || '');
  const [departmentFilter, setDepartmentFilter] = useState(
    queryParams.get('department') || queryParams.get('departmentId') || ''
  );
  const [courseFilter, setCourseFilter] = useState(
    queryParams.get('course') || queryParams.get('courseId') || ''
  );

  const [students, setStudents] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [coursesList, setCoursesList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [tempPasswordNotice, setTempPasswordNotice] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentsData, deptsData, coursesData] = await Promise.all([
        studentService.listStudents({ limit: 100 }),
        departmentService.listDepartments({ limit: 100, isActive: true }).catch(() => ({ items: [] })),
        courseService.listCourses({ limit: 100, isActive: true }).catch(() => ({ items: [] }))
      ]);
      setStudents(studentsData.items || []);
      setDepartmentsList(deptsData.items || deptsData || []);
      setCoursesList(coursesData.items || coursesData || []);
    } catch (err) {
      toast(err.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleHash = () => {
      const qp = getHashQueryParams();
      if (qp.has('search')) setSearch(qp.get('search') || '');
      if (qp.has('department') || qp.has('departmentId')) {
        setDepartmentFilter(qp.get('department') || qp.get('departmentId') || '');
      }
      if (qp.has('course') || qp.has('courseId')) {
        setCourseFilter(qp.get('course') || qp.get('courseId') || '');
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const availableCourses = useMemo(() => {
    return getAvailableCourses(coursesList, departmentFilter);
  }, [coursesList, departmentFilter]);

  const handleDepartmentFilterChange = (newDeptId) => {
    setDepartmentFilter(newDeptId);
    if (!newDeptId || shouldResetCourseSelection(courseFilter, newDeptId, coursesList)) {
      setCourseFilter('');
    }
  };

  useEffect(() => {
    if (!departmentFilter && courseFilter) {
      setCourseFilter('');
    } else if (shouldResetCourseSelection(courseFilter, departmentFilter, coursesList)) {
      setCourseFilter('');
    }
  }, [departmentFilter, courseFilter, coursesList]);

  const filteredStudents = useMemo(() => {
    return filterStudents({
      students,
      search,
      departmentId: departmentFilter,
      courseId: courseFilter,
      departments: departmentsList,
      courses: coursesList
    });
  }, [students, search, departmentFilter, courseFilter, departmentsList, coursesList]);

  const handleDelete = async () => {
    if (!deletingStudent) return;
    try {
      await studentService.deleteStudent(deletingStudent._id);
      toast('Student profile and user account deleted.');
      setDeletingStudent(null);
      loadData();
    } catch (err) {
      toast(err.message || 'Failed to delete student.');
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    let count = 0;
    try {
      for (const s of filteredStudents) {
        try {
          await studentService.deleteStudent(s._id);
          count++;
        } catch (e) {
          console.error('Failed to delete student:', s._id, e);
        }
      }
      toast(`Successfully deleted ${count} student profile(s) and linked user accounts.`);
    } catch (err) {
      toast(err.message || 'Failed to delete students.');
    } finally {
      setDeleteAllConfirm(false);
      await loadData();
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      await importService.exportData('student', { filtered: false });
      toast('Exported all student records to Excel.');
    } catch (err) {
      toast(err.message || 'Failed to export students.');
    } finally {
      setExporting(false);
    }
  };

  // Navigates to dedicated read-only Filtered Student Records page preserving active filters
  const handleExportFiltered = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (departmentFilter) params.set('department', departmentFilter);
    if (courseFilter) params.set('course', courseFilter);
    const qs = params.toString();
    window.location.hash = `#/students/filtered${qs ? `?${qs}` : ''}`;
  };

  const handleDownloadTemplate = async () => {
    try {
      await importService.downloadTemplate('student');
      toast('Downloaded Student Excel template.');
    } catch (err) {
      toast(err.message || 'Failed to download template.');
    }
  };

  const headerActions = (
    <div className="button-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      {has('STUDENT_IMPORT') && (
        <>
          <button
            className="secondary"
            type="button"
            title="Download blank Excel template matching student form fields"
            onClick={handleDownloadTemplate}
          >
            <DownloadIcon size={15} /> Template
          </button>
          <a
            className="secondary"
            href="#/import/student"
            style={{ textDecoration: 'none' }}
          >
            <UploadIcon size={15} /> Import Excel
          </a>
        </>
      )}
      {(has('STUDENT_READ') || has('USER_READ')) && (
        <>
          <button
            className="secondary"
            type="button"
            disabled={exporting || students.length === 0}
            onClick={handleExportAll}
          >
            <DownloadIcon size={16} /> Export All
          </button>
          <button
            className="secondary"
            type="button"
            id="btn-export-filtered"
            disabled={filteredStudents.length === 0}
            onClick={handleExportFiltered}
          >
            <FilterIcon size={16} /> Export Filtered ({filteredStudents.length})
          </button>
        </>
      )}
      {has('USER_DELETE') && filteredStudents.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm(true)}
        >
          <TrashIcon size={16} /> Delete All Students ({filteredStudents.length})
        </button>
      )}
      {(has('USER_CREATE') || has('STUDENT_CREATE')) && (
        <button
          className="primary"
          id="btn-create-student"
          type="button"
          onClick={() => {
            setEditingStudent(null);
            setStudentModalOpen(true);
          }}
        >
          <PlusIcon size={16} /> Create Student
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Student Management"
      subtitle="Manage student domain profiles, academic details, and linked account credentials."
      actions={headerActions}
      currentPath="/students"
    >
      <section>
        {/* Search, Department and Course Filters Bar */}
        <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
          <input
            id="student-search"
            style={{ flex: '1 1 260px' }}
            placeholder="Search by University ID, Name, Email, or Branch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="student-department-filter"
            style={{ flex: '0 1 220px' }}
            value={departmentFilter}
            onChange={(e) => handleDepartmentFilterChange(e.target.value)}
          >
            <option value="">All Departments</option>
            {departmentsList.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} {d.code ? `(${d.code})` : ''}
              </option>
            ))}
          </select>
          <select
            id="student-course-filter"
            style={{ flex: '0 1 240px' }}
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            disabled={departmentFilter && availableCourses.length === 0}
          >
            <option value="">All Courses / Specializations</option>
            {availableCourses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} {c.code ? `(${c.code})` : ''}
              </option>
            ))}
          </select>
          {(search || departmentFilter || courseFilter) && (
            <button
              className="secondary"
              type="button"
              style={{ padding: '8px 14px', fontSize: '0.84rem' }}
              onClick={() => {
                setSearch('');
                setDepartmentFilter('');
                setCourseFilter('');
              }}
            >
              ✕ Clear Filters
            </button>
          )}
        </div>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>University ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Branch / Dept</th>
                  <th>Sem</th>
                  <th>CGPA</th>
                  <th>Backlogs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="empty">
                      Loading student records…
                    </td>
                  </tr>
                ) : filteredStudents.length > 0 ? (
                  filteredStudents.map((s) => (
                    <tr key={s._id}>
                      <td>
                        <strong>{s.universityId}</strong>
                      </td>
                      <td>
                        {s.firstName} {s.lastName}
                      </td>
                      <td>{s.email}</td>
                      <td>
                        {s.departmentId?.name || (typeof s.departmentId === 'string' && s.department) || s.department || s.branch || '—'}
                      </td>
                      <td>{s.semester ?? s.currentSemester ?? '—'}</td>
                      <td>{s.cgpa !== undefined && s.cgpa !== null ? Number(s.cgpa).toFixed(2) : '—'}</td>
                      <td>{s.backlogs ?? s.activeBacklogs ?? 0}</td>
                      <td className="actions">
                        {(has('USER_UPDATE') || has('STUDENT_UPDATE')) && (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              setEditingStudent(s);
                              setStudentModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {(has('USER_DELETE') || has('STUDENT_DELETE')) && (
                          <button
                            className="link-button"
                            style={{ color: 'var(--red, #e53e3e)' }}
                            type="button"
                            onClick={() => setDeletingStudent(s)}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty">
                      No student records found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {/* Edit / Create Student Profile Modal */}
      {studentModalOpen && (
        <StudentModal
          isOpen={studentModalOpen}
          student={editingStudent}
          onClose={() => {
            setStudentModalOpen(false);
            setEditingStudent(null);
          }}
          onSaved={() => {
            setStudentModalOpen(false);
            setEditingStudent(null);
            loadData();
          }}
        />
      )}

      {/* Standalone Create User Account Modal if needed */}
      {createModalOpen && (
        <CreateUserModal
          isOpen={createModalOpen}
          defaultUserType="STUDENT"
          onClose={() => setCreateModalOpen(false)}
          onCreated={(res) => {
            setCreateModalOpen(false);
            if (res?.tempPassword) {
              setTempPasswordNotice({ email: res.user?.email, tempPassword: res.tempPassword });
            }
            loadData();
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingStudent)}
        title="Delete Student Profile"
        message={`Are you sure you want to delete ${deletingStudent?.firstName || ''} ${deletingStudent?.lastName || ''} (${deletingStudent?.universityId || ''})? This will also remove the linked login account.`}
        confirmLabel="Delete Student"
        danger={true}
        onConfirm={handleDelete}
        onClose={() => setDeletingStudent(null)}
      />

      {/* Delete All Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteAllConfirm}
        title="Delete All Matching Students"
        message={`Are you sure you want to permanently delete all ${filteredStudents.length} matching student records and their linked login accounts? This action cannot be undone.`}
        confirmLabel={`Delete All (${filteredStudents.length})`}
        danger={true}
        onConfirm={handleDeleteAll}
        onClose={() => setDeleteAllConfirm(false)}
      />
    </PortalLayout>
  );
}
