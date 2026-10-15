import { Router } from 'express';
import multer from 'multer';
import * as importController from '../controllers/import.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission, authorizePermissions } from '../middleware/authorize.js';
import { AppError } from '../utils/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function authorizeImportType() {
  return (request, response, next) => {
    const { type } = request.params;
    let requiredPermission = null;
    if (type === 'student') requiredPermission = PERMISSION_IDS.STUDENT_IMPORT;
    else if (type === 'company') requiredPermission = PERMISSION_IDS.COMPANY_IMPORT;
    else if (type === 'placement') requiredPermission = PERMISSION_IDS.PLACEMENT_USER_IMPORT;
    else return next(new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown import type: ${type}`));

    return authorizePermissions(requiredPermission)(request, response, next);
  };
}

function authorizeExportType() {
  return (request, response, next) => {
    const { type } = request.params;
    let requiredPermissions = [];
    if (type === 'student') requiredPermissions = [PERMISSION_IDS.STUDENT_READ, PERMISSION_IDS.USER_READ];
    else if (type === 'company') requiredPermissions = [PERMISSION_IDS.USER_READ];
    else if (type === 'placement') requiredPermissions = [PERMISSION_IDS.PLACEMENT_USER_IMPORT, PERMISSION_IDS.USER_CREATE];
    else return next(new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown export type: ${type}`));

    return authorizeAnyPermission(...requiredPermissions)(request, response, next);
  };
}

export const importRouter = Router();

importRouter.use(authenticate);

importRouter.get('/templates/:type', authorizeImportType(), importController.downloadTemplate);
importRouter.post('/validate/:type', authorizeImportType(), upload.single('file'), importController.validateImport);
importRouter.post('/confirm/:type', authorizeImportType(), upload.single('file'), importController.confirmImport);
importRouter.get('/export/:type', authorizeExportType(), importController.exportData);
