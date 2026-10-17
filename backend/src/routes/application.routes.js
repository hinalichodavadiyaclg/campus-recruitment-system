import { Router } from 'express';
import * as applicationController from '../controllers/application.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { validate } from '../validators/request.validator.js';
import {
  applicationCreateSchema,
  applicationIdParamsSchema,
  applicationListQuerySchema,
  applicationStatusUpdateSchema,
  applicationWithdrawSchema
} from '../validators/schemas.js';

export const applicationRoutes = Router();

applicationRoutes.use(authenticate);

applicationRoutes.post(
  '/',
  authorizePermissions(PERMISSION_IDS.APPLICATION_CREATE),
  validate(applicationCreateSchema),
  applicationController.submit
);

applicationRoutes.get(
  '/',
  authorizePermissions(PERMISSION_IDS.APPLICATION_READ),
  validate(applicationListQuerySchema),
  applicationController.list
);

applicationRoutes.get(
  '/:id',
  authorizePermissions(PERMISSION_IDS.APPLICATION_READ),
  validate(applicationIdParamsSchema),
  applicationController.getById
);

applicationRoutes.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.APPLICATION_UPDATE),
  validate(applicationStatusUpdateSchema),
  applicationController.updateStatus
);

applicationRoutes.post(
  '/:id/withdraw',
  authorizePermissions(PERMISSION_IDS.APPLICATION_CREATE),
  validate(applicationWithdrawSchema),
  applicationController.withdraw
);
