import { Router } from 'express';
import * as courseController from '../controllers/course.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission, authorizePermissions } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../validators/request.validator.js';
import {
  courseCreateSchema,
  courseStatusSchema,
  courseUpdateSchema,
  coursesListSchema,
  userIdParamsSchema
} from '../validators/schemas.js';

export const courseRoutes = Router();

courseRoutes.use(authenticate);

courseRoutes.get(
  '/',
  authorizeAnyPermission(PERMISSION_IDS.COURSE_READ, PERMISSION_IDS.JOB_CREATE, PERMISSION_IDS.JOB_UPDATE),
  validate(coursesListSchema),
  asyncHandler(courseController.list)
);

courseRoutes.get(
  '/:id',
  authorizeAnyPermission(PERMISSION_IDS.COURSE_READ, PERMISSION_IDS.JOB_CREATE, PERMISSION_IDS.JOB_UPDATE),
  validate(userIdParamsSchema),
  asyncHandler(courseController.getById)
);

courseRoutes.post(
  '/',
  authorizePermissions(PERMISSION_IDS.COURSE_CREATE),
  validate(courseCreateSchema),
  asyncHandler(courseController.create)
);

courseRoutes.patch(
  '/:id',
  authorizePermissions(PERMISSION_IDS.COURSE_UPDATE),
  validate(courseUpdateSchema),
  asyncHandler(courseController.update)
);

courseRoutes.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.COURSE_UPDATE),
  validate(courseStatusSchema),
  asyncHandler(courseController.setStatus)
);
