import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import { userIdParamsSchema, userLockSchema, userRoleSchema, usersListSchema, userStatusSchema } from '../validators/schemas.js';

export const userRouter = Router();
userRouter.use(authenticate);
userRouter.get('/', authorizePermissions(PERMISSION_IDS.USER_READ), validate(usersListSchema), userController.listUsers);
userRouter.get('/:id', authorizePermissions(PERMISSION_IDS.USER_READ), validate(userIdParamsSchema), userController.getUser);
userRouter.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.USER_MANAGE_STATUS),
  validate(userStatusSchema),
  userController.setStatus
);
userRouter.patch('/:id/lock', authorizePermissions(PERMISSION_IDS.USER_LOCK), validate(userLockSchema), userController.lock);
userRouter.patch('/:id/unlock', authorizePermissions(PERMISSION_IDS.USER_UNLOCK), validate(userIdParamsSchema), userController.unlock);
userRouter.patch(
  '/:id/role',
  authorizePermissions(PERMISSION_IDS.USER_ASSIGN_ROLE),
  validate(userRoleSchema),
  userController.changeRole
);
