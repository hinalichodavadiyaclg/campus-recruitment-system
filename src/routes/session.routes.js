import { Router } from 'express';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { listSessionActivity } from '../controllers/session.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import { sessionsListSchema } from '../validators/schemas.js';

export const sessionRouter = Router();
sessionRouter.get('/', authenticate, authorizePermissions(PERMISSION_IDS.SESSION_READ), validate(sessionsListSchema), listSessionActivity);
