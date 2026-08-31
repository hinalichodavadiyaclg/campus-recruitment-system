import { env } from '../config/env.js';
import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listUsers = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await userService.listUsers(response.locals.input.query))
);
export const getUser = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, userService.toSafeUser(await userService.getUserOrThrow(response.locals.input.params.id)))
);
export const setStatus = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await userService.setUserStatus(response.locals.input.params.id, response.locals.input.body.accountStatus))
);
export const lock = asyncHandler(async (_request, response) =>
  sendSuccess(
    response,
    200,
    await userService.lockUser(response.locals.input.params.id, response.locals.input.body.lockMinutes || env.accountLockMinutes)
  )
);
export const unlock = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await userService.unlockUser(response.locals.input.params.id))
);
export const changeRole = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await userService.assignUserRole(response.locals.input.params.id, response.locals.input.body.roleId, request.auth.roleId)
  )
);
