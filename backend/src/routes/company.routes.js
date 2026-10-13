import { Router } from 'express';
import * as companyController from '../controllers/company.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission, authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import {
  companyCreateSchema,
  companyRecruiterCreateSchema,
  companyRecruiterDetailParamsSchema,
  companyRecruiterParamsSchema,
  companyRecruiterUpdateSchema,
  companyUpdateSchema,
  userIdParamsSchema
} from '../validators/schemas.js';

export const companyRouter = Router();

companyRouter.use(authenticate);

companyRouter.get(
  '/me',
  authorizeAnyPermission(PERMISSION_IDS.AUTH_READ_SELF, PERMISSION_IDS.USER_READ),
  companyController.getMyCompanyProfile
);
companyRouter.put(
  '/me',
  authorizeAnyPermission(PERMISSION_IDS.AUTH_READ_SELF, PERMISSION_IDS.USER_UPDATE),
  companyController.updateMyCompanyProfile
);

companyRouter.get('/', authorizePermissions(PERMISSION_IDS.USER_READ), companyController.listCompanies);
companyRouter.post('/', authorizePermissions(PERMISSION_IDS.USER_CREATE), validate(companyCreateSchema), companyController.createCompany);
companyRouter.get('/:id', authorizePermissions(PERMISSION_IDS.USER_READ), validate(userIdParamsSchema), companyController.getCompany);
companyRouter.put('/:id', authorizePermissions(PERMISSION_IDS.USER_UPDATE), validate(companyUpdateSchema), companyController.updateCompany);
companyRouter.delete('/:id', authorizePermissions(PERMISSION_IDS.USER_DELETE), validate(userIdParamsSchema), companyController.deleteCompany);

// Recruiter accounts associated with this company
companyRouter.get(
  '/:id/recruiters',
  authorizePermissions(PERMISSION_IDS.USER_READ),
  validate(companyRecruiterParamsSchema),
  companyController.listCompanyRecruiters
);

companyRouter.post(
  '/:id/recruiters',
  authorizePermissions(PERMISSION_IDS.USER_CREATE),
  validate(companyRecruiterCreateSchema),
  companyController.createCompanyRecruiter
);

companyRouter.put(
  '/:id/recruiters/:recruiterId',
  authorizePermissions(PERMISSION_IDS.USER_UPDATE),
  validate(companyRecruiterUpdateSchema),
  companyController.updateCompanyRecruiter
);

companyRouter.delete(
  '/:id/recruiters/:recruiterId',
  authorizePermissions(PERMISSION_IDS.USER_DELETE),
  validate(companyRecruiterDetailParamsSchema),
  companyController.deleteCompanyRecruiter
);
