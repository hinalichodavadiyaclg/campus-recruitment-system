import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/authenticate.js';

export const notificationRoutes = Router();

// All notification operations require authenticated session
notificationRoutes.use(authenticate);

// Get paginated notifications for the authenticated user
notificationRoutes.get('/', notificationController.list);

// Get live unread notification count
notificationRoutes.get('/unread-count', notificationController.getUnreadCount);

// Mark all notifications for the authenticated user as read
notificationRoutes.patch('/read-all', notificationController.markAllAsRead);

// Mark a single notification as read (with recipient ownership enforcement)
notificationRoutes.patch('/:id/read', notificationController.markAsRead);
