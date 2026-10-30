/**
 * Student Department & Course Filtering Utilities
 * Provides pure functions for filtering student management records,
 * calculating available courses for a department, and detecting incompatible selections.
 */

/**
 * Returns courses that belong to the selected department.
 * If no department is selected (empty string/null), returns an empty array.
 *
 * @param {Array} courses - Full list of course objects.
 * @param {string} selectedDepartmentId - The ID of the currently selected department.
 * @returns {Array} Courses belonging to the selected department.
 */
export function getAvailableCourses(courses = [], selectedDepartmentId = '') {
  if (!selectedDepartmentId) return [];
  const targetDeptStr = String(selectedDepartmentId).toLowerCase().trim();
  return courses.filter((c) => {
    const dId = c?.departmentId?._id ? String(c.departmentId._id) : (c?.departmentId ? String(c.departmentId) : '');
    const dCode = (c?.departmentId?.code || '').toLowerCase().trim();
    const dName = (c?.departmentId?.name || '').toLowerCase().trim();
    return (
      dId === String(selectedDepartmentId) ||
      (dCode && dCode === targetDeptStr) ||
      (dName && dName === targetDeptStr)
    );
  });
}

/**
 * Checks whether the currently selected course should be reset when the department changes.
 * Returns true if no department is selected or if the course does NOT belong to the new department.
 *
 * @param {string} currentCourseId - The ID of the currently selected course.
 * @param {string} newDepartmentId - The new department ID being switched to.
 * @param {Array} courses - Full list of course objects.
 * @returns {boolean} True if the course is incompatible and should be reset.
 */
export function shouldResetCourseSelection(currentCourseId, newDepartmentId, courses = []) {
  if (!currentCourseId) return false;
  // If department is cleared or empty, course cannot remain selected
  if (!newDepartmentId) return true;
  if (!Array.isArray(courses) || courses.length === 0) return false;
  const course = courses.find((c) =>
    String(c?._id) === String(currentCourseId) ||
    String(c?.code || '').toLowerCase() === String(currentCourseId).toLowerCase() ||
    String(c?.name || '').toLowerCase() === String(currentCourseId).toLowerCase()
  );
  if (!course) return false;
  const cDeptId = course?.departmentId?._id ? String(course.departmentId._id) : (course?.departmentId ? String(course.departmentId) : '');
  const cDeptCode = (course?.departmentId?.code || '').toLowerCase().trim();
  const cDeptName = (course?.departmentId?.name || '').toLowerCase().trim();
  const newDeptStr = String(newDepartmentId).toLowerCase().trim();

  // If already matching by ID, code, or name, do not reset
  if (cDeptId && cDeptId === String(newDepartmentId)) return false;
  if (cDeptCode && cDeptCode === newDeptStr) return false;
  if (cDeptName && cDeptName === newDeptStr) return false;

  return Boolean(cDeptId && cDeptId !== String(newDepartmentId));
}

/**
 * Filters the students array by search term, department ID, and course ID.
 *
 * @param {Object} options
 * @param {Array} options.students - List of student records.
 * @param {string} [options.search=''] - Search term.
 * @param {string} [options.departmentId=''] - Selected department ID.
 * @param {string} [options.courseId=''] - Selected course ID.
 * @param {Array} [options.departments=[]] - Optional departments list for legacy text resolution.
 * @param {Array} [options.courses=[]] - Optional courses list for legacy text resolution.
 * @returns {Array} Filtered students.
 */
export function filterStudents({
  students = [],
  search = '',
  departmentId = '',
  courseId = '',
  departments = [],
  courses = [],
  semester = '',
  minCgpa = '',
  backlogs = ''
}) {
  const q = search.toLowerCase().trim();

  // Resolve target department metadata if departmentId is provided
  const targetDept = departmentId
    ? departments.find(
        (d) =>
          String(d?._id) === String(departmentId) ||
          String(d?.code || '').toLowerCase().trim() === String(departmentId).toLowerCase().trim() ||
          String(d?.name || '').toLowerCase().trim() === String(departmentId).toLowerCase().trim()
      )
    : null;

  // Resolve target course metadata if courseId is provided
  const targetCourse = courseId
    ? courses.find(
        (c) =>
          String(c?._id) === String(courseId) ||
          String(c?.code || '').toLowerCase().trim() === String(courseId).toLowerCase().trim() ||
          String(c?.name || '').toLowerCase().trim() === String(courseId).toLowerCase().trim()
      )
    : null;

  return students.filter((s) => {
    // 1. Text Search matching
    const matchesSearch =
      !q ||
      Boolean(
        s?.universityId?.toLowerCase().includes(q) ||
        s?.firstName?.toLowerCase().includes(q) ||
        s?.lastName?.toLowerCase().includes(q) ||
        s?.email?.toLowerCase().includes(q) ||
        s?.branch?.toLowerCase().includes(q) ||
        s?.department?.toLowerCase().includes(q)
      );

    // 2. Department matching by ID, code, or name
    let matchesDept = true;
    if (departmentId) {
      const sDeptId = s?.departmentId?._id
        ? String(s.departmentId._id)
        : (s?.departmentId ? String(s.departmentId) : '');
      const sDeptName = (s?.department || s?.departmentId?.name || '').toLowerCase().trim();
      const sDeptCode = (s?.departmentId?.code || '').toLowerCase().trim();

      const filterDeptStr = String(departmentId).toLowerCase().trim();
      const targetDeptId = targetDept ? String(targetDept._id) : null;
      const targetDeptCode = targetDept?.code ? String(targetDept.code).toLowerCase().trim() : null;
      const targetDeptName = targetDept?.name ? String(targetDept.name).toLowerCase().trim() : null;

      const idMatches =
        (sDeptId && (sDeptId === String(departmentId) || (targetDeptId && sDeptId === targetDeptId)));

      const textMatches =
        (sDeptName && (
          sDeptName === filterDeptStr ||
          (targetDeptName && sDeptName === targetDeptName) ||
          (targetDeptCode && sDeptName === targetDeptCode)
        )) ||
        (sDeptCode && (
          sDeptCode === filterDeptStr ||
          (targetDeptCode && sDeptCode === targetDeptCode) ||
          (targetDeptName && sDeptCode === targetDeptName)
        ));

      let linkedDeptMatches = false;
      if (sDeptId && departments.length > 0) {
        const studentLinkedDept = departments.find((d) => String(d?._id) === String(sDeptId));
        if (studentLinkedDept) {
          linkedDeptMatches =
            String(studentLinkedDept._id) === String(departmentId) ||
            (targetDeptId && String(studentLinkedDept._id) === targetDeptId) ||
            String(studentLinkedDept.code || '').toLowerCase().trim() === filterDeptStr ||
            String(studentLinkedDept.name || '').toLowerCase().trim() === filterDeptStr;
        }
      }

      matchesDept = Boolean(idMatches || textMatches || linkedDeptMatches);
    }

    // 3. Course matching by ID, code, or name
    let matchesCourse = true;
    if (courseId) {
      const sCourseId = s?.courseId?._id
        ? String(s.courseId._id)
        : (s?.courseId ? String(s.courseId) : '');
      const sBranch = (s?.branch || s?.courseName || s?.courseId?.name || '').toLowerCase().trim();
      const sCourseCode = (s?.courseCode || s?.courseId?.code || '').toLowerCase().trim();

      const filterCourseStr = String(courseId).toLowerCase().trim();
      const targetCourseId = targetCourse ? String(targetCourse._id) : null;
      const targetCourseCode = targetCourse?.code ? String(targetCourse.code).toLowerCase().trim() : null;
      const targetCourseName = targetCourse?.name ? String(targetCourse.name).toLowerCase().trim() : null;

      const idMatches =
        (sCourseId && (sCourseId === String(courseId) || (targetCourseId && sCourseId === targetCourseId)));

      const textMatches =
        (sBranch && (
          sBranch === filterCourseStr ||
          (targetCourseName && sBranch === targetCourseName) ||
          (targetCourseCode && sBranch === targetCourseCode)
        )) ||
        (sCourseCode && (
          sCourseCode === filterCourseStr ||
          (targetCourseCode && sCourseCode === targetCourseCode) ||
          (targetCourseName && sCourseCode === targetCourseName)
        ));

      let linkedCourseMatches = false;
      if (sCourseId && courses.length > 0) {
        const studentLinkedCourse = courses.find((c) => String(c?._id) === String(sCourseId));
        if (studentLinkedCourse) {
          linkedCourseMatches =
            String(studentLinkedCourse._id) === String(courseId) ||
            (targetCourseId && String(studentLinkedCourse._id) === targetCourseId) ||
            String(studentLinkedCourse.code || '').toLowerCase().trim() === filterCourseStr ||
            String(studentLinkedCourse.name || '').toLowerCase().trim() === filterCourseStr;
        }
      }

      matchesCourse = Boolean(idMatches || textMatches || linkedCourseMatches);
    }

    // 4. Semester matching
    let matchesSemester = true;
    if (semester !== '' && semester !== undefined && semester !== null) {
      const sSem = s?.semester !== undefined && s?.semester !== null ? s.semester : s?.currentSemester;
      matchesSemester = Number(sSem) === Number(semester);
    }

    // 5. Min CGPA matching
    let matchesCgpa = true;
    if (minCgpa !== '' && minCgpa !== undefined && minCgpa !== null) {
      const sCgpa = Number(s?.cgpa);
      matchesCgpa = !isNaN(sCgpa) && sCgpa >= Number(minCgpa);
    }

    // 6. Backlogs matching
    let matchesBacklogs = true;
    if (backlogs !== '' && backlogs !== undefined && backlogs !== null) {
      const sBacklogs = Number(s?.backlogs ?? s?.activeBacklogs ?? 0);
      if (backlogs === '0' || backlogs === 'zero') {
        matchesBacklogs = sBacklogs === 0;
      } else if (backlogs === 'max1') {
        matchesBacklogs = sBacklogs <= 1;
      } else if (backlogs === 'max2') {
        matchesBacklogs = sBacklogs <= 2;
      } else if (backlogs === 'has') {
        matchesBacklogs = sBacklogs > 0;
      } else if (!isNaN(Number(backlogs))) {
        matchesBacklogs = sBacklogs <= Number(backlogs);
      }
    }

    return matchesSearch && matchesDept && matchesCourse && matchesSemester && matchesCgpa && matchesBacklogs;
  });
}
