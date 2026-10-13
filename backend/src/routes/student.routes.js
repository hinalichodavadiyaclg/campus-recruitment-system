import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import * as studentController from '../controllers/student.controller.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission, authorizePermissions } from '../middleware/authorize.js';
import { validate } from '../validators/request.validator.js';
import {
  studentCreateSchema,
  studentUpdateSchema,
  userIdParamsSchema
} from '../validators/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsBaseDir = path.join(__dirname, '..', '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination(_req, file, cb) {
    let subfolder = 'documents';
    if (file.fieldname === 'resume' || file.mimetype.includes('pdf')) subfolder = 'resumes';
    if (file.mimetype.startsWith('image/')) subfolder = 'photos';
    const targetDir = path.join(uploadsBaseDir, subfolder);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname || 'file'}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

export const studentRouter = Router();

// Public Shareable Student Profile (Optional Auth)
studentRouter.get(
  '/public/:id',
  (req, res, next) => {
    if (req.get('authorization')) {
      return authenticate(req, res, next);
    }
    next();
  },
  studentController.getPublicStudentProfile
);

// Authenticated Routes
studentRouter.use(authenticate);

// Student My Profile endpoints
studentRouter.get(
  '/me',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_READ,
    PERMISSION_IDS.AUTH_READ_SELF,
    PERMISSION_IDS.STUDENT_READ,
    PERMISSION_IDS.USER_READ
  ),
  studentController.getMyStudentProfile
);
studentRouter.put(
  '/me',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF,
    PERMISSION_IDS.STUDENT_UPDATE
  ),
  studentController.updateMyProfile
);

// Profile Photo Management
studentRouter.post(
  '/me/photo',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.updateProfilePhoto
);
studentRouter.delete(
  '/me/photo',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.deleteProfilePhoto
);

// Resume Management
studentRouter.post(
  '/me/resume',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.updateResume
);
studentRouter.delete(
  '/me/resume',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.deleteResume
);

// Certificates
studentRouter.post(
  '/me/certificates',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.addCertificate
);
studentRouter.put(
  '/me/certificates/:certId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.updateCertificate
);
studentRouter.delete(
  '/me/certificates/:certId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.deleteCertificate
);

// Projects
studentRouter.post(
  '/me/projects',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.addProject
);
studentRouter.put(
  '/me/projects/:projectId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.updateProject
);
studentRouter.delete(
  '/me/projects/:projectId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.deleteProject
);

// Internships
studentRouter.post(
  '/me/internships',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.addInternship
);
studentRouter.put(
  '/me/internships/:internshipId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.updateInternship
);
studentRouter.delete(
  '/me/internships/:internshipId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.deleteInternship
);

// Achievements
studentRouter.post(
  '/me/achievements',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.addAchievement
);
studentRouter.put(
  '/me/achievements/:achievementId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  upload.single('file'),
  studentController.updateAchievement
);
studentRouter.delete(
  '/me/achievements/:achievementId',
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  ),
  studentController.deleteAchievement
);

// Admin & Staff Student Management CRUD
studentRouter.get(
  '/',
  authorizeAnyPermission(PERMISSION_IDS.USER_READ, PERMISSION_IDS.STUDENT_READ),
  studentController.listStudents
);
studentRouter.post(
  '/',
  authorizeAnyPermission(PERMISSION_IDS.USER_CREATE, PERMISSION_IDS.STUDENT_CREATE),
  validate(studentCreateSchema),
  studentController.createStudent
);
studentRouter.get(
  '/:id',
  authorizeAnyPermission(PERMISSION_IDS.USER_READ, PERMISSION_IDS.STUDENT_READ),
  validate(userIdParamsSchema),
  studentController.getStudent
);
studentRouter.put(
  '/:id',
  authorizeAnyPermission(PERMISSION_IDS.USER_UPDATE, PERMISSION_IDS.STUDENT_UPDATE),
  validate(studentUpdateSchema),
  studentController.updateStudent
);
studentRouter.delete(
  '/:id',
  authorizeAnyPermission(PERMISSION_IDS.USER_DELETE, PERMISSION_IDS.STUDENT_DELETE),
  validate(userIdParamsSchema),
  studentController.deleteStudent
);

