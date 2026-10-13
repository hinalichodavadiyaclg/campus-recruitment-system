import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';

/**
 * Pure placement filtering logic mimicking FilteredPlacementRecordsPage
 */
function filterPlacementOfficers({
  officers = [],
  search = '',
  roleFilter = '',
  departmentFilter = '',
  designationFilter = '',
  departments = []
}) {
  const q = search.toLowerCase().trim();
  return officers.filter((p) => {
    // 1. Role Filter matching
    if (roleFilter === 'ROLE_PLACEMENT_HEAD') {
      const isHead =
        p.role === 'ROLE_PLACEMENT_HEAD' ||
        p.role === 'PLACEMENT_HEAD' ||
        p.designation?.toLowerCase().includes('head');
      if (!isHead) return false;
    } else if (roleFilter === 'ROLE_PLACEMENT_COORDINATOR') {
      const isCoordinator =
        p.role === 'ROLE_PLACEMENT_COORDINATOR' ||
        p.role === 'PLACEMENT_COORDINATOR' ||
        p.designation?.toLowerCase().includes('coordinator');
      if (!isCoordinator) return false;

      // Dynamic Department scoping (only when Placement Coordinator is selected)
      if (departmentFilter) {
        const pDeptId = p.departmentId?._id
          ? String(p.departmentId._id)
          : p.departmentId
          ? String(p.departmentId)
          : '';
        if (pDeptId) {
          if (pDeptId !== String(departmentFilter)) return false;
        } else if (p.department) {
          const matchedDept = departments.find(
            (d) =>
              d.name?.toLowerCase() === p.department.toLowerCase() ||
              d.code?.toLowerCase() === p.department.toLowerCase()
          );
          if (!matchedDept || String(matchedDept._id) !== String(departmentFilter)) return false;
        } else {
          return false;
        }
      }
    }

    // 2. Specific designation matching (if selected)
    if (designationFilter && p.designation?.toLowerCase() !== designationFilter.toLowerCase()) {
      return false;
    }

    // 3. Text search
    if (q) {
      const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ').toLowerCase();
      const matchName = fullName.includes(q);
      const matchId = p.employeeId?.toLowerCase().includes(q);
      const matchEmail = p.email?.toLowerCase().includes(q);
      const matchDesig = p.designation?.toLowerCase().includes(q);
      const matchDept = (p.departmentId?.name || p.department || '').toLowerCase().includes(q);
      const matchRole = (p.role || '').toLowerCase().includes(q);
      return matchName || matchId || matchEmail || matchDesig || matchDept || matchRole;
    }
    return true;
  });
}

describe('Placement Cell - Role, Placement Head, and Dynamic Department Filtering', () => {
  const departments = [
    { _id: 'dept_cs', name: 'Computer Science & Engineering', code: 'CSE' },
    { _id: 'dept_ece', name: 'Electronics & Communication', code: 'ECE' },
    { _id: 'dept_mech', name: 'Mechanical Engineering', code: 'MECH' }
  ];

  const officers = [
    {
      _id: 'po1',
      employeeId: 'EMP-HEAD-01',
      firstName: 'Vikram',
      lastName: 'Mehta',
      email: 'vikram.mehta@vvwu.ac.in',
      designation: 'Head of Placement & Training',
      role: 'ROLE_PLACEMENT_HEAD',
      department: 'Central Placement Cell',
      departmentId: null
    },
    {
      _id: 'po2',
      employeeId: 'EMP-HEAD-02',
      firstName: 'Pooja',
      lastName: 'Shah',
      email: 'pooja.shah@vvwu.ac.in',
      designation: 'Placement Head',
      role: 'ROLE_PLACEMENT_HEAD',
      department: 'Central Placement Cell',
      departmentId: null
    },
    {
      _id: 'po3',
      employeeId: 'EMP-COORD-01',
      firstName: 'Rahul',
      lastName: 'Patel',
      email: 'rahul.patel@vvwu.ac.in',
      designation: 'Department Placement Coordinator',
      role: 'ROLE_PLACEMENT_COORDINATOR',
      departmentId: 'dept_cs',
      department: 'Computer Science & Engineering'
    },
    {
      _id: 'po4',
      employeeId: 'EMP-COORD-02',
      firstName: 'Anjali',
      lastName: 'Desai',
      email: 'anjali.desai@vvwu.ac.in',
      designation: 'Placement Coordinator',
      role: 'ROLE_PLACEMENT_COORDINATOR',
      departmentId: { _id: 'dept_ece', name: 'Electronics & Communication' },
      department: 'Electronics & Communication'
    },
    {
      _id: 'po5',
      employeeId: 'EMP-COORD-03',
      firstName: 'Karan',
      lastName: 'Joshi',
      email: 'karan.joshi@vvwu.ac.in',
      designation: 'Faculty Placement Coordinator',
      role: 'ROLE_PLACEMENT_COORDINATOR',
      departmentId: 'dept_mech',
      department: 'Mechanical Engineering'
    }
  ];

  it('1. Filter by Placement Head returns all placement heads and excludes coordinators', () => {
    const heads = filterPlacementOfficers({
      officers,
      roleFilter: 'ROLE_PLACEMENT_HEAD',
      departments
    });
    assert.equal(heads.length, 2);
    assert.deepEqual(
      heads.map((h) => h.employeeId).sort(),
      ['EMP-HEAD-01', 'EMP-HEAD-02']
    );
  });

  it('2. Filter by Placement Coordinator returns all coordinators and excludes heads', () => {
    const coords = filterPlacementOfficers({
      officers,
      roleFilter: 'ROLE_PLACEMENT_COORDINATOR',
      departments
    });
    assert.equal(coords.length, 3);
    assert.deepEqual(
      coords.map((c) => c.employeeId).sort(),
      ['EMP-COORD-01', 'EMP-COORD-02', 'EMP-COORD-03']
    );
  });

  it('3. Dynamic department scoping under Coordinator filters to specific department', () => {
    const csCoords = filterPlacementOfficers({
      officers,
      roleFilter: 'ROLE_PLACEMENT_COORDINATOR',
      departmentFilter: 'dept_cs',
      departments
    });
    assert.equal(csCoords.length, 1);
    assert.equal(csCoords[0].employeeId, 'EMP-COORD-01');

    const eceCoords = filterPlacementOfficers({
      officers,
      roleFilter: 'ROLE_PLACEMENT_COORDINATOR',
      departmentFilter: 'dept_ece',
      departments
    });
    assert.equal(eceCoords.length, 1);
    assert.equal(eceCoords[0].employeeId, 'EMP-COORD-02');
  });

  it('4. Search works seamlessly in combination with role and dynamic department', () => {
    // Search for "Rahul" in Placement Coordinator + dept_cs
    const matched = filterPlacementOfficers({
      officers,
      search: 'Rahul',
      roleFilter: 'ROLE_PLACEMENT_COORDINATOR',
      departmentFilter: 'dept_cs',
      departments
    });
    assert.equal(matched.length, 1);
    assert.equal(matched[0].employeeId, 'EMP-COORD-01');

    // Search for "Rahul" in dept_ece returns empty
    const noMatch = filterPlacementOfficers({
      officers,
      search: 'Rahul',
      roleFilter: 'ROLE_PLACEMENT_COORDINATOR',
      departmentFilter: 'dept_ece',
      departments
    });
    assert.equal(noMatch.length, 0);
  });

  it('5. Clearing filters restores all 5 placement cell records', () => {
    const all = filterPlacementOfficers({
      officers,
      search: '',
      roleFilter: '',
      departmentFilter: '',
      departments
    });
    assert.equal(all.length, 5);
  });
});
