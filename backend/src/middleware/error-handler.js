import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

export function notFoundHandler(request, _response, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${request.method} ${request.originalUrl} was not found.`));
}

export function errorHandler(error, _request, response, _next) {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {})
      }
    });
  }
  if (error?.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return response.status(400).json({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds maximum allowed limit (5MB).' }
      });
    }
    return response.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: error.message }
    });
  }
  if (error?.name === 'ValidationError') {
    return response.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'One or more request fields are invalid.' }
    });
  }
  if (error?.code === 11000) {
    return response.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_VALUE', message: 'A record with this value already exists.' }
    });
  }
  // Unexpected errors are intentionally not serialized because they can reveal sensitive internals.
  console.error('Unhandled application error', error);
  return response.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }
  });
}
