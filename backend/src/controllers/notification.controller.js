import * as notificationService from '../services/notification.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const list = asyncHandler(async (request, response) => {
  const result = await notificationService.getUserNotifications({
    userId: request.auth.userId,
    page: request.query.page,
    limit: request.query.limit,
    unreadOnly: request.query.unreadOnly === 'true' || request.query.unreadOnly === true
  });
  return sendSuccess(response, 200, result);
});

export const getUnreadCount = asyncHandler(async (request, response) => {
  const result = await notificationService.getUnreadCount(request.auth.userId);
  return sendSuccess(response, 200, result);
});

export const markAsRead = asyncHandler(async (request, response) => {
  const result = await notificationService.markAsRead({
    userId: request.auth.userId,
    notificationId: request.params.id
  });
  return sendSuccess(response, 200, result);
});

export const markAllAsRead = asyncHandler(async (request, response) => {
  const result = await notificationService.markAllAsRead(request.auth.userId);
  return sendSuccess(response, 200, result);
});
