import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
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
    const role = await Role.findOne({ _id: request.auth.roleId, isActive: true }).lean();
    if (!role || !requiredPermissionIds.every((permissionId) => role.permissionIds.includes(permissionId))) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action.');
    }
    const activePermissions = await Permission.countDocuments({
      _id: { $in: requiredPermissionIds },
      isActive: true
    });
    if (activePermissions !== requiredPermissionIds.length) {
      throw new AppError(403, 'FORBIDDEN', 'You are not authorized to perform this action.');
    }
    next();
  });
}
