import { Router } from 'express';
import * as departmentController from '../controllers/department.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission, authorizePermissions } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../validators/request.validator.js';
import {
  departmentCreateSchema,
  departmentStatusSchema,
  departmentUpdateSchema,
  departmentsListSchema,
  userIdParamsSchema
} from '../validators/schemas.js';

export const departmentRoutes = Router();

departmentRoutes.use(authenticate);

departmentRoutes.get(
  '/',
  authorizeAnyPermission(PERMISSION_IDS.DEPARTMENT_READ, PERMISSION_IDS.JOB_CREATE, PERMISSION_IDS.JOB_UPDATE),
  validate(departmentsListSchema),
  asyncHandler(departmentController.list)
);

departmentRoutes.get(
  '/:id',
  authorizeAnyPermission(PERMISSION_IDS.DEPARTMENT_READ, PERMISSION_IDS.JOB_CREATE, PERMISSION_IDS.JOB_UPDATE),
  validate(userIdParamsSchema),
  asyncHandler(departmentController.getById)
);

departmentRoutes.post(
  '/',
  authorizePermissions(PERMISSION_IDS.DEPARTMENT_CREATE),
  validate(departmentCreateSchema),
  asyncHandler(departmentController.create)
);

departmentRoutes.patch(
  '/:id',
  authorizePermissions(PERMISSION_IDS.DEPARTMENT_UPDATE),
  validate(departmentUpdateSchema),
  asyncHandler(departmentController.update)
);

departmentRoutes.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.DEPARTMENT_UPDATE),
  validate(departmentStatusSchema),
  asyncHandler(departmentController.setStatus)
);


