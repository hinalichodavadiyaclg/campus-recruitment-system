import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import * as resumeController from '../controllers/resume-analysis.controller.js';
import * as improvementController from '../controllers/resume-improvement.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

export const resumeAnalysisRouter = Router();

// All resume routes require authentication & student permission
resumeAnalysisRouter.use(
  authenticate,
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  )
);

// Upload resume
resumeAnalysisRouter.post('/upload', upload.single('file'), resumeController.uploadResume);

// Get active resume
resumeAnalysisRouter.get('/active', resumeController.getActiveResume);

// Get eligible published jobs for resume matching
resumeAnalysisRouter.get('/eligible-jobs', resumeController.getEligibleJobs);

// Latest analysis for active resume
resumeAnalysisRouter.get('/analyses/latest', resumeController.getLatestAnalysis);

// Compare two analyses
resumeAnalysisRouter.get('/analyses/compare', resumeController.compareAnalyses);

// All analyses across all versions
resumeAnalysisRouter.get('/analyses/all', resumeController.getAllStudentAnalyses);

// Specific analysis by ID
resumeAnalysisRouter.get('/analyses/:analysisId', resumeController.getAnalysisById);

// Trigger analysis for a resume
resumeAnalysisRouter.post('/:id/analyze', resumeController.analyzeResume);

// Trigger AI improvement for a resume
resumeAnalysisRouter.post('/:id/improve', improvementController.createImprovement);

// Get latest improvement draft for a resume
resumeAnalysisRouter.get('/:id/improvements/latest', improvementController.getLatestForResume);

// Get all analyses for a specific resume
resumeAnalysisRouter.get('/:id/analyses', resumeController.getAnalysesForResume);

// List all resume versions
resumeAnalysisRouter.get('/', resumeController.getStudentResumes);

// Get specific resume by ID
resumeAnalysisRouter.get('/:id', resumeController.getResumeById);

// Delete resume
resumeAnalysisRouter.delete('/:id', resumeController.deleteResume);

