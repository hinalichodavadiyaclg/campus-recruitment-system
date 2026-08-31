import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS, PERMISSION_LEGACY_ALIAS_MAP } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';

export async function assertPermissionIdsExist(permissionIds = []) {
  const normalized = [...new Set(permissionIds.map((id) => PERMISSION_LEGACY_ALIAS_MAP[id] || id))];
  if (normalized.length === 0) return normalized;
  const count = await Permission.countDocuments({ _id: { $in: normalized } });
  if (count !== normalized.length) {
    throw new AppError(400, 'INVALID_PERMISSION_IDS', 'One or more permission IDs do not exist.');
  }
  return normalized;
}

export async function getRoleOrThrow(id) {
  const role = await Role.findById(id).lean();
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
  return role;
}

export function listRoles() {
  return Role.find().sort({ name: 1 }).lean();
}

export async function createRole({ id, name, description, permissionIds = [] }) {
  try {
    const validatedPermissionIds = await assertPermissionIdsExist(permissionIds);
    return await Role.create({ _id: id, name, description, permissionIds: validatedPermissionIds, isActive: true });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(409, 'ROLE_ALREADY_EXISTS', 'A role with that ID or name already exists.');
    }
    throw error;
  }
}

export async function updateRole(id, input) {
  const update = { ...input };
  if (input.permissionIds !== undefined) {
    update.permissionIds = await assertPermissionIdsExist(input.permissionIds);
  }
  try {
    const role = await Role.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
    return role;
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(409, 'ROLE_ALREADY_EXISTS', 'A role with that name already exists.');
    }
    throw error;
  }
}

export async function assignRolePermissions(id, permissionIds) {
  const validatedPermissionIds = await assertPermissionIdsExist(permissionIds);
  const role = await Role.findByIdAndUpdate(
    id,
    { permissionIds: validatedPermissionIds },
    { new: true, runValidators: true }
  ).lean();
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
  return role;
}

export async function deleteRole(id) {
  if (id === ROLE_IDS.SUPER_ADMIN) {
    throw new AppError(400, 'CANNOT_DELETE_SYSTEM_ROLE', 'The Super Admin role cannot be deleted.');
  }
  const usersInRole = await User.countDocuments({ roleId: id });
  if (usersInRole > 0) {
    throw new AppError(400, 'ROLE_IN_USE', `Cannot delete role. There are ${usersInRole} user(s) currently assigned to this role.`);
  }
  const role = await Role.findByIdAndDelete(id).lean();
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
  return { message: 'Role deleted successfully.' };
}

export async function setRoleStatus(id, isActive) {
  if (id === ROLE_IDS.SUPER_ADMIN && !isActive) {
    throw new AppError(400, 'CANNOT_DEACTIVATE_SUPER_ADMIN', 'The Super Admin role cannot be deactivated.');
  }
  const role = await Role.findByIdAndUpdate(id, { isActive }, { new: true, runValidators: true }).lean();
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
  return role;
}
