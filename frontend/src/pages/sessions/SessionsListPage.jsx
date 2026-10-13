import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext.jsx';
import { sessionService } from '../../services/session.service.js';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { Badge } from '../../components/common/Badge.jsx';

export function SessionsListPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [userType, setUserType] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');

  const loadSessions = async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (userType) params.userType = userType;
      if (status) params.status = status;
      if (dateFrom) params.dateFrom = dateFrom;
      const res = await sessionService.listSessions(params);
      setSessions(res.items || []);
    } catch (err) {
      toast(err.message || 'Failed to load session logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    loadSessions();
  };

  const formatDate = (value) =>
    value
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(value))
      : '—';

  return (
    <PortalLayout
      title="Login & Session Activity"
      subtitle="Review authentication logs and session activity."
      currentPath="/sessions"
    >
      <section>
        <form id="session-filters" className="filters" onSubmit={handleFilterSubmit}>
          <select
            id="session-type"
            value={userType}
            onChange={(e) => setUserType(e.target.value)}
          >
            <option value="">All user types</option>
            <option value="STUDENT">STUDENT</option>
            <option value="COMPANY">COMPANY</option>
            <option value="PLACEMENT">PLACEMENT</option>
          </select>
          <select
            id="session-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All session states</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="LOGGED_OUT">LOGGED_OUT</option>
          </select>
          <input
            id="session-from"
            type="date"
            aria-label="Login date from"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <button className="secondary" type="submit">
            Apply filters
          </button>
        </form>

        <article className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Login time</th>
                  <th>Last activity</th>
                  <th>Logout</th>
                  <th>IP / device</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="empty">
                      Loading activity…
                    </td>
                  </tr>
                ) : sessions.length > 0 ? (
                  sessions.map((s) => (
                    <tr key={s._id}>
                      <td>
                        {s.user ? (
                          <>
                            <a className="text-link" href={`#/users/${s.user._id}`}>
                              {s.user.email}
                            </a>
                            <br />
                            <span className="badge neutral">
                              {s.user.userType}
                            </span>
                          </>
                        ) : (
                          'Deleted user'
                        )}
                      </td>
                      <td>{formatDate(s.loginAt)}</td>
                      <td>{formatDate(s.lastActivityAt)}</td>
                      <td>{formatDate(s.logoutAt)}</td>
                      <td>
                        {s.ipAddress || '—'}
                        <br />
                        <small>{s.userAgent || '—'}</small>
                      </td>
                      <td>
                        <Badge status={s.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty">
                      No session activity matches the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </PortalLayout>
  );
}
