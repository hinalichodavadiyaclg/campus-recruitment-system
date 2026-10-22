import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as applicationService from '../services/application.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const submit = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    201,
    await applicationService.submitApplication({
      auth: request.auth,
      body: response.locals.input?.body || request.body
    })
  )
);

export const uploadJobResume = asyncHandler(async (request, response) => {
  if (!request.file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Please select a valid PDF resume file to upload.');
  }
  const fileUrl = `/uploads/resumes/${request.file.filename}`;
  sendSuccess(response, 201, {
    url: fileUrl,
    fileName: request.file.originalname,
    fileSize: request.file.size,
    source: 'JOB_SPECIFIC'
  });
});

export const list = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await applicationService.listApplications({
      auth: request.auth,
      query: response.locals.input?.query || request.query || {}
    })
  )
);

export const getById = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await applicationService.getApplicationById({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id
    })
  )
);

export const getResume = asyncHandler(async (request, response) => {
  const resumeInfo = await applicationService.getApplicationResumeFile({
    auth: request.auth,
    id: response.locals.input?.params?.id || request.params.id
  });
  const filePath = path.join(__dirname, '..', '..', 'public', resumeInfo.url.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${resumeInfo.fileName}"`);
    return response.sendFile(filePath);
  }
  return response.redirect(resumeInfo.url);
});

export const updateStatus = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await applicationService.updateApplicationStatus({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id,
      status: response.locals.input?.body?.status || request.body.status,
      note: response.locals.input?.body?.note || request.body.note,
      reviewerNotes: response.locals.input?.body?.reviewerNotes || request.body.reviewerNotes
    })
  )
);

export const withdraw = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await applicationService.withdrawApplication({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id,
      reason: response.locals.input?.body?.reason || request.body.reason
    })
  )
);
