import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/response.js';
import * as resumeService from '../services/resume-analysis.service.js';

export const uploadResume = asyncHandler(async (req, res) => {
  const result = await resumeService.uploadResume({
    file: req.file,
    auth: req.auth
  });
  return sendSuccess(res, 201, result);
});

export const getActiveResume = asyncHandler(async (req, res) => {
  const result = await resumeService.getActiveResume(req.auth);
  return sendSuccess(res, 200, result);
});

export const getStudentResumes = asyncHandler(async (req, res) => {
  const result = await resumeService.getStudentResumes(req.auth);
  return sendSuccess(res, 200, result);
});

export const getResumeById = asyncHandler(async (req, res) => {
  const result = await resumeService.getResumeById(req.params.id, req.auth);
  return sendSuccess(res, 200, result);
});

export const deleteResume = asyncHandler(async (req, res) => {
  const result = await resumeService.deleteResume(req.params.id, req.auth);
  return sendSuccess(res, 200, result);
});

export const analyzeResume = asyncHandler(async (req, res) => {
  const result = await resumeService.analyzeResumeById(
    {
      resumeId: req.params.id,
      jobId: req.body?.jobId || null
    },
    req.auth
  );
  return sendSuccess(res, 200, result);
});

export const getLatestAnalysis = asyncHandler(async (req, res) => {
  const result = await resumeService.getLatestAnalysis(req.auth);
  return sendSuccess(res, 200, result);
});

export const getAnalysesForResume = asyncHandler(async (req, res) => {
  const result = await resumeService.getAnalysesForResume(req.params.id, req.auth);
  return sendSuccess(res, 200, result);
});

export const getAllStudentAnalyses = asyncHandler(async (req, res) => {
  const result = await resumeService.getAllStudentAnalyses(req.auth);
  return sendSuccess(res, 200, result);
});

export const getAnalysisById = asyncHandler(async (req, res) => {
  const result = await resumeService.getAnalysisById(req.params.analysisId, req.auth);
  return sendSuccess(res, 200, result);
});

export const compareAnalyses = asyncHandler(async (req, res) => {
  const { id1, id2 } = req.query;
  const result = await resumeService.compareAnalyses({ id1, id2 }, req.auth);
  return sendSuccess(res, 200, result);
});

export const getEligibleJobs = asyncHandler(async (req, res) => {
  const result = await resumeService.getEligibleJobsForStudent(req.auth);
  return sendSuccess(res, 200, result);
});
