import { Department } from '../models/department.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { Student } from '../models/student.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from './access-constants.js';
import { AppError } from './app-error.js';

/**
 * Resolves the trusted department assignment for an authenticated user.
 * - Returns null if the user is not a Placement Coordinator (i.e. not department-scoped).
 * - Fails closed (throws AppError 403) if a Placement Coordinator has no valid, active department.
 */
export async function getCoordinatorDepartment(auth) {
  if (!auth || !auth.userId) return null;
  if (auth.roleId !== ROLE_IDS.PLACEMENT_COORDINATOR) {
    return null;
  }

  const officer = await PlacementOfficer.findOne({ userId: auth.userId }).lean();
  if (!officer) {
    throw new AppError(403, 'FORBIDDEN', 'No Placement Officer profile linked to this coordinator account.');
  }

  let dept = null;
  if (officer.departmentId) {
    dept = await Department.findById(officer.departmentId).lean();
  } else if (officer.department) {
    dept = await Department.findOne({
      $or: [
        { name: new RegExp(`^${officer.department.trim()}$`, 'i') },
        { code: new RegExp(`^${officer.department.trim()}$`, 'i') }
      ]
    }).lean();
  }

  if (!dept) {
    throw new AppError(403, 'FORBIDDEN', 'No valid department assigned to this Placement Coordinator.');
  }

  if (!dept.isActive) {
    throw new AppError(403, 'FORBIDDEN', 'The assigned department is currently inactive.');
  }

  return {
    departmentId: dept._id,
    departmentName: dept.name,
    departmentCode: dept.code
  };
}

/**
 * Resolves the trusted department assignment for an authenticated student.
 * - Returns null if the user is not a Student.
 * - Resolves student by userId, or fallback user universityId / email.
 * - Looks up Department by departmentId or department name/code.
 * - Returns { departmentId, departmentName, departmentCode } or null.
 */
export async function getStudentDepartment(auth) {
  if (!auth || !auth.userId) return null;
  if (auth.userType !== 'STUDENT' && auth.roleId !== ROLE_IDS.STUDENT) {
    return null;
  }

  let student = await Student.findOne({ userId: auth.userId }).lean();
  if (!student) {
    const user = await User.findById(auth.userId).lean();
    if (user) {
      if (user.email) {
        student = await Student.findOne({ email: user.email.toLowerCase().trim() }).lean();
      }
      if (!student && user.universityId) {
        student = await Student.findOne({ universityId: user.universityId.trim().toUpperCase() }).lean();
      }
    }
  }

  if (!student) {
    return null;
  }

  let dept = null;
  if (student.departmentId) {
    dept = await Department.findById(student.departmentId).lean();
  } else if (student.department) {
    dept = await Department.findOne({
      $or: [
        { name: new RegExp(`^${student.department.trim()}$`, 'i') },
        { code: new RegExp(`^${student.department.trim()}$`, 'i') }
      ]
    }).lean();
  }

  if (dept) {
    return {
      departmentId: dept._id,
      departmentName: dept.name,
      departmentCode: dept.code
    };
  }

  if (student.departmentId) {
    return {
      departmentId: student.departmentId,
      departmentName: student.department || '',
      departmentCode: ''
    };
  }

  return null;
}

