import { Course } from '../models/course.model.js';
import { Department } from '../models/department.model.js';
import { Student } from '../models/student.model.js';
import { AppError } from '../utils/app-error.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';

export async function listCourses({ page = 1, limit = 20, search, departmentId, level, isActive } = {}, auth = null) {
  const query = {};
  if (isActive !== undefined) {
    query.isActive = isActive;
  }

  const coordDept = await getCoordinatorDepartment(auth);
  if (coordDept) {
    if (departmentId && String(departmentId) !== String(coordDept.departmentId)) {
      query.departmentId = new mongoose.Types.ObjectId();
    } else {
      query.departmentId = coordDept.departmentId;
    }
  } else if (departmentId) {
    query.departmentId = departmentId;
  }

  if (level) {
    query.level = level;
  }
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [{ name: regex }, { code: regex }, { description: regex }];
  }

  const [items, total] = await Promise.all([
    Course.find(query)
      .populate('departmentId', 'name code isActive')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Course.countDocuments(query)
  ]);

  if (items.length > 0) {
    const courseIds = items.map((c) => c._id);
    const courseNames = items.map((c) => c.name).filter(Boolean);

    const countMap = new Map();
    for (const c of items) {
      countMap.set(String(c._id), 0);
    }

    const nameToId = new Map();
    for (const c of items) {
      if (c.name) {
        nameToId.set(c.name.toLowerCase().trim(), String(c._id));
      }
    }

    const studentMatchQuery = {
      $or: [
        { courseId: { $in: courseIds } },
        { branch: { $in: courseNames } }
      ]
    };
    if (coordDept) {
      studentMatchQuery.$and = [
        {
          $or: [
            { departmentId: coordDept.departmentId },
            { department: new RegExp(`^${coordDept.departmentName.trim()}$`, 'i') }
          ]
        }
      ];
    }

    const matchedStudents = await Student.find(
      studentMatchQuery,
      { _id: 1, courseId: 1, branch: 1 }
    ).lean();

    for (const s of matchedStudents) {
      let targetCourseId = null;
      if (s.courseId && countMap.has(String(s.courseId))) {
        targetCourseId = String(s.courseId);
      } else if (s.branch && nameToId.has(s.branch.toLowerCase().trim())) {
        targetCourseId = nameToId.get(s.branch.toLowerCase().trim());
      }

      if (targetCourseId) {
        countMap.set(targetCourseId, (countMap.get(targetCourseId) || 0) + 1);
      }
    }

    for (const c of items) {
      c.studentCount = countMap.get(String(c._id)) || 0;
    }
  }

  return { items, page, limit, total };
}

export async function getCourseById(id, auth = null) {
  const course = await Course.findById(id).populate('departmentId', 'name code isActive').lean();
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found.');
  }

  const coordDept = await getCoordinatorDepartment(auth);
  if (coordDept) {
    const courseDeptId = course.departmentId?._id ? String(course.departmentId._id) : String(course.departmentId);
    if (courseDeptId !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to access courses from another department.');
    }
  }

  const studentCountQuery = {
    $or: [
      { courseId: id },
      { branch: course.name }
    ]
  };
  if (coordDept) {
    studentCountQuery.$and = [
      {
        $or: [
          { departmentId: coordDept.departmentId },
          { department: new RegExp(`^${coordDept.departmentName.trim()}$`, 'i') }
        ]
      }
    ];
  }

  const studentCount = await Student.countDocuments(studentCountQuery);
  course.studentCount = studentCount;
  return course;
}

export async function createCourse(input, auth = null) {
  const coordDept = await getCoordinatorDepartment(auth);
  if (coordDept) {
    if (input.departmentId && String(input.departmentId) !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'Placement Coordinators can only create courses in their assigned department.');
    }
    input.departmentId = coordDept.departmentId;
  }

  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const departmentId = input.departmentId;

  // Validate referenced Department exists and is active
  const department = await Department.findById(departmentId);
  if (!department) {
    throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'The referenced department does not exist.');
  }
  if (!department.isActive) {
    throw new AppError(400, 'DEPARTMENT_INACTIVE', 'Cannot assign a course to an inactive department.');
  }

  const codeRegex = new RegExp(`^${code.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
  const existingCode = await Course.exists({ code: codeRegex });
  if (existingCode) {
    throw new AppError(409, 'COURSE_CODE_EXISTS', 'A course with this code already exists.');
  }

  try {
    const course = await Course.create({
      name,
      code,
      departmentId: department._id,
      level: input.level,
      durationYears: input.durationYears !== undefined ? Number(input.durationYears) : undefined,
      description: input.description ? input.description.trim() : '',
      isActive: true
    });

    const populated = await Course.findById(course._id).populate('departmentId', 'name code isActive').lean();
    return populated;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'DUPLICATE_ENTRY', 'A course with this code already exists.');
    }
    throw error;
  }
}

export async function updateCourse(id, input, auth = null) {
  const course = await Course.findById(id);
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found.');
  }

  const coordDept = await getCoordinatorDepartment(auth);
  if (coordDept) {
    const courseDeptId = String(course.departmentId);
    if (courseDeptId !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to update courses from another department.');
    }
    if (input.departmentId && String(input.departmentId) !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'Placement Coordinators cannot reassign courses to another department.');
    }
    input.departmentId = coordDept.departmentId;
  }

  if (input.departmentId && String(input.departmentId) !== String(course.departmentId)) {
    const department = await Department.findById(input.departmentId);
    if (!department) {
      throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'The referenced department does not exist.');
    }
    if (!department.isActive) {
      throw new AppError(400, 'DEPARTMENT_INACTIVE', 'Cannot reassign a course to an inactive department.');
    }
    course.departmentId = department._id;
  }

  if (input.code && input.code.trim().toUpperCase() !== course.code) {
    const newCode = input.code.trim().toUpperCase();
    const existing = await Course.exists({
      code: new RegExp(`^${newCode}$`, 'i'),
      _id: { $ne: course._id }
    });
    if (existing) {
      throw new AppError(409, 'COURSE_CODE_EXISTS', 'A course with this code already exists.');
    }
    course.code = newCode;
  }

  if (input.name !== undefined) {
    course.name = input.name.trim();
  }
  if (input.level !== undefined) {
    course.level = input.level;
  }
  if (input.durationYears !== undefined) {
    course.durationYears = input.durationYears ? Number(input.durationYears) : undefined;
  }
  if (input.description !== undefined) {
    course.description = input.description.trim();
  }

  await course.save();

  const populated = await Course.findById(course._id).populate('departmentId', 'name code isActive').lean();
  return populated;
}

export async function setCourseStatus(id, isActive, auth = null) {
  const course = await Course.findById(id);
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found.');
  }

  const coordDept = await getCoordinatorDepartment(auth);
  if (coordDept) {
    const courseDeptId = String(course.departmentId);
    if (courseDeptId !== String(coordDept.departmentId)) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to modify course status from another department.');
    }
  }

  course.isActive = Boolean(isActive);
  await course.save();

  const populated = await Course.findById(course._id).populate('departmentId', 'name code isActive').lean();
  return populated;
}
