import * as jobService from '../services/job.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const create = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    201,
    await jobService.createJob({
      auth: request.auth,
      body: response.locals.input?.body || request.body
    })
  )
);

export const list = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await jobService.listJobs({
      auth: request.auth,
      query: response.locals.input?.query || request.query || {}
    })
  )
);

export const getById = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await jobService.getJobById({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id
    })
  )
);

export const update = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await jobService.updateJob({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id,
      body: response.locals.input?.body || request.body
    })
  )
);

export const updateStatus = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await jobService.updateJobStatus({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id,
      status: response.locals.input?.body?.status || request.body.status,
      note: response.locals.input?.body?.note || request.body.note
    })
  )
);

export const reopen = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await jobService.reopenJob({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id,
      newDeadline: response.locals.input?.body?.newDeadline || request.body.newDeadline,
      vacancies: response.locals.input?.body?.vacancies || request.body.vacancies,
      note: response.locals.input?.body?.note || request.body.note
    })
  )
);

export const suspend = asyncHandler(async (request, response) =>
  sendSuccess(
    response,
    200,
    await jobService.suspendJob({
      auth: request.auth,
      id: response.locals.input?.params?.id || request.params.id,
      isSuspended: response.locals.input?.body?.isSuspended ?? request.body.isSuspended,
      suspensionReason: response.locals.input?.body?.suspensionReason || request.body.suspensionReason
    })
  )
);
