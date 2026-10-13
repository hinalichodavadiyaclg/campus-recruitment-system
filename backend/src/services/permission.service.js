import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { AppError } from '../utils/app-error.js';

export async function getPermissionOrThrow(id) {
  const permission = await Permission.findById(id).lean();
  if (!permission) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'Permission not found.');
  return permission;
}

export function listPermissions() {
  return Permission.find().sort({ module: 1, name: 1 }).lean();
}

export async function createPermission({ id, name, module, action, description }) {
  try {
    return await Permission.create({ _id: id, name, module, action, description, isActive: true });
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(409, 'PERMISSION_ALREADY_EXISTS', 'A permission with that ID or name already exists.');
    }
    throw error;
  }
}

export async function updatePermission(id, input) {
  try {
    const permission = await Permission.findByIdAndUpdate(id, input, { new: true, runValidators: true }).lean();
    if (!permission) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'Permission not found.');
    return permission;
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(409, 'PERMISSION_ALREADY_EXISTS', 'A permission with that name already exists.');
    }
    throw error;
  }
}

export async function deletePermission(id) {
  const permission = await Permission.findById(id).lean();
  if (!permission) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'Permission not found.');

  // Remove permission from all roles
  await Role.updateMany({ permissionIds: id }, { $pull: { permissionIds: id } });
  await Permission.findByIdAndDelete(id);

  return { message: 'Permission deleted successfully and removed from associated roles.' };
}

export async function setPermissionStatus(id, isActive) {
  const permission = await Permission.findByIdAndUpdate(id, { isActive }, { new: true, runValidators: true }).lean();
  if (!permission) throw new AppError(404, 'PERMISSION_NOT_FOUND', 'Permission not found.');
  return permission;
}
