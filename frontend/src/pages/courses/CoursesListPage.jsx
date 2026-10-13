import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { courseService } from '../../services/course.service.js';
import { departmentService } from '../../services/department.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { CourseModal, COURSE_LEVEL_OPTIONS } from '../../components/courses/CourseModal.jsx';

const LEVEL_LABEL_MAP = {
  UNDERGRADUATE: 'Undergraduate',
  POSTGRADUATE: 'Postgraduate',
  DIPLOMA: 'Diploma',
  CERTIFICATE: 'Certificate',
  DOCTORAL: 'Doctoral'
};

export function CoursesListPage() {
  const { has } = useAuth();
  const { toast } = useToast();

  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [courseRes, deptRes] = await Promise.all([
        courseService.listCourses({ limit: 100 }),
        departmentService.listDepartments({ limit: 100 })
      ]);
      setCourses(courseRes.items || []);
      setDepartments(deptRes.items || []);
    } catch (err) {
      toast(err.message || 'Failed to load courses data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCourses = useMemo(() => {
    const q = search.toLowerCase().trim();
    return courses.filter((c) => {
      const matchesSearch =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.departmentId?.name?.toLowerCase().includes(q);

      const deptId = typeof c.departmentId === 'object' ? c.departmentId?._id : c.departmentId;
      const matchesDepartment = !selectedDepartment || String(deptId) === String(selectedDepartment);
      const matchesLevel = !selectedLevel || c.level === selectedLevel;

      return matchesSearch && matchesDepartment && matchesLevel;
    });
  }, [courses, search, selectedDepartment, selectedLevel]);

  const handleCreateOrUpdate = async (formData) => {
    setIsProcessing(true);
    try {
      if (editingCourse) {
        await courseService.updateCourse(editingCourse._id, formData);
        toast('Course updated successfully.');
      } else {
        await courseService.createCourse(formData);
        toast('Course created successfully.');
      }
      setModalOpen(false);
      setEditingCourse(null);
      await loadData();
    } catch (err) {
      toast(err.message || 'Failed to save course.');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleStatus = async (courseItem) => {
    setIsProcessing(true);
    try {
      const updated = await courseService.setCourseStatus(courseItem._id, !courseItem.isActive);
      toast(`Course "${courseItem.name}" ${updated.isActive ? 'activated' : 'deactivated'}.`);
      await loadData();
    } catch (err) {
      toast(err.message || 'Failed to update course status.');
    } finally {
      setIsProcessing(false);
    }
  };

  const headerActions = (
    <div className="button-group">
      {has('COURSE_CREATE') && (
        <button
          className="primary"
          id="btn-create-course"
          type="button"
          onClick={() => {
            setEditingCourse(null);
            setModalOpen(true);
          }}
        >
          + Add Course
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="Course Management"
      subtitle="Manage academic courses, degree levels, durations, and department associations."
      actions={headerActions}
      currentPath="/courses"
    >
      <section>
        <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            id="course-search"
            style={{ flex: '1 1 240px' }}
            placeholder="Search by Course Name, Code, or Description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="filter-department"
            style={{ width: '220px' }}
            value={selectedDepartment}
            onChange={(e) => setSelectedDepartment(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
          <select
            id="filter-level"
            style={{ width: '180px' }}
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
          >
            <option value="">All Levels</option>
            {COURSE_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Course Code</th>
                  <th>Course Name</th>
                  <th>Department</th>
                  <th>Level</th>
                  <th>Duration</th>
                  <th style={{ textAlign: 'center' }}>Total Students</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="empty">
                      Loading courses…
                    </td>
                  </tr>
                ) : filteredCourses.length > 0 ? (
                  filteredCourses.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <span className="badge badge-info">{c.code}</span>
                      </td>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>
                        {c.departmentId?.name ? (
                          <span>
                            {c.departmentId.name}{' '}
                            {c.departmentId.isActive === false && (
                              <span style={{ color: 'var(--red, #e53e3e)', fontSize: '0.85rem' }}>(Inactive)</span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className="badge">{LEVEL_LABEL_MAP[c.level] || c.level}</span>
                      </td>
                      <td>{c.durationYears ? `${c.durationYears} Yr${c.durationYears > 1 ? 's' : ''}` : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="badge neutral"
                          style={{
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            padding: '3px 10px',
                            minWidth: '28px',
                            textAlign: 'center',
                            display: 'inline-block'
                          }}
                        >
                          {c.studentCount ?? 0}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            c.isActive ? 'status-active' : 'status-inactive'
                          }`}
                        >
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="actions">
                        {has('COURSE_UPDATE') && (
                          <>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => {
                                setEditingCourse(c);
                                setModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="link-button"
                              style={{ color: c.isActive ? 'var(--red, #e53e3e)' : 'var(--green, #38a169)' }}
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleToggleStatus(c)}
                            >
                              {c.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="empty">
                      No courses found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <CourseModal
        isOpen={modalOpen}
        course={editingCourse}
        isProcessing={isProcessing}
        onClose={() => {
          setModalOpen(false);
          setEditingCourse(null);
        }}
        onSubmit={handleCreateOrUpdate}
      />
    </PortalLayout>
  );
}
