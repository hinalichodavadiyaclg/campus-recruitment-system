import { apiRequest } from './api.js';

export const sessionService = {
  listSessions: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page);
    if (params.limit) searchParams.set('limit', params.limit);
    if (params.userId) searchParams.set('userId', params.userId);
    if (params.userType) searchParams.set('userType', params.userType);
    if (params.status) searchParams.set('status', params.status);
    if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
    if (params.dateTo) searchParams.set('dateTo', params.dateTo);
    const qs = searchParams.toString();
    return apiRequest(`/api/sessions${qs ? `?${qs}` : ''}`);
  }
};
