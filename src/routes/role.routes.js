import { Router } from 'express';
import * as roleController from '../controllers/role.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import {
  resourceIdParamsSchema,
  roleCreateSchema,
  rolePermissionsSchema,
  roleStatusSchema,
  roleUpdateSchema
} from '../validators/schemas.js';

export const roleRouter = Router();

roleRouter.use(authenticate);

roleRouter.get('/', authorizePermissions(PERMISSION_IDS.ROLE_READ), roleController.listRoles);
roleRouter.post('/', authorizePermissions(PERMISSION_IDS.ROLE_CREATE), validate(roleCreateSchema), roleController.createRole);
roleRouter.get('/:id', authorizePermissions(PERMISSION_IDS.ROLE_READ), validate(resourceIdParamsSchema), roleController.getRole);
roleRouter.put('/:id', authorizePermissions(PERMISSION_IDS.ROLE_UPDATE), validate(roleUpdateSchema), roleController.updateRole);
roleRouter.delete('/:id', authorizePermissions(PERMISSION_IDS.ROLE_DELETE), validate(resourceIdParamsSchema), roleController.deleteRole);

roleRouter.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.ROLE_MANAGE_STATUS),
  validate(roleStatusSchema),
  roleController.setRoleStatus
);

roleRouter.post(
  '/:id/permissions',
  authorizePermissions(PERMISSION_IDS.ROLE_ASSIGN_PERMISSION),
  validate(rolePermissionsSchema),
  roleController.assignPermissions
);

roleRouter.put(
  '/:id/permissions',
  authorizePermissions(PERMISSION_IDS.ROLE_ASSIGN_PERMISSION),
  validate(rolePermissionsSchema),
  roleController.assignPermissions
);
