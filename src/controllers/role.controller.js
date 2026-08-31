import * as roleService from '../services/role.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listRoles = asyncHandler(async (_request, response) => sendSuccess(response, 200, await roleService.listRoles()));
export const getRole = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await roleService.getRoleOrThrow(response.locals.input.params.id))
);
export const createRole = asyncHandler(async (_request, response) =>
  sendSuccess(response, 201, await roleService.createRole(response.locals.input.body))
);
export const updateRole = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await roleService.updateRole(response.locals.input.params.id, response.locals.input.body))
);
export const setRoleStatus = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await roleService.setRoleStatus(response.locals.input.params.id, response.locals.input.body.isActive))
);
