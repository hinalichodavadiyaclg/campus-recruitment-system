import { Router } from 'express';
import multer from 'multer';
import * as importController from '../controllers/import.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
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

export const importRouter = Router();

importRouter.use(authenticate);

importRouter.get('/templates/:type', authorizeImportType(), importController.downloadTemplate);
importRouter.post('/validate/:type', authorizeImportType(), upload.single('file'), importController.validateImport);
importRouter.post('/confirm/:type', authorizeImportType(), upload.single('file'), importController.confirmImport);
