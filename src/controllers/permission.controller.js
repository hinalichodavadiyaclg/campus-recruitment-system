import * as permissionService from '../services/permission.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listPermissions = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await permissionService.listPermissions())
);
export const getPermission = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await permissionService.getPermissionOrThrow(response.locals.input.params.id))
);
export const createPermission = asyncHandler(async (_request, response) =>
  sendSuccess(response, 201, await permissionService.createPermission(response.locals.input.body))
);
export const updatePermission = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await permissionService.updatePermission(response.locals.input.params.id, response.locals.input.body))
);
export const setPermissionStatus = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await permissionService.setPermissionStatus(response.locals.input.params.id, response.locals.input.body.isActive))
);
