import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import * as improvementService from '../services/resume-improvement.service.js';

export const createImprovement = asyncHandler(async (req, res) => {
  const result = await improvementService.createResumeImprovement(req.params.id, req.auth);
  return sendSuccess(res, 201, result);
});

export const getLatestForResume = asyncHandler(async (req, res) => {
  const result = await improvementService.getLatestImprovementForResume(req.params.id, req.auth);
  return sendSuccess(res, 200, result);
});

export const getImprovementById = asyncHandler(async (req, res) => {
  const result = await improvementService.getImprovementById(req.params.id, req.auth);
  return sendSuccess(res, 200, result);
});

export const updateSectionDecision = asyncHandler(async (req, res) => {
  const result = await improvementService.updateSectionDecision(
    req.params.id,
    req.params.sectionKey,
    req.body,
    req.auth
  );
  return sendSuccess(res, 200, result);
});

export const answerQuestion = asyncHandler(async (req, res) => {
  const result = await improvementService.answerMissingInfoQuestion(
    req.params.id,
    req.params.questionId,
    req.body?.answer || '',
    req.auth
  );
  return sendSuccess(res, 200, result);
});

export const generateResume = asyncHandler(async (req, res) => {
  const result = await improvementService.generateApprovedResume(req.params.id, req.auth);
  return sendSuccess(res, 200, result);
});

export const getImprovementHistory = asyncHandler(async (req, res) => {
  const result = await improvementService.getImprovementHistory(req.auth);
  return sendSuccess(res, 200, result);
});

