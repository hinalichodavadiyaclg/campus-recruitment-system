import { apiRequest } from './api.js';

export const notificationService = {
  /**
   * Get paginated notifications for current user
   * @param {Object} params - { page, limit, unreadOnly }
   */
  getNotifications: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.unreadOnly !== undefined && params.unreadOnly !== null) {
      searchParams.set('unreadOnly', String(params.unreadOnly));
    }
    const qs = searchParams.toString();
    return apiRequest(`/api/notifications${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get fast unread count for header badge
   */
  getUnreadCount: () => apiRequest('/api/notifications/unread-count'),

  /**
   * Mark a single notification as read
   * @param {string} id - Notification _id
   */
  markAsRead: (id) =>
    apiRequest(`/api/notifications/${id}/read`, {
      method: 'PATCH'
    }),

  /**
   * Mark all notifications as read for current user
   */
  markAllAsRead: () =>
    apiRequest('/api/notifications/read-all', {
      method: 'PATCH'
    })
};
