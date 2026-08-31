import { listSessions } from '../services/session.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listSessionActivity = asyncHandler(async (_request, response) =>
  sendSuccess(response, 200, await listSessions(response.locals.input.query))
);
