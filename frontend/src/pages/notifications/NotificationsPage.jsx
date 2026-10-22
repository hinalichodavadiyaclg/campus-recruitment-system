import React, { useState, useEffect, useCallback } from 'react';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { notificationService } from '../../services/notification.service.js';
import { formatTimeAgo, formatDateTime } from '../../utils/time-helpers.js';
import {
  BellIcon,
  BriefcaseIcon,
  DocumentIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon
} from '../../components/common/Icons.jsx';
import './Notifications.css';

export function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'UNREAD'
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationService.getNotifications({
        page,
        limit: 15,
        unreadOnly: activeTab === 'UNREAD'
      });
      const data = res?.data || res;
      if (data) {
        setNotifications(data.notifications || []);
        setTotal(data.pagination?.total || 0);
        setTotalPages(data.pagination?.totalPages || 1);
        if (data.unreadCount !== undefined) {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [page, activeTab]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleTabChange = (newTab) => {
    if (newTab !== activeTab) {
      setActiveTab(newTab);
      setPage(1);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllAsRead();
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      if (activeTab === 'UNREAD') {
        fetchNotifications();
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkSingleRead = async (id, e) => {
    e.stopPropagation();
    try {
      await notificationService.markAsRead(id);
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        )
      );
      if (activeTab === 'UNREAD') {
        fetchNotifications();
      }
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleActionClick = (notif) => {
    if (!notif.isRead) {
      notificationService.markAsRead(notif._id).catch(() => {});
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (notif.actionUrl) {
      window.location.hash = notif.actionUrl.startsWith('#')
        ? notif.actionUrl
        : `#${notif.actionUrl}`;
    }
  };

  const getTypeBadgeClass = (type) => {
    switch (type) {
      case 'JOB_PUBLISHED':
      case 'JOB_REOPENED':
        return 'notif-badge-job';
      case 'APPLICATION_RECEIVED':
        return 'notif-badge-app';
      case 'APPLICATION_STATUS_CHANGED':
        return 'notif-badge-warning';
      case 'JOB_SUSPENDED':
        return 'notif-badge-danger';
      default:
        return 'notif-badge-default';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'JOB_PUBLISHED':
      case 'JOB_REOPENED':
        return (
          <div className="notif-card-icon notif-icon-job">
            <BriefcaseIcon size={20} />
          </div>
        );
      case 'APPLICATION_RECEIVED':
        return (
          <div className="notif-card-icon notif-icon-app">
            <DocumentIcon size={20} />
          </div>
        );
      case 'APPLICATION_STATUS_CHANGED':
        return (
          <div className="notif-card-icon notif-icon-warning">
            <CheckCircleIcon size={20} />
          </div>
        );
      case 'JOB_SUSPENDED':
        return (
          <div className="notif-card-icon notif-icon-danger">
            <AlertCircleIcon size={20} />
          </div>
        );
      default:
        return (
          <div className="notif-card-icon notif-icon-default">
            <BellIcon size={20} />
          </div>
        );
    }
  };

  const formatTypeLabel = (type) => {
    return (type || 'SYSTEM').replace(/_/g, ' ');
  };

  return (
    <PortalLayout
      title="Notifications"
      subtitle="Stay informed on new job openings, recruitment rounds, and application milestones."
      currentPath="/notifications"
      section="System"
    >
      <div className="notif-page-container">
        {/* Toolbar & Filter Tabs */}
        <div className="notif-toolbar-card">
          <div className="notif-tabs-group" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ALL'}
              className={`notif-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
              onClick={() => handleTabChange('ALL')}
            >
              <span>All Notifications</span>
              {activeTab === 'ALL' && <span className="notif-tab-count">{total}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'UNREAD'}
              className={`notif-tab-btn ${activeTab === 'UNREAD' ? 'active' : ''}`}
              onClick={() => handleTabChange('UNREAD')}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="notif-tab-count unread-pill">{unreadCount}</span>
              )}
            </button>
          </div>

          <div className="notif-toolbar-actions">
            <button
              type="button"
              className="notif-action-btn"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || markingAll}
              title="Mark all notifications as read"
            >
              <CheckIcon size={15} />
              <span>{markingAll ? 'Marking read...' : 'Mark all as read'}</span>
            </button>
            <button
              type="button"
              className="notif-action-btn"
              onClick={fetchNotifications}
              disabled={loading}
              title="Refresh notifications"
            >
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="notif-list-card">
          {loading ? (
            <div className="notif-page-empty">
              <div className="notif-page-empty-icon">
                <BellIcon size={28} />
              </div>
              <h3>Loading notifications...</h3>
              <p>Retrieving your recruitment activity and alerts.</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notif-page-empty">
              <div className="notif-page-empty-icon">
                <CheckCircleIcon size={32} color="#10b981" />
              </div>
              <h3>
                {activeTab === 'UNREAD'
                  ? 'No unread notifications'
                  : 'No notifications found'}
              </h3>
              <p>
                {activeTab === 'UNREAD'
                  ? "You're completely up to date! Check back later for new alerts."
                  : 'When relevant job updates or application status changes occur, they will appear here.'}
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif._id}
                className={`notif-card-item ${!notif.isRead ? 'unread' : ''}`}
              >
                {getTypeIcon(notif.type)}

                <div className="notif-card-main">
                  <div className="notif-card-meta-row">
                    <span className={`notif-badge-pill ${getTypeBadgeClass(notif.type)}`}>
                      {formatTypeLabel(notif.type)}
                    </span>
                    {!notif.isRead && <span className="notif-unread-dot" title="Unread" />}
                    <span className="notif-card-time" title={formatDateTime(notif.createdAt)}>
                      {formatTimeAgo(notif.createdAt)}
                    </span>
                  </div>

                  <h4 className="notif-card-title">{notif.title}</h4>
                  <p className="notif-card-message">{notif.message}</p>

                  <div className="notif-card-actions">
                    {notif.actionUrl && (
                      <button
                        type="button"
                        className="notif-link-btn"
                        onClick={() => handleActionClick(notif)}
                      >
                        <span>View details</span>
                        <ChevronRightIcon size={14} />
                      </button>
                    )}

                    {!notif.isRead && (
                      <button
                        type="button"
                        className="notif-secondary-btn"
                        onClick={(e) => handleMarkSingleRead(notif._id, e)}
                        title="Mark this notification as read"
                      >
                        <CheckIcon size={13} />
                        <span>Mark as read</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="notif-pagination-bar">
            <span>
              Page {page} of {totalPages} ({total} total alerts)
            </span>
            <div className="notif-pagination-nav">
              <button
                type="button"
                className="notif-page-num-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                &larr;
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .map((p, idx, arr) => (
                  <React.Fragment key={p}>
                    {idx > 0 && p - arr[idx - 1] > 1 && <span>…</span>}
                    <button
                      type="button"
                      className={`notif-page-num-btn ${p === page ? 'active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  </React.Fragment>
                ))}
              <button
                type="button"
                className="notif-page-num-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
