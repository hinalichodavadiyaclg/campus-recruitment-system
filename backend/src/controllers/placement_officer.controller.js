import * as placementOfficerService from '../services/placement_officer.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listPlacementOfficers = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await placementOfficerService.listPlacementOfficers(response.locals.input?.query || request.query || {}))
);

export const getPlacementOfficer = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await placementOfficerService.getPlacementOfficerById(response.locals.input?.params?.id || request.params.id))
);

export const createPlacementOfficer = asyncHandler(async (request, response) =>
  sendSuccess(response, 201, await placementOfficerService.createPlacementOfficer(response.locals.input?.body || request.body))
);

export const updatePlacementOfficer = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await placementOfficerService.updatePlacementOfficer(response.locals.input?.params?.id || request.params.id, response.locals.input?.body || request.body))
);

export const deletePlacementOfficer = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await placementOfficerService.deletePlacementOfficer(response.locals.input?.params?.id || request.params.id))
);

export const getMyProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await placementOfficerService.getPlacementOfficerByUserId(request.auth.userId))
);

export const updateMyProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await placementOfficerService.updateMyPlacementProfile(request.auth.userId, request.body))
);

