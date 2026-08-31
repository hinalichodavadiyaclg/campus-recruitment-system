import { Router } from 'express';
import * as permissionController from '../controllers/permission.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import {
  permissionCreateSchema,
  permissionStatusSchema,
  permissionUpdateSchema,
  resourceIdParamsSchema
} from '../validators/schemas.js';

export const permissionRouter = Router();

permissionRouter.use(authenticate);

permissionRouter.get('/', authorizePermissions(PERMISSION_IDS.PERMISSION_READ), permissionController.listPermissions);
permissionRouter.post(
  '/',
  authorizePermissions(PERMISSION_IDS.PERMISSION_CREATE),
  validate(permissionCreateSchema),
  permissionController.createPermission
);
permissionRouter.get(
  '/:id',
  authorizePermissions(PERMISSION_IDS.PERMISSION_READ),
  validate(resourceIdParamsSchema),
  permissionController.getPermission
);
permissionRouter.put(
  '/:id',
  authorizePermissions(PERMISSION_IDS.PERMISSION_UPDATE),
  validate(permissionUpdateSchema),
  permissionController.updatePermission
);
permissionRouter.delete(
  '/:id',
  authorizePermissions(PERMISSION_IDS.PERMISSION_DELETE),
  validate(resourceIdParamsSchema),
  permissionController.deletePermission
);
permissionRouter.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.PERMISSION_MANAGE_STATUS),
  validate(permissionStatusSchema),
  permissionController.setPermissionStatus
);
