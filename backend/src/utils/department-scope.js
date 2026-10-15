import { Department } from '../models/department.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
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
