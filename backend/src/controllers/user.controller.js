import { env } from '../config/env.js';
import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listUsers = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await userService.listUsers(response.locals.input.query))
);

export const getUser = asyncHandler(async (_request, response) => {
  const user = await userService.getUserOrThrow(response.locals.input.params.id);
  const safe = userService.toSafeUser(user);
  if (user.userType === 'COMPANY') {
    const { Company } = await import('../models/company.model.js');
    const comp = await Company.findOne({
      $or: [
        ...(user.companyId ? [{ _id: user.companyId }] : []),
        { primaryRecruiterId: user._id },
        { userId: user._id }
      ]
    }).lean();
    if (comp) {
      safe.companyName = comp.companyName;
      safe.companyBusinessId = comp.companyId || null;
      safe.profileName = comp.companyName;
      safe.profile = comp;
    }
  }
  return sendSuccess(response, 200, safe);
});

export const createUser = asyncHandler(async (_request, response) =>
  sendSuccess(response, 201, await userService.createUser(response.locals.input.body))
);

export const updateUser = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await userService.updateUser(response.locals.input.params.id, response.locals.input.body))
);

export const deleteUser = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await userService.deleteUser(response.locals.input.params.id, request.auth.userId, request.auth))
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
