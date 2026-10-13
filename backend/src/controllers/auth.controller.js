import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const login = asyncHandler(async (request, response) => {
  const { email, password } = response.locals.input.body;
  const result = await authService.login({ email, password, ipAddress: request.ip, userAgent: request.get('user-agent') });
  return sendSuccess(response, 200, result);
});

export const logout = asyncHandler(async (request, response) => {
  await authService.logout(request.auth.sessionId);
  return sendSuccess(response, 200, { message: 'Logged out successfully.' });
});

export const me = asyncHandler(async (request, response) => {
  return sendSuccess(response, 200, await authService.getCurrentUser(request.auth.userId));
});

export const changePassword = asyncHandler(async (request, response) => {
  const { currentPassword, newPassword } = response.locals.input.body;
  await authService.changePassword({
    userId: request.auth.userId,
    currentSessionId: request.auth.sessionId,
    currentPassword,
    newPassword
  });
  return sendSuccess(response, 200, { message: 'Password changed successfully.' });
});

export const forgotPassword = asyncHandler(async (_request, response) => {
  const token = await authService.createPasswordResetToken(response.locals.input.body.email);
  const data = { message: 'If an active account matches this email, password reset instructions have been prepared.' };
  // A production deployment must deliver this token through a trusted mail provider; it is never logged.
  // Returning it outside production permits local integration testing without adding a fifth collection.
  if (!env.isProduction && token) data.resetToken = token;
  return sendSuccess(response, 200, data);
});

export const resetPassword = asyncHandler(async (_request, response) => {
  const { token, newPassword } = response.locals.input.body;
  await authService.resetPassword(token, newPassword);
  return sendSuccess(response, 200, { message: 'Password reset successfully. Please sign in again.' });
});
