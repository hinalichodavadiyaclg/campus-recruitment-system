import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { PERMISSION_LEGACY_ALIAS_MAP } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';

export function authorizeRoles(...roleIds) {
  return (request, _response, next) => {
    if (!request.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    if (!roleIds.includes(request.auth.roleId)) {
      return next(new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action.'));
    }
    return next();
  };
}

export function authorizePermissions(...requiredPermissionIds) {
  return asyncHandler(async (request, _response, next) => {
    if (!request.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');

    const normalizedRequired = requiredPermissionIds.map((id) => PERMISSION_LEGACY_ALIAS_MAP[id] || id);
    const role = await Role.findOne({ _id: request.auth.roleId, isActive: true }).lean();

    if (!role) {
      throw new AppError(403, 'FORBIDDEN', 'Your assigned role is inactive or does not exist.');
    }

    const rolePermissionSet = new Set(
      (role.permissionIds || []).map((id) => PERMISSION_LEGACY_ALIAS_MAP[id] || id)
    );

    const hasAll = normalizedRequired.every((permId) => rolePermissionSet.has(permId));
    if (!hasAll) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action.');
    }

    const activePermissions = await Permission.countDocuments({
      _id: { $in: normalizedRequired },
      isActive: true
    });

    if (activePermissions !== normalizedRequired.length) {
      throw new AppError(403, 'FORBIDDEN', 'Required permission is currently inactive.');
    }

    next();
  });
}

export function authorizeAnyPermission(...requiredPermissionIds) {
  return asyncHandler(async (request, _response, next) => {
    if (!request.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');

    const normalizedRequired = requiredPermissionIds.map((id) => PERMISSION_LEGACY_ALIAS_MAP[id] || id);
    const role = await Role.findOne({ _id: request.auth.roleId, isActive: true }).lean();

    if (!role) {
      throw new AppError(403, 'FORBIDDEN', 'Your assigned role is inactive or does not exist.');
    }

    const rolePermissionSet = new Set(
      (role.permissionIds || []).map((id) => PERMISSION_LEGACY_ALIAS_MAP[id] || id)
    );

    const hasAny = normalizedRequired.some((permId) => rolePermissionSet.has(permId));
    if (!hasAny) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action.');
    }

    next();
  });
}

