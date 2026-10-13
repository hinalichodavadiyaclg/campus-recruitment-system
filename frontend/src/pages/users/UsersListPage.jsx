import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { userService } from '../../services/user.service.js';
import { roleService } from '../../services/role.service.js';
import { studentService } from '../../services/student.service.js';
import { companyService } from '../../services/company.service.js';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { departmentService } from '../../services/department.service.js';
import { courseService } from '../../services/course.service.js';
import { filterStudents, getAvailableCourses, shouldResetCourseSelection } from '../../utils/student-filter.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { ConfirmModal } from '../../components/common/ConfirmModal.jsx';
import { DefaultPasswordsModal } from '../../components/users/DefaultPasswordsModal.jsx';
import { CreateUserModal } from '../../components/users/CreateUserModal.jsx';
import { EditUserModal } from '../../components/users/EditUserModal.jsx';
import { StudentModal } from '../../components/students/StudentModal.jsx';
import { CompanyModal } from '../../components/companies/CompanyModal.jsx';
import { CompanyRecruitersModal } from '../../components/companies/CompanyRecruitersModal.jsx';
import { CompanyViewModal } from '../../components/companies/CompanyViewModal.jsx';
import { PlacementOfficerModal } from '../../components/placement/PlacementOfficerModal.jsx';

export function UsersListPage() {
  const { user: currentUser, has } = useAuth();
  const { toast } = useToast();

  // Active Tab: 'all' | 'students' | 'company' | 'placement'
  const [activeTab, setActiveTab] = useState('all');

  // Data states
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Department & Course data and filters for Student Management
  const [departmentsList, setDepartmentsList] = useState([]);
  const [coursesList, setCoursesList] = useState([]);
  const [studentDepartmentFilter, setStudentDepartmentFilter] = useState('');
  const [studentCourseFilter, setStudentCourseFilter] = useState('');

  // Modals
  const [defaultPasswordsOpen, setDefaultPasswordsOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserDefaultType, setCreateUserDefaultType] = useState('STUDENT');
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [officerModalOpen, setOfficerModalOpen] = useState(false);

  const [editingStudent, setEditingStudent] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [viewingCompany, setViewingCompany] = useState(null);
  const [recruitersCompany, setRecruitersCompany] = useState(null);
  const [editingOfficer, setEditingOfficer] = useState(null);
  const [editingUser, setEditingUser] = useState(null);

  const [deletingRecord, setDeletingRecord] = useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(null);
  const [tempPasswordNotice, setTempPasswordNotice] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [
        usersData,
        rolesData,
        studentsData,
        companiesData,
        officersData,
        deptsData,
        coursesData
      ] = await Promise.all([
        userService.listUsers({ limit: 100 }),
        has('ROLE_READ') ? roleService.listRoles() : Promise.resolve([]),
        studentService.listStudents({ limit: 100 }).catch(() => ({ items: [] })),
        companyService.listCompanies({ limit: 100 }).catch(() => ({ items: [] })),
        placementOfficerService.listPlacementOfficers({ limit: 100 }).catch(() => ({ items: [] })),
        departmentService.listDepartments({ limit: 100, isActive: true }).catch(() => ({ items: [] })),
        courseService.listCourses({ limit: 100, isActive: true }).catch(() => ({ items: [] }))
      ]);

      setUsers(usersData.items || []);
      setRoles(rolesData || []);
      setStudents(studentsData.items || []);
      setCompanies(companiesData.items || []);
      setOfficers(officersData.items || []);
      setDepartmentsList(deptsData.items || deptsData || []);
      setCoursesList(coursesData.items || coursesData || []);
    } catch (err) {
      toast(err.message || 'Failed to load user management data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [has]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q ||
        [u.email, u.universityId, u.employeeId, u.companyName, u.profileName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      const matchesType = !typeFilter || u.userType === typeFilter;
      const matchesRole = !roleFilter || u.roleId === roleFilter;
      const matchesStatus = !statusFilter || u.accountStatus === statusFilter;
      return matchesSearch && matchesType && matchesRole && matchesStatus;
    });
  }, [users, search, typeFilter, roleFilter, statusFilter]);

  const availableCourses = useMemo(() => {
    return getAvailableCourses(coursesList, studentDepartmentFilter);
  }, [coursesList, studentDepartmentFilter]);

  const handleDepartmentFilterChange = (newDeptId) => {
    setStudentDepartmentFilter(newDeptId);
    if (!newDeptId || shouldResetCourseSelection(studentCourseFilter, newDeptId, coursesList)) {
      setStudentCourseFilter('');
    }
  };

  useEffect(() => {
    if (!studentDepartmentFilter && studentCourseFilter) {
      setStudentCourseFilter('');
    } else if (shouldResetCourseSelection(studentCourseFilter, studentDepartmentFilter, coursesList)) {
      setStudentCourseFilter('');
    }
  }, [studentDepartmentFilter, studentCourseFilter, coursesList]);

  const filteredStudents = useMemo(() => {
    return filterStudents({
      students,
      search,
      departmentId: studentDepartmentFilter,
      courseId: studentCourseFilter,
      departments: departmentsList,
      courses: coursesList
    });
  }, [students, search, studentDepartmentFilter, studentCourseFilter, departmentsList, coursesList]);

  const filteredCompanies = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.companyName?.toLowerCase().includes(q) ||
        c.industryType?.toLowerCase().includes(q) ||
        c.hrRecruiterName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  const filteredOfficers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return officers;
    return officers.filter(
      (po) =>
        po.employeeId?.toLowerCase().includes(q) ||
        po.firstName?.toLowerCase().includes(q) ||
        po.lastName?.toLowerCase().includes(q) ||
        po.email?.toLowerCase().includes(q) ||
        po.mobileNumber?.toLowerCase().includes(q) ||
        po.role?.toLowerCase().includes(q)
    );
  }, [officers, search]);

  const getDisplayName = (u) => {
    if (u?.companyName) return u.companyName;
    if (u?.profileName) return u.profileName;
    return u?.email?.split('@')[0].replace(/[._-]/g, ' ') || 'Portal User';
  };

  const formatDate = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(value))
      : '—';

  const formatRoleLabel = (role) => {
    if (role === 'ROLE_PLACEMENT_HEAD') return 'Placement Head';
    if (role === 'ROLE_PLACEMENT_COORDINATOR') return 'Placement Coordinator';
    return role;
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;
    const { type, record } = deletingRecord;
    try {
      if (type === 'student') {
        await studentService.deleteStudent(record._id);
        toast('Student profile and linked user account deleted.');
      } else if (type === 'company') {
        await companyService.deleteCompany(record._id);
        toast('Company profile and linked user account deleted.');
      } else if (type === 'placement') {
        await placementOfficerService.deletePlacementOfficer(record._id);
        toast('Placement Officer profile and linked user account deleted.');
      } else if (type === 'user') {
        if (currentUser?._id === record._id) {
          toast('You cannot delete your own currently logged-in account.');
          setDeletingRecord(null);
          return;
        }
        await userService.deleteUser(record._id);
        toast('User account deleted.');
      }
      setDeletingRecord(null);
      loadData();
    } catch (err) {
      toast(err.message || 'Deletion failed.');
    }
  };

  const handleDeleteAll = async () => {
    if (!deleteAllConfirm) return;
    const { type } = deleteAllConfirm;
    setLoading(true);
    try {
      if (type === 'students') {
        let count = 0;
        for (const s of filteredStudents) {
          try {
            await studentService.deleteStudent(s._id);
            count++;
          } catch (e) {
            console.error('Failed to delete student:', s._id, e);
          }
        }
        toast(`Successfully deleted ${count} student profile(s) and linked user accounts.`);
      } else if (type === 'company') {
        let count = 0;
        for (const c of filteredCompanies) {
          try {
            await companyService.deleteCompany(c._id);
            count++;
          } catch (e) {
            console.error('Failed to delete company:', c._id, e);
          }
        }
        toast(`Successfully deleted ${count} company profile(s) and linked user accounts.`);
      } else if (type === 'placement') {
        let count = 0;
        for (const po of filteredOfficers) {
          if (currentUser?._id === po._id || currentUser?.email === po.email) {
            continue;
          }
          try {
            await placementOfficerService.deletePlacementOfficer(po._id);
            count++;
          } catch (e) {
            console.error('Failed to delete officer:', po._id, e);
          }
        }
        toast(`Successfully deleted ${count} placement officer profile(s).`);
      } else if (type === 'all') {
        let count = 0;
        for (const u of filteredUsers) {
          if (currentUser?._id === u._id || currentUser?.email === u.email) {
            continue;
          }
          try {
            await userService.deleteUser(u._id);
            count++;
          } catch (e) {
            console.error('Failed to delete user:', u._id, e);
          }
        }
        toast(`Successfully deleted ${count} user account(s).`);
      }
    } catch (err) {
      toast(err.message || 'Bulk deletion failed.');
    } finally {
      setDeleteAllConfirm(null);
      await loadData();
    }
  };

  const handleEditUser = async (u) => {
    if (u.userType === 'STUDENT') {
      let s =
        u.profile ||
        students.find(
          (item) =>
            item.userId === u._id ||
            (u.universityId && item.universityId === u.universityId) ||
            (u.email && item.email?.toLowerCase() === u.email.toLowerCase())
        );
      if (!s) {
        try {
          const res = await studentService.listStudents({
            search: u.universityId || u.email,
            limit: 5
          });
          s = res.items?.find(
            (item) =>
              item.userId === u._id ||
              item.universityId === u.universityId ||
              item.email?.toLowerCase() === u.email?.toLowerCase()
          );
        } catch (_) {}
      }
      if (s) {
        setEditingStudent(s);
        setStudentModalOpen(true);
        return;
      }
    } else if (u.userType === 'COMPANY') {
      let c =
        u.profile ||
        companies.find(
          (item) =>
            item.userId === u._id ||
            item.primaryRecruiterId === u._id ||
            (u.companyId && String(item._id) === String(u.companyId)) ||
            (u.email && item.email?.toLowerCase() === u.email.toLowerCase())
        );
      if (!c && u.companyId) {
        try {
          c = await companyService.getCompany(u.companyId);
        } catch (_) {}
      }
      if (c) {
        setEditingCompany(c);
        setCompanyModalOpen(true);
        return;
      }
    } else if (u.userType === 'PLACEMENT') {
      const po =
        u.profile ||
        officers.find(
          (item) =>
            item.userId === u._id ||
            (u.employeeId && item.employeeId === u.employeeId) ||
            (u.email && item.email?.toLowerCase() === u.email.toLowerCase())
        );
      if (po) {
        setEditingOfficer(po);
        setOfficerModalOpen(true);
        return;
      }
    }

    setEditingUser(u);
  };

  const headerActions = (
    <div className="button-group" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button
        className="secondary"
        id="btn-default-passwords"
        type="button"
        onClick={() => setDefaultPasswordsOpen(true)}
      >
        🔑 Default Passwords
      </button>

      {has('USER_DELETE') && activeTab === 'students' && filteredStudents.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm({ type: 'students' })}
        >
          🗑️ Delete All Students ({filteredStudents.length})
        </button>
      )}

      {has('USER_DELETE') && activeTab === 'company' && filteredCompanies.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm({ type: 'company' })}
        >
          🗑️ Delete All Companies ({filteredCompanies.length})
        </button>
      )}

      {has('USER_DELETE') && activeTab === 'placement' && filteredOfficers.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm({ type: 'placement' })}
        >
          🗑️ Delete All Officers ({filteredOfficers.length})
        </button>
      )}

      {has('USER_DELETE') && activeTab === 'all' && filteredUsers.length > 0 && (
        <button
          className="danger"
          type="button"
          style={{ backgroundColor: 'var(--red, #e53e3e)', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 14px', cursor: 'pointer' }}
          onClick={() => setDeleteAllConfirm({ type: 'all' })}
        >
          🗑️ Delete All Accounts ({filteredUsers.length})
        </button>
      )}

      {has('USER_CREATE') && activeTab === 'students' && (
        <button
          className="primary"
          type="button"
          onClick={() => {
            setCreateUserDefaultType('STUDENT');
            setCreateUserOpen(true);
          }}
        >
          + Create Student
        </button>
      )}

      {has('USER_CREATE') && activeTab === 'company' && (
        <button
          className="primary"
          type="button"
          onClick={() => {
            setCreateUserDefaultType('COMPANY');
            setCreateUserOpen(true);
          }}
        >
          + Create Company
        </button>
      )}

      {has('USER_CREATE') && activeTab === 'placement' && (
        <button
          className="primary"
          type="button"
          onClick={() => {
            setCreateUserDefaultType('PLACEMENT');
            setCreateUserOpen(true);
          }}
        >
          + Create Placement Officer
        </button>
      )}

      {has('USER_CREATE') && activeTab === 'all' && (
        <button
          className="primary"
          id="btn-create-user"
          type="button"
          onClick={() => {
            setCreateUserDefaultType('STUDENT');
            setCreateUserOpen(true);
          }}
        >
          + Create Account
        </button>
      )}
    </div>
  );

  return (
    <PortalLayout
      title="User Management"
      subtitle="Manage domain profiles for Students, Companies, and Placement Officers."
      actions={headerActions}
      currentPath="/users"
    >
      <section>
        {/* Sub-Tabs: All Accounts first, followed by domain profiles */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
          <button
            type="button"
            className={activeTab === 'all' ? 'primary' : 'ghost'}
            style={{ fontSize: '0.88rem', padding: '8px 16px' }}
            onClick={() => {
              setActiveTab('all');
              setSearch('');
            }}
          >
            👥 All Accounts
          </button>
          <button
            type="button"
            className={activeTab === 'students' ? 'primary' : 'ghost'}
            style={{ fontSize: '0.88rem', padding: '8px 16px' }}
            onClick={() => {
              setActiveTab('students');
              setSearch('');
              setStudentDepartmentFilter('');
              setStudentCourseFilter('');
            }}
          >
            🎓 Students
          </button>
          <button
            type="button"
            className={activeTab === 'company' ? 'primary' : 'ghost'}
            style={{ fontSize: '0.88rem', padding: '8px 16px' }}
            onClick={() => {
              setActiveTab('company');
              setSearch('');
            }}
          >
            🏢 Company
          </button>
          <button
            type="button"
            className={activeTab === 'placement' ? 'primary' : 'ghost'}
            style={{ fontSize: '0.88rem', padding: '8px 16px' }}
            onClick={() => {
              setActiveTab('placement');
              setSearch('');
            }}
          >
            👔 Placement Cell
          </button>
        </div>

        {/* TAB 1: STUDENTS */}
        {activeTab === 'students' && (
          <>
            <div className="filters" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
              <input
                id="student-search"
                placeholder="Search by University ID, Name, Email, or Branch"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                id="student-filter-department"
                value={studentDepartmentFilter}
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
                id="student-filter-course"
                value={studentCourseFilter}
                onChange={(e) => setStudentCourseFilter(e.target.value)}
                disabled={!studentDepartmentFilter}
                title={!studentDepartmentFilter ? 'Select a department first' : 'Filter by course'}
                style={!studentDepartmentFilter ? { opacity: 0.65, cursor: 'not-allowed', backgroundColor: '#f1f5f9' } : {}}
              >
                <option value="">All Courses</option>
                {availableCourses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.code ? `(${c.code})` : ''}
                  </option>
                ))}
              </select>
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
                        <td colSpan="8" className="empty">Loading student records…</td>
                      </tr>
                    ) : filteredStudents.length > 0 ? (
                      filteredStudents.map((s) => (
                        <tr key={s._id}>
                          <td><strong>{s.universityId}</strong></td>
                          <td>{s.firstName} {s.lastName}</td>
                          <td>{s.email}</td>
                          <td>{s.branch} ({s.department})</td>
                          <td>{s.semester}</td>
                          <td>{s.cgpa?.toFixed(2)}</td>
                          <td>{s.backlogs ?? 0}</td>
                          <td className="actions">
                            {has('USER_UPDATE') && (
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
                            {has('USER_DELETE') && (
                              <button
                                className="link-button"
                                style={{ color: 'var(--red)' }}
                                type="button"
                                onClick={() => setDeletingRecord({ type: 'student', record: s })}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="empty">No student records found matching your filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}

        {/* TAB 2: COMPANY */}
        {activeTab === 'company' && (
          <>
            <div className="filters">
              <input
                placeholder="Search by Company Name, Industry, HR Name, or Email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <article className="card table-card">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Company ID</th>
                      <th>Company Name</th>
                      <th>Industry</th>
                      <th>HR Recruiter</th>
                      <th>Email</th>
                      <th>Mobile</th>
                      <th>Est. Year</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="8" className="empty">Loading company records…</td>
                      </tr>
                    ) : filteredCompanies.length > 0 ? (
                      filteredCompanies.map((c) => (
                        <tr key={c._id}>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--navy, #173b76)' }}>
                              {c.companyId || '—'}
                            </span>
                          </td>
                          <td><strong>{c.companyName}</strong></td>
                          <td>{c.industryType}</td>
                          <td>
                            {c.hrRecruiterName}
                            {c.designation ? ` (${c.designation})` : ''}
                          </td>
                          <td>{c.email}</td>
                          <td>{c.mobileNumber || '—'}</td>
                          <td>{c.yearEstablished || '—'}</td>
                          <td className="actions">
                            {has('USER_READ') && (
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => setViewingCompany(c)}
                              >
                                View
                              </button>
                            )}
                            {has('USER_READ') && (
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => setRecruitersCompany(c)}
                              >
                                Manage Recruiters
                              </button>
                            )}
                            {has('USER_UPDATE') && (
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => {
                                  setEditingCompany(c);
                                  setCompanyModalOpen(true);
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {has('USER_DELETE') && (
                              <button
                                className="link-button"
                                style={{ color: 'var(--red)' }}
                                type="button"
                                onClick={() => setDeletingRecord({ type: 'company', record: c })}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="empty">No company records found matching your search.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}

        {/* TAB 3: PLACEMENT CELL */}
        {activeTab === 'placement' && (
          <>
            <div className="filters">
              <input
                placeholder="Search by Employee ID, Name, Email, or Role"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <article className="card table-card">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Mobile</th>
                      <th>Assigned Role</th>
                      <th>Department</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="7" className="empty">Loading placement officer records…</td>
                      </tr>
                    ) : filteredOfficers.length > 0 ? (
                      filteredOfficers.map((po) => (
                        <tr key={po._id}>
                          <td><strong>{po.employeeId}</strong></td>
                          <td>{po.firstName} {po.lastName}</td>
                          <td>{po.email}</td>
                          <td>{po.mobileNumber || '—'}</td>
                          <td>{formatRoleLabel(po.role)}</td>
                          <td>{po.department || po.departmentId?.name || '—'}</td>
                          <td className="actions">
                            {has('USER_UPDATE') && (
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => {
                                  setEditingOfficer(po);
                                  setOfficerModalOpen(true);
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {has('USER_DELETE') && (
                              <button
                                className="link-button"
                                style={{ color: 'var(--red)' }}
                                type="button"
                                onClick={() => setDeletingRecord({ type: 'placement', record: po })}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="empty">No placement officer records found matching your search.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}

        {/* TAB 4: ALL ACCOUNTS */}
        {activeTab === 'all' && (
          <>
            <div className="filters">
              <input
                id="user-search"
                placeholder="Search email, name or user ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                id="user-type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">All user types</option>
                <option value="STUDENT">STUDENT</option>
                <option value="COMPANY">COMPANY</option>
                <option value="PLACEMENT">PLACEMENT</option>
              </select>
              <select
                id="user-role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All roles</option>
                {roles.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                id="user-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="LOCKED">LOCKED</option>
              </select>
            </div>

            <article className="card table-card">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Name / Company</th>
                      <th>Email</th>
                      <th>Type</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last login</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="8" className="empty">Loading users…</td>
                      </tr>
                    ) : filteredUsers.length > 0 ? (
                      filteredUsers.map((u) => {
                        const roleObj = roles.find((r) => r._id === u.roleId);
                        return (
                          <tr key={u._id}>
                            <td>
                              {u.universityId ||
                                u.employeeId ||
                                u.companyBusinessId ||
                                '—'}
                            </td>
                            <td>{getDisplayName(u)}</td>
                            <td>{u.email}</td>
                            <td>{u.userType}</td>
                            <td>{roleObj?.name || u.roleId}</td>
                            <td>
                              <Badge status={u.accountStatus} />
                            </td>
                            <td>{formatDate(u.lastLoginAt)}</td>
                            <td className="actions">
                              <a className="link-button" href={`#/users/${u._id}`}>
                                View
                              </a>
                              {has('USER_UPDATE') && (
                                <button
                                  className="link-button"
                                  type="button"
                                  onClick={() => handleEditUser(u)}
                                >
                                  Edit
                                </button>
                              )}
                              {has('USER_DELETE') && (
                                <button
                                  className="link-button"
                                  style={{ color: 'var(--red)' }}
                                  type="button"
                                  onClick={() => setDeletingRecord({ type: 'user', record: u })}
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan="8" className="empty">No users match these filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        )}
      </section>

      {/* Modals */}
      <DefaultPasswordsModal
        isOpen={defaultPasswordsOpen}
        onClose={() => setDefaultPasswordsOpen(false)}
      />

      <StudentModal
        isOpen={studentModalOpen}
        student={editingStudent}
        onClose={() => {
          setStudentModalOpen(false);
          setEditingStudent(null);
        }}
        onSuccess={(result) => {
          if (result.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast(editingStudent ? 'Student updated.' : 'Student created successfully.');
          }
          loadData();
        }}
      />

      <CompanyModal
        isOpen={companyModalOpen}
        company={editingCompany}
        onClose={() => {
          setCompanyModalOpen(false);
          setEditingCompany(null);
        }}
        onSuccess={(result) => {
          if (result.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast(editingCompany ? 'Company updated.' : 'Company created successfully.');
          }
          loadData();
        }}
      />

      <CompanyRecruitersModal
        isOpen={Boolean(recruitersCompany)}
        company={recruitersCompany}
        onClose={() => setRecruitersCompany(null)}
        onUpdated={loadData}
      />

      <CompanyViewModal
        isOpen={Boolean(viewingCompany)}
        company={viewingCompany}
        onClose={() => setViewingCompany(null)}
        onEdit={(comp) => {
          setEditingCompany(comp);
          setCompanyModalOpen(true);
        }}
        onManageRecruiters={(comp) => {
          setRecruitersCompany(comp);
        }}
      />

      <PlacementOfficerModal
        isOpen={officerModalOpen}
        officer={editingOfficer}
        onClose={() => {
          setOfficerModalOpen(false);
          setEditingOfficer(null);
        }}
        onSuccess={(result) => {
          if (result.temporaryPassword) {
            setTempPasswordNotice(result.temporaryPassword);
          } else {
            toast(editingOfficer ? 'Placement officer updated.' : 'Placement officer created successfully.');
          }
          loadData();
        }}
      />

      <CreateUserModal
        isOpen={createUserOpen}
        defaultType={createUserDefaultType}
        onClose={() => setCreateUserOpen(false)}
        onSuccess={(created, createdType) => {
          if (createdType === 'STUDENT') setActiveTab('students');
          else if (createdType === 'COMPANY') setActiveTab('company');
          else if (createdType === 'PLACEMENT') setActiveTab('placement');

          if (created.temporaryPassword) {
            setTempPasswordNotice(created.temporaryPassword);
          } else {
            toast('Account created successfully.');
          }
          loadData();
        }}
      />

      <EditUserModal
        isOpen={Boolean(editingUser)}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={() => {
          toast('User updated successfully.');
          loadData();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(deletingRecord)}
        onClose={() => setDeletingRecord(null)}
        title="Confirm Delete"
        message="Are you sure you want to delete this record and linked data? This action cannot be undone."
        confirmLabel="Delete"
        danger={true}
        onConfirm={handleDeleteRecord}
      />

      <ConfirmModal
        isOpen={Boolean(deleteAllConfirm)}
        onClose={() => setDeleteAllConfirm(null)}
        title={`Delete All ${
          deleteAllConfirm?.type === 'students'
            ? 'Students'
            : deleteAllConfirm?.type === 'company'
            ? 'Companies'
            : deleteAllConfirm?.type === 'placement'
            ? 'Placement Officers'
            : 'User Accounts'
        }`}
        message={`Are you sure you want to delete ALL matching ${
          deleteAllConfirm?.type === 'students'
            ? 'student profiles and linked accounts'
            : deleteAllConfirm?.type === 'company'
            ? 'company profiles and recruiter accounts'
            : deleteAllConfirm?.type === 'placement'
            ? 'placement officer profiles (excluding your current account)'
            : 'user accounts (excluding your active logged-in account)'
        }? This action cannot be undone.`}
        confirmLabel="Delete All"
        danger={true}
        onConfirm={handleDeleteAll}
      />

      <ConfirmModal
        isOpen={Boolean(tempPasswordNotice)}
        onClose={() => setTempPasswordNotice(null)}
        title="Account Created Successfully"
        message={`Temporary password generated: ${tempPasswordNotice}`}
        confirmLabel="OK"
        onConfirm={() => setTempPasswordNotice(null)}
      />
    </PortalLayout>
  );
}
