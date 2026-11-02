import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeAnyPermission } from '../middleware/authorize.js';
import { PERMISSION_IDS } from '../utils/access-constants.js';
import * as controller from '../controllers/resume-improvement.controller.js';

export const resumeImprovementRouter = Router();

// Student authenticated permission guard
resumeImprovementRouter.use(
  authenticate,
  authorizeAnyPermission(
    PERMISSION_IDS.STUDENT_PROFILE_UPDATE,
    PERMISSION_IDS.AUTH_READ_SELF
  )
);

// History
resumeImprovementRouter.get('/history', controller.getImprovementHistory);

// Specific improvement record by ID
resumeImprovementRouter.get('/:id', controller.getImprovementById);

// Update section decision (Accept / Reject / Edit)
resumeImprovementRouter.patch('/:id/sections/:sectionKey', controller.updateSectionDecision);

// Answer missing info question
resumeImprovementRouter.post('/:id/questions/:questionId', controller.answerQuestion);

// Generate final PDF & DOCX
resumeImprovementRouter.post('/:id/generate', controller.generateResume);

