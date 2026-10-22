import { Router } from 'express';
import * as jobController from '../controllers/job.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { validate } from '../validators/request.validator.js';
import {
  jobCreateSchema,
  jobIdParamsSchema,
  jobListQuerySchema,
  jobReopenSchema,
  jobStatusUpdateSchema,
  jobSuspendSchema,
  jobUpdateSchema
} from '../validators/schemas.js';

export const jobRoutes = Router();

jobRoutes.use(authenticate);

jobRoutes.post(
  '/',
  authorizePermissions(PERMISSION_IDS.JOB_CREATE),
  validate(jobCreateSchema),
  jobController.create
);

jobRoutes.get(
  '/',
  authorizePermissions(PERMISSION_IDS.JOB_READ),
  validate(jobListQuerySchema),
  jobController.list
);

jobRoutes.get(
  '/:id',
  authorizePermissions(PERMISSION_IDS.JOB_READ),
  validate(jobIdParamsSchema),
  jobController.getById
);

jobRoutes.put(
  '/:id',
  authorizePermissions(PERMISSION_IDS.JOB_UPDATE),
  validate(jobUpdateSchema),
  jobController.update
);

jobRoutes.patch(
  '/:id/status',
  authorizePermissions(PERMISSION_IDS.JOB_UPDATE),
  validate(jobStatusUpdateSchema),
  jobController.updateStatus
);

jobRoutes.post(
  '/:id/reopen',
  authorizePermissions(PERMISSION_IDS.JOB_UPDATE),
  validate(jobReopenSchema),
  jobController.reopen
);

jobRoutes.patch(
  '/:id/suspend',
  authorizePermissions(PERMISSION_IDS.JOB_MANAGE),
  validate(jobSuspendSchema),
  jobController.suspend
);
