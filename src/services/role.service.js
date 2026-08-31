import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { AppError } from '../utils/app-error.js';

export async function assertPermissionIdsExist(permissionIds) {
  const normalized = [...new Set(permissionIds)];
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

export async function createRole({ id, name, description, permissionIds }) {
  try {
    return await Role.create({ _id: id, name, description, permissionIds: await assertPermissionIdsExist(permissionIds) });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(409, 'ROLE_ALREADY_EXISTS', 'A role with that ID or name already exists.');
    }
    throw error;
  }
}

export async function updateRole(id, input) {
  const update = { ...input };
  if (input.permissionIds !== undefined) update.permissionIds = await assertPermissionIdsExist(input.permissionIds);
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

export async function setRoleStatus(id, isActive) {
  const role = await Role.findByIdAndUpdate(id, { isActive }, { new: true, runValidators: true }).lean();
  if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found.');
  return role;
}
