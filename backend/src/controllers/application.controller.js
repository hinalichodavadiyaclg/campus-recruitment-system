import * as applicationService from '../services/application.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

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
