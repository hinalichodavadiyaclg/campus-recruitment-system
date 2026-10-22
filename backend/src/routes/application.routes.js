import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import * as applicationController from '../controllers/application.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizePermissions } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../validators/request.validator.js';
import {
  applicationCreateSchema,
  applicationIdParamsSchema,
  applicationListQuerySchema,
  applicationStatusUpdateSchema,
  applicationWithdrawSchema
} from '../validators/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resumesBaseDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'resumes');

const resumeStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(resumesBaseDir, { recursive: true });
    cb(null, resumesBaseDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `resume-job-${uniqueSuffix}${ext || '.pdf'}`);
  }
});

const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isPdfExt = ext === '.pdf';
    const isPdfMime = file.mimetype === 'application/pdf';
    if (isPdfExt && isPdfMime) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only PDF resume files (.pdf) are allowed.'));
    }
  }
});

const handleResumeUpload = (req, res, next) => {
  resumeUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(400, 'FILE_TOO_LARGE', 'Resume file size exceeds maximum limit of 5MB.'));
        }
        return next(new AppError(400, 'UPLOAD_ERROR', err.message));
      }
      return next(err);
    }
    next();
  });
};

export const applicationRoutes = Router();

applicationRoutes.use(authenticate);

applicationRoutes.post(
  '/upload-resume',
  authorizePermissions(PERMISSION_IDS.APPLICATION_CREATE),
  handleResumeUpload,
  applicationController.uploadJobResume
);

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
  '/:id/resume',
  authorizePermissions(PERMISSION_IDS.APPLICATION_READ),
  validate(applicationIdParamsSchema),
  applicationController.getResume
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
