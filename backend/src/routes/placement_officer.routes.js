import { Router } from 'express';
import * as placementOfficerController from '../controllers/placement_officer.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import {
  placementOfficerCreateSchema,
  placementOfficerUpdateSchema,
  userIdParamsSchema
} from '../validators/schemas.js';

export const placementOfficerRouter = Router();

placementOfficerRouter.use(authenticate);

placementOfficerRouter.get('/', authorizePermissions(PERMISSION_IDS.USER_READ), placementOfficerController.listPlacementOfficers);
placementOfficerRouter.post('/', authorizePermissions(PERMISSION_IDS.USER_CREATE), validate(placementOfficerCreateSchema), placementOfficerController.createPlacementOfficer);
placementOfficerRouter.get('/:id', authorizePermissions(PERMISSION_IDS.USER_READ), validate(userIdParamsSchema), placementOfficerController.getPlacementOfficer);
placementOfficerRouter.put('/:id', authorizePermissions(PERMISSION_IDS.USER_UPDATE), validate(placementOfficerUpdateSchema), placementOfficerController.updatePlacementOfficer);
placementOfficerRouter.delete('/:id', authorizePermissions(PERMISSION_IDS.USER_DELETE), validate(userIdParamsSchema), placementOfficerController.deletePlacementOfficer);
