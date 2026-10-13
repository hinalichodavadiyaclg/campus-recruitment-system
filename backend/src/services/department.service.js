import { Department } from '../models/department.model.js';
import { Student } from '../models/student.model.js';
import { AppError } from '../utils/app-error.js';

export async function listDepartments({ page = 1, limit = 20, search, isActive }) {
  const query = {};
  if (isActive !== undefined) {
    query.isActive = isActive;
  }
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [{ name: regex }, { code: regex }, { description: regex }];
  }

  const [items, total] = await Promise.all([
    Department.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Department.countDocuments(query)
  ]);

  if (items.length > 0) {
    const deptIds = items.map((d) => d._id);
    const deptNames = items.map((d) => d.name).filter(Boolean);

    const countMap = new Map();
    for (const d of items) {
      countMap.set(String(d._id), 0);
    }

    const nameToId = new Map();
    for (const d of items) {
      if (d.name) {
        nameToId.set(d.name.toLowerCase().trim(), String(d._id));
      }
    }

    const matchedStudents = await Student.find(
      {
        $or: [
          { departmentId: { $in: deptIds } },
          { department: { $in: deptNames } }
        ]
      },
      { _id: 1, departmentId: 1, department: 1 }
    ).lean();

    for (const s of matchedStudents) {
      let targetDeptId = null;
      if (s.departmentId && countMap.has(String(s.departmentId))) {
        targetDeptId = String(s.departmentId);
      } else if (s.department && nameToId.has(s.department.toLowerCase().trim())) {
        targetDeptId = nameToId.get(s.department.toLowerCase().trim());
      }

      if (targetDeptId) {
        countMap.set(targetDeptId, (countMap.get(targetDeptId) || 0) + 1);
      }
    }

    for (const d of items) {
      d.studentCount = countMap.get(String(d._id)) || 0;
    }
  }

  return { items, page, limit, total };
}

export async function getDepartmentById(id) {
  const department = await Department.findById(id).lean();
  if (!department) {
    throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
  }
  const studentCount = await Student.countDocuments({
    $or: [
      { departmentId: id },
      { department: department.name }
    ]
  });
  department.studentCount = studentCount;
  return department;
}

export async function createDepartment(input) {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();

  const nameRegex = new RegExp(`^${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
  const codeRegex = new RegExp(`^${code.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

  const existingCode = await Department.exists({ code: codeRegex });
  if (existingCode) {
    throw new AppError(409, 'DEPARTMENT_CODE_EXISTS', 'A department with this code already exists.');
  }

  const existingName = await Department.exists({ name: nameRegex });
  if (existingName) {
    throw new AppError(409, 'DEPARTMENT_NAME_EXISTS', 'A department with this name already exists.');
  }

  try {
    const department = await Department.create({
      name,
      code,
      description: input.description ? input.description.trim() : '',
      isActive: true
    });
    return department.toObject();
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'DUPLICATE_ENTRY', 'A department with this code or name already exists.');
    }
    throw error;
  }
}

export async function updateDepartment(id, input) {
  const department = await Department.findById(id);
  if (!department) {
    throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
  }

  if (input.code && input.code.trim().toUpperCase() !== department.code) {
    const newCode = input.code.trim().toUpperCase();
    const existing = await Department.exists({
      code: new RegExp(`^${newCode}$`, 'i'),
      _id: { $ne: department._id }
    });
    if (existing) {
      throw new AppError(409, 'DEPARTMENT_CODE_EXISTS', 'A department with this code already exists.');
    }
    department.code = newCode;
  }

  if (input.name && input.name.trim() !== department.name) {
    const newName = input.name.trim();
    const existing = await Department.exists({
      name: new RegExp(`^${newName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
      _id: { $ne: department._id }
    });
    if (existing) {
      throw new AppError(409, 'DEPARTMENT_NAME_EXISTS', 'A department with this name already exists.');
    }
    department.name = newName;
  }

  if (input.description !== undefined) {
    department.description = input.description.trim();
  }

  await department.save();
  return department.toObject();
}

export async function setDepartmentStatus(id, isActive) {
  const department = await Department.findById(id);
  if (!department) {
    throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
  }

  department.isActive = Boolean(isActive);
  await department.save();
  return department.toObject();
}
