import React, { useState, useEffect, useRef } from 'react';
import { notificationService } from '../../services/notification.service.js';
import { formatTimeAgo } from '../../utils/time-helpers.js';
import {
  BellIcon,
  BriefcaseIcon,
  DocumentIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon
} from '../common/Icons.jsx';
import './NotificationDropdown.css';

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Poll for unread count every 30 seconds
  const fetchUnreadCount = async () => {
    try {
      const res = await notificationService.getUnreadCount();
      const data = res?.data || res;
      if (data?.unreadCount !== undefined) {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      // Quiet fail on polling error
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recent notifications when dropdown opens
  const fetchRecentNotifications = async () => {
    setLoading(true);
    try {
      const res = await notificationService.getNotifications({ page: 1, limit: 6 });
      const data = res?.data || res;
      if (data?.notifications) {
        setNotifications(data.notifications);
        if (data.unreadCount !== undefined) {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.error('Failed to load recent notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      fetchRecentNotifications();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.isRead) {
      try {
        await notificationService.markAsRead(notif._id);
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === notif._id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
          )
        );
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    setIsOpen(false);

    if (notif.actionUrl) {
      window.location.hash = notif.actionUrl.startsWith('#')
        ? notif.actionUrl
        : `#${notif.actionUrl}`;
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'JOB_PUBLISHED':
      case 'JOB_REOPENED':
        return (
          <div className="notif-icon-badge notif-icon-job">
            <BriefcaseIcon size={16} />
          </div>
        );
      case 'APPLICATION_RECEIVED':
        return (
          <div className="notif-icon-badge notif-icon-app">
            <DocumentIcon size={16} />
          </div>
        );
      case 'APPLICATION_STATUS_CHANGED':
        return (
          <div className="notif-icon-badge notif-icon-warning">
            <CheckCircleIcon size={16} />
          </div>
        );
      case 'JOB_SUSPENDED':
        return (
          <div className="notif-icon-badge notif-icon-danger">
            <AlertCircleIcon size={16} />
          </div>
        );
      default:
        return (
          <div className="notif-icon-badge notif-icon-default">
            <BellIcon size={16} />
          </div>
        );
    }
  };

  return (
    <div className="notification-dropdown-wrapper" ref={dropdownRef}>
      <button
        className={`notification-bell-btn ${isOpen ? 'active' : ''}`}
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={handleToggle}
      >
        <BellIcon size={19} color="#475569" />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown-menu" role="menu">
          <div className="notif-dropdown-header">
            <div className="notif-header-title-wrap">
              <span className="notif-header-title">Notifications</span>
              {unreadCount > 0 && (
                <span className="notif-unread-pill">{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={handleMarkAllAsRead}
                title="Mark all notifications as read"
              >
                <CheckIcon size={13} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="notif-dropdown-body">
            {loading ? (
              <div className="notif-loading-state">
                <ClockIcon size={24} color="#94a3b8" />
                <span style={{ fontSize: 13, color: '#64748b' }}>Loading updates...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty-state">
                <div className="notif-empty-icon">
                  <BellIcon size={22} color="#94a3b8" />
                </div>
                <strong className="notif-empty-title">All caught up!</strong>
                <span className="notif-empty-subtitle">
                  No new notifications right now.
                </span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`notif-item ${!notif.isRead ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNotificationClick(notif);
                    }
                  }}
                >
                  {getNotificationIcon(notif.type)}
                  <div className="notif-content">
                    <div className="notif-title-row">
                      <span className="notif-title">{notif.title}</span>
                      <span className="notif-time">{formatTimeAgo(notif.createdAt)}</span>
                    </div>
                    <p className="notif-message">{notif.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="notif-dropdown-footer">
            <a
              href="#/notifications"
              className="notif-view-all-link"
              onClick={() => setIsOpen(false)}
            >
              View all notifications &rarr;
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
