import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import {
  filterStudents,
  getAvailableCourses,
  shouldResetCourseSelection
} from '../../frontend/src/utils/student-filter.js';

describe('Student Management - Department and Course Filtering', () => {
  // Mock Departments
  const departments = [
    { _id: 'dept_cs', name: 'Computer Science & Engineering', code: 'CSE' },
    { _id: 'dept_mech', name: 'Mechanical Engineering', code: 'MECH' },
    { _id: 'dept_ee', name: 'Electrical Engineering', code: 'EE' }
  ];

  // Mock Courses with departmentId references
  const courses = [
    { _id: 'course_ai', name: 'B.Tech AI & Data Science', code: 'AI-DS', departmentId: 'dept_cs' },
    { _id: 'course_web', name: 'B.Tech Software Engineering', code: 'SE', departmentId: { _id: 'dept_cs' } },
    { _id: 'course_robotics', name: 'B.Tech Robotics & Automation', code: 'ROBO', departmentId: 'dept_mech' },
    { _id: 'course_power', name: 'B.Tech Power Systems', code: 'POWER', departmentId: 'dept_ee' }
  ];

  // Mock Student records with relational departmentId and courseId, plus academic metrics
  const students = [
    {
      _id: 's1',
      universityId: 'STU-001',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice.smith@university.edu',
      departmentId: 'dept_cs',
      courseId: 'course_ai',
      department: 'Computer Science & Engineering',
      branch: 'B.Tech AI & Data Science',
      semester: 6,
      cgpa: 8.5,
      backlogs: 0
    },
    {
      _id: 's2',
      universityId: 'STU-002',
      firstName: 'Bob',
      lastName: 'Johnson',
      email: 'bob.j@university.edu',
      departmentId: { _id: 'dept_cs' },
      courseId: { _id: 'course_web' },
      department: 'Computer Science & Engineering',
      branch: 'B.Tech Software Engineering',
      semester: 6,
      cgpa: 6.8,
      backlogs: 1
    },
    {
      _id: 's3',
      universityId: 'STU-003',
      firstName: 'Charlie',
      lastName: 'Davis',
      email: 'charlie.d@university.edu',
      departmentId: 'dept_mech',
      courseId: 'course_robotics',
      department: 'Mechanical Engineering',
      branch: 'B.Tech Robotics & Automation',
      semester: 4,
      cgpa: 9.1,
      backlogs: 0
    },
    {
      _id: 's4',
      universityId: 'STU-004',
      firstName: 'Diana',
      lastName: 'Prince',
      email: 'diana.p@university.edu',
      departmentId: 'dept_ee',
      courseId: 'course_power',
      department: 'Electrical Engineering',
      branch: 'B.Tech Power Systems',
      semester: 8,
      cgpa: 7.2,
      backlogs: 3
    }
  ];

  // Test 1: Filtering by department
  it('1. Filtering by department: returns only students belonging to the selected department', () => {
    const csStudents = filterStudents({
      students,
      departmentId: 'dept_cs',
      departments,
      courses
    });

    assert.equal(csStudents.length, 2);
    assert.deepEqual(
      csStudents.map((s) => s.universityId).sort(),
      ['STU-001', 'STU-002']
    );

    const mechStudents = filterStudents({
      students,
      departmentId: 'dept_mech',
      departments,
      courses
    });

    assert.equal(mechStudents.length, 1);
    assert.equal(mechStudents[0].universityId, 'STU-003');
  });

  // Test 2: Filtering by course
  it('2. Filtering by course: returns only students enrolled in that specific course', () => {
    const aiStudents = filterStudents({
      students,
      courseId: 'course_ai',
      departments,
      courses
    });

    assert.equal(aiStudents.length, 1);
    assert.equal(aiStudents[0].universityId, 'STU-001');

    const roboticsStudents = filterStudents({
      students,
      courseId: 'course_robotics',
      departments,
      courses
    });

    assert.equal(roboticsStudents.length, 1);
    assert.equal(roboticsStudents[0].universityId, 'STU-003');
  });

  // Test 3: Selecting a department and then a course
  it('3. Selecting a department and then a course: narrows down to matching students in that department and course', () => {
    // Check available courses for CSE
    const cseCourses = getAvailableCourses(courses, 'dept_cs');
    assert.equal(cseCourses.length, 2);
    assert.ok(cseCourses.some((c) => c._id === 'course_ai'));
    assert.ok(cseCourses.some((c) => c._id === 'course_web'));
    assert.ok(!cseCourses.some((c) => c._id === 'course_robotics'));

    // Filter by department and course
    const results = filterStudents({
      students,
      departmentId: 'dept_cs',
      courseId: 'course_ai',
      departments,
      courses
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].universityId, 'STU-001');
    assert.equal(results[0].firstName, 'Alice');
  });

  // Test 4: Changing departments resets an incompatible course selection
  it('4. Changing departments resets an incompatible course selection: detects incompatibility and clears selection', () => {
    // Current course is course_ai (belongs to dept_cs)
    const currentCourseId = 'course_ai';

    // When changing department to dept_mech, course_ai is incompatible
    const resetNeededForMech = shouldResetCourseSelection(currentCourseId, 'dept_mech', courses);
    assert.equal(resetNeededForMech, true, 'Should flag incompatible course for reset when switching to Mechanical');

    // When keeping or switching to dept_cs, course_ai is compatible
    const resetNeededForSame = shouldResetCourseSelection(currentCourseId, 'dept_cs', courses);
    assert.equal(resetNeededForSame, false, 'Should keep compatible course when staying in same department');

    // When resetting to All Departments (''), course must be reset because no course can be selected without a department
    const resetNeededForAll = shouldResetCourseSelection(currentCourseId, '', courses);
    assert.equal(resetNeededForAll, true, 'Should force reset course when switching to All Departments');

    // Available courses when no department is selected should be empty
    const noDeptCourses = getAvailableCourses(courses, '');
    assert.equal(noDeptCourses.length, 0, 'No courses should be available when no department is selected');

    // Available courses for dept_mech should not include course_ai
    const mechCourses = getAvailableCourses(courses, 'dept_mech');
    assert.equal(mechCourses.length, 1);
    assert.equal(mechCourses[0]._id, 'course_robotics');
    assert.ok(!mechCourses.some((c) => c._id === currentCourseId));
  });

  // Test 5: Search works together with both filters
  it('5. Search works together with both filters: combines text search and relational filters seamlessly', () => {
    // Search for 'Alice' in dept_cs and course_ai -> matches
    const aliceMatch = filterStudents({
      students,
      search: 'Alice',
      departmentId: 'dept_cs',
      courseId: 'course_ai',
      departments,
      courses
    });
    assert.equal(aliceMatch.length, 1);
    assert.equal(aliceMatch[0].universityId, 'STU-001');

    // Search for 'Bob' in dept_cs and course_ai -> 0 results because Bob is in course_web
    const bobMismatch = filterStudents({
      students,
      search: 'Bob',
      departmentId: 'dept_cs',
      courseId: 'course_ai',
      departments,
      courses
    });
    assert.equal(bobMismatch.length, 0);

    // Search by email domain '@university.edu' in dept_cs -> matches both Alice and Bob
    const domainMatch = filterStudents({
      students,
      search: '@university.edu',
      departmentId: 'dept_cs',
      departments,
      courses
    });
    assert.equal(domainMatch.length, 2);
  });

  // Test 6: Clearing filters restores the complete student list
  it('6. Clearing filters restores the complete student list: shows all students when filters are cleared', () => {
    const allStudents = filterStudents({
      students,
      search: '',
      departmentId: '',
      courseId: '',
      departments,
      courses
    });

    assert.equal(allStudents.length, 4);
    assert.deepEqual(
      allStudents.map((s) => s.universityId).sort(),
      ['STU-001', 'STU-002', 'STU-003', 'STU-004']
    );

    // Available courses with no department filter should return empty array (select department first)
    const available = getAvailableCourses(courses, '');
    assert.equal(available.length, 0);
  });

  // Test 7: Semester filtering
  it('7. Filtering by semester: returns only students enrolled in the specified semester', () => {
    const sem6Students = filterStudents({
      students,
      semester: 6
    });
    assert.equal(sem6Students.length, 2);
    assert.deepEqual(
      sem6Students.map((s) => s.universityId).sort(),
      ['STU-001', 'STU-002']
    );

    const sem4Students = filterStudents({
      students,
      semester: 4
    });
    assert.equal(sem4Students.length, 1);
    assert.equal(sem4Students[0].universityId, 'STU-003');

    const sem1Students = filterStudents({
      students,
      semester: 1
    });
    assert.equal(sem1Students.length, 0);
  });

  // Test 8: Min CGPA filtering
  it('8. Filtering by minimum CGPA: returns only students meeting or exceeding the threshold', () => {
    const highCgpaStudents = filterStudents({
      students,
      minCgpa: 8.0
    });
    assert.equal(highCgpaStudents.length, 2);
    assert.deepEqual(
      highCgpaStudents.map((s) => s.universityId).sort(),
      ['STU-001', 'STU-003']
    );

    const topCgpaStudents = filterStudents({
      students,
      minCgpa: 9.0
    });
    assert.equal(topCgpaStudents.length, 1);
    assert.equal(topCgpaStudents[0].universityId, 'STU-003');
  });

  // Test 9: Active backlogs filtering
  it('9. Filtering by active backlogs: supports zero, max1, max2, and has backlog conditions', () => {
    // 0 Backlogs (eligible / clean)
    const zeroBacklog = filterStudents({
      students,
      backlogs: '0'
    });
    assert.equal(zeroBacklog.length, 2);
    assert.deepEqual(
      zeroBacklog.map((s) => s.universityId).sort(),
      ['STU-001', 'STU-003']
    );

    // Max 1 Backlog (0 or 1)
    const max1Backlog = filterStudents({
      students,
      backlogs: 'max1'
    });
    assert.equal(max1Backlog.length, 3);
    assert.deepEqual(
      max1Backlog.map((s) => s.universityId).sort(),
      ['STU-001', 'STU-002', 'STU-003']
    );

    // Has Backlogs (>0)
    const hasBacklog = filterStudents({
      students,
      backlogs: 'has'
    });
    assert.equal(hasBacklog.length, 2);
    assert.deepEqual(
      hasBacklog.map((s) => s.universityId).sort(),
      ['STU-002', 'STU-004']
    );
  });

  // Test 10: Combined academic & relational filtering
  it('10. Combined academic filtering: narrows down across department, semester, cgpa, and backlogs', () => {
    // CS + Sem 6 + Min CGPA 8.0 + 0 Backlogs -> only Alice (STU-001)
    const eligibleStudents = filterStudents({
      students,
      departmentId: 'dept_cs',
      semester: 6,
      minCgpa: 8.0,
      backlogs: '0'
    });
    assert.equal(eligibleStudents.length, 1);
    assert.equal(eligibleStudents[0].universityId, 'STU-001');

    // CS + Sem 6 + Min CGPA 6.0 + Max 1 Backlog -> Alice and Bob
    const broadCsStudents = filterStudents({
      students,
      departmentId: 'dept_cs',
      semester: 6,
      minCgpa: 6.0,
      backlogs: 'max1'
    });
    assert.equal(broadCsStudents.length, 2);
  });

  // Test 11: Filtering course by code or name
  it('11. Resilient Course filtering: supports filtering by course code or course name', () => {
    // By course code 'AI-DS'
    const byCode = filterStudents({
      students,
      courseId: 'AI-DS',
      departments,
      courses
    });
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].universityId, 'STU-001');

    // By course name 'B.Tech AI & Data Science'
    const byName = filterStudents({
      students,
      courseId: 'B.Tech AI & Data Science',
      departments,
      courses
    });
    assert.equal(byName.length, 1);
    assert.equal(byName[0].universityId, 'STU-001');
  });

  // Test 12: Filtering department by code or name
  it('12. Resilient Department filtering: supports filtering by department code or department name', () => {
    // By dept code 'CSE'
    const byDeptCode = filterStudents({
      students,
      departmentId: 'CSE',
      departments,
      courses
    });
    assert.equal(byDeptCode.length, 2);
    assert.deepEqual(byDeptCode.map(s => s.universityId).sort(), ['STU-001', 'STU-002']);

    // By dept name 'Mechanical Engineering'
    const byDeptName = filterStudents({
      students,
      departmentId: 'Mechanical Engineering',
      departments,
      courses
    });
    assert.equal(byDeptName.length, 1);
    assert.equal(byDeptName[0].universityId, 'STU-003');
  });

  // Test 13: Unlinked legacy student records with only branch/department strings
  it('13. Unlinked legacy records: matches students when only branch and department strings exist', () => {
    const legacyStudent = {
      _id: 'legacy_1',
      universityId: 'LEGACY-001',
      firstName: 'Legacy',
      lastName: 'Student',
      email: 'legacy@univ.edu',
      department: 'Computer Science & Engineering',
      branch: 'B.Tech AI & Data Science',
      semester: 6,
      cgpa: 7.5,
      backlogs: 0
    };

    const result = filterStudents({
      students: [legacyStudent],
      departmentId: 'dept_cs',
      courseId: 'course_ai',
      departments,
      courses
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].universityId, 'LEGACY-001');
  });
});

