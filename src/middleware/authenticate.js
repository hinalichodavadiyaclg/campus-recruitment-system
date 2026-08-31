import { authenticateSession } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';
import { asyncHandler } from '../utils/async-handler.js';

function extractBearerToken(request) {
  const authorization = request.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return token;
}

export const authenticate = asyncHandler(async (request, _response, next) => {
  request.auth = await authenticateSession(extractBearerToken(request));
  next();
});
