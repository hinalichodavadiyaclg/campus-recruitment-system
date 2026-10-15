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
  return courses.filter((c) => {
    const dId = c?.departmentId?._id ? String(c.departmentId._id) : (c?.departmentId ? String(c.departmentId) : '');
    return dId === String(selectedDepartmentId);
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
  return Boolean(cDeptId && String(cDeptId) !== String(newDepartmentId));
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

    // 2. Department matching by actual ID
    let matchesDept = true;
    if (departmentId) {
      const sDeptId = s?.departmentId?._id
        ? String(s.departmentId._id)
        : (s?.departmentId ? String(s.departmentId) : '');
      if (sDeptId) {
        matchesDept = sDeptId === String(departmentId);
      } else if (s?.department) {
        // Fallback for unlinked legacy record if department string matches department name or code
        const matchedDept = departments.find(
          (d) =>
            d?.name?.toLowerCase() === s.department.toLowerCase() ||
            d?.code?.toLowerCase() === s.department.toLowerCase()
        );
        matchesDept = Boolean(matchedDept && String(matchedDept._id) === String(departmentId));
      } else {
        matchesDept = false;
      }
    }

    // 3. Course matching by actual ID
    let matchesCourse = true;
    if (courseId) {
      const sCourseId = s?.courseId?._id
        ? String(s.courseId._id)
        : (s?.courseId ? String(s.courseId) : '');
      if (sCourseId) {
        matchesCourse = sCourseId === String(courseId);
      } else if (s?.branch) {
        // Fallback for unlinked legacy record if branch string matches course name or code
        const matchedCourse = courses.find(
          (c) =>
            c?.name?.toLowerCase() === s.branch.toLowerCase() ||
            c?.code?.toLowerCase() === s.branch.toLowerCase()
        );
        matchesCourse = Boolean(matchedCourse && String(matchedCourse._id) === String(courseId));
      } else {
        matchesCourse = false;
      }
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
