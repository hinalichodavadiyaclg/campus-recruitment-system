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

  // Mock Student records with relational departmentId and courseId
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
      branch: 'B.Tech AI & Data Science'
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
      branch: 'B.Tech Software Engineering'
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
      branch: 'B.Tech Robotics & Automation'
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
      branch: 'B.Tech Power Systems'
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

    // When resetting to All Departments (''), it is compatible
    const resetNeededForAll = shouldResetCourseSelection(currentCourseId, '', courses);
    assert.equal(resetNeededForAll, false, 'Should not force reset when switching to All Departments');

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

    // Available courses with no department filter should return all courses
    const allCourses = getAvailableCourses(courses, '');
    assert.equal(allCourses.length, 4);
  });
});
