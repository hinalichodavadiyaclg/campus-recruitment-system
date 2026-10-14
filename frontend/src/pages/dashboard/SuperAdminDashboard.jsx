import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { studentService } from '../../services/student.service.js';
import { companyService } from '../../services/company.service.js';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { sessionService } from '../../services/session.service.js';
import {
  GraduationCapIcon,
  BuildingIcon,
  BriefcaseIcon,
  DocumentIcon,
  CalendarIcon,
  TargetIcon,
  UserPlusIcon,
  ImportIcon,
  UsersIcon,
  ShieldIcon,
  KeyIcon,
  BookIcon,
  LockIcon
} from '../../components/common/Icons.jsx';

function formatTimeAgo(date) {
  if (!date || isNaN(date.getTime())) return 'Recently';
  const sec = Math.floor((new Date() - date) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min > 1 ? 's' : ''} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export function SuperAdminDashboard() {
  const { user, role, has } = useAuth();

  const [stats, setStats] = useState({
    students: 0,
    companies: 0,
    jobs: 0,
    applications: 0,
    interviews: 0,
    placed: 0
  });

  const [activities, setActivities] = useState([]);
  const [interviews] = useState([]);

  const [dateRange, setDateRange] = useState('Oct 1, 2025 - Oct 31, 2025');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [chartTimeframe, setChartTimeframe] = useState('Last 6 Months');
  const [hoveredMonthIndex, setHoveredMonthIndex] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      const updates = {
        students: 0,
        companies: 0,
        jobs: 0,
        applications: 0,
        interviews: 0,
        placed: 0
      };

      try {
        if (has('STUDENT_READ') || has('STUDENT_IMPORT')) {
          const res = await studentService.listStudents({ limit: 1 });
          if (res?.total !== undefined) updates.students = res.total;
        }
      } catch {}

      try {
        if (has('COMPANY_READ') || has('COMPANY_IMPORT')) {
          const res = await companyService.listCompanies({ limit: 1 });
          if (res?.total !== undefined) updates.companies = res.total;
        }
      } catch {}

      try {
        if (has('PLACEMENT_USER_READ') || has('PLACEMENT_USER_IMPORT')) {
          const res = await placementOfficerService.listPlacementOfficers({ limit: 1 });
          if (res?.total !== undefined) updates.interviews = res.total > 0 ? res.total : 0;
        }
      } catch {}

      if (mounted) {
        setStats(updates);
      }

      // Load real sessions for recent activity if authorized
      try {
        if (has('SESSION_READ')) {
          const res = await sessionService.listSessions({ limit: 5 });
          if (mounted) {
            if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
              setActivities(
                res.data.map((s) => ({
                  id: s._id || s.id,
                  title: `${s.userEmail || 'User'} session active`,
                  desc: s.ipAddress ? `IP: ${s.ipAddress}` : 'User signed in',
                  time: s.createdAt ? formatTimeAgo(new Date(s.createdAt)) : 'Recently',
                  tag: 'Security',
                  icon: <LockIcon size={18} color="#2563eb" />,
                  bg: '#eff6ff',
                  color: '#2563eb'
                }))
              );
            } else {
              setActivities([]);
            }
          }
        } else if (mounted) {
          setActivities([]);
        }
      } catch {
        if (mounted) {
          setActivities([]);
        }
      }
    }

    loadStats();
    return () => {
      mounted = false;
    };
  }, [has]);

  const roleId = role?.id || user?.roleId;
  const isSuperAdmin = roleId === 'ROLE_SUPER_ADMIN';
  const isPlacementHead = roleId === 'ROLE_PLACEMENT_HEAD';

  const dashboardTitle = isSuperAdmin
    ? 'Dashboard'
    : isPlacementHead
    ? 'Placement Operations Dashboard'
    : 'Placement Cell Dashboard';

  const displayName =
    user?.name || (role?.name === 'ADMINISTRATOR' ? 'Admin' : user?.email?.split('@')[0] || 'Admin');

  const subtitle = isSuperAdmin
    ? `Welcome back, ${displayName}! Here is the overview of your Campus Recruitment Portal.`
    : `Welcome back, ${displayName}! Here is the placement administration and coordination overview.`;

  // Chart dataset: If no real data, do not fabricate fake curves
  const chartMonths = ['Apr 2025', 'May 2025', 'Jun 2025', 'Jul 2025', 'Aug 2025', 'Sep 2025'];
  const hasChartData = stats.applications > 0 || stats.interviews > 0 || stats.placed > 0;

  const chartSeries = {
    applications: hasChartData ? [0, 0, 0, 0, 0, stats.applications] : [0, 0, 0, 0, 0, 0],
    interviews: hasChartData ? [0, 0, 0, 0, 0, stats.interviews] : [0, 0, 0, 0, 0, 0],
    placements: hasChartData ? [0, 0, 0, 0, 0, stats.placed] : [0, 0, 0, 0, 0, 0]
  };

  // Convert array of values to SVG coordinates
  const svgWidth = 600;
  const svgHeight = 220;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const maxY = 50;

  const getCoordinates = (values) => {
    return values.map((val, idx) => {
      const x = padLeft + (idx / (values.length - 1)) * plotWidth;
      const y = padTop + plotHeight - (val / maxY) * plotHeight;
      return { x, y, val };
    });
  };

  const createSmoothPath = (points) => {
    if (!points.length) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const createAreaPath = (points) => {
    if (!points.length) return '';
    const linePath = createSmoothPath(points);
    const bottomY = padTop + plotHeight;
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];
    return `${linePath} L ${lastPoint.x},${bottomY} L ${firstPoint.x},${bottomY} Z`;
  };

  const appCoords = getCoordinates(chartSeries.applications);
  const intCoords = getCoordinates(chartSeries.interviews);
  const plaCoords = getCoordinates(chartSeries.placements);

  // Application Status breakdown
  const appStatus = [
    { label: 'Applied', count: 0, pct: '0%', color: '#3b82f6' },
    { label: 'Under Review', count: 0, pct: '0%', color: '#eab308' },
    { label: 'Shortlisted', count: 0, pct: '0%', color: '#22c55e' },
    { label: 'Rejected', count: 0, pct: '0%', color: '#ef4444' },
    { label: 'Withdrawn', count: 0, pct: '0%', color: '#6366f1' }
  ];

  // Quick actions filtered by RBAC permissions
  const availableQuickActions = [
    {
      icon: <UserPlusIcon size={20} color="#0284c7" />,
      label: 'Add Student',
      link: '#/students',
      bg: '#e0f2fe',
      color: '#0284c7',
      show: has('USER_CREATE') || has('STUDENT_CREATE')
    },
    {
      icon: <BuildingIcon size={20} color="#16a34a" />,
      label: 'Add Company',
      link: '#/companies',
      bg: '#dcfce7',
      color: '#16a34a',
      show: has('USER_CREATE') || has('COMPANY_CREATE')
    },
    {
      icon: <ImportIcon size={20} color="#7c3aed" />,
      label: 'Import Students',
      link: '#/import/student',
      bg: '#ede9fe',
      color: '#7c3aed',
      show: has('STUDENT_IMPORT')
    },
    {
      icon: <ImportIcon size={20} color="#d97706" />,
      label: 'Import Companies',
      link: '#/import/company',
      bg: '#fef3c7',
      color: '#d97706',
      show: has('COMPANY_IMPORT')
    },
    {
      icon: <UsersIcon size={20} color="#db2777" />,
      label: 'Manage Officers',
      link: '#/placement-officers',
      bg: '#fce7f3',
      color: '#db2777',
      show: has('USER_READ') || has('PLACEMENT_USER_READ') || has('PLACEMENT_USER_IMPORT')
    },
    {
      icon: <ShieldIcon size={20} color="#475569" />,
      label: 'Manage Roles',
      link: '#/roles',
      bg: '#f1f5f9',
      color: '#475569',
      show: has('ROLE_READ')
    },
    {
      icon: <KeyIcon size={20} color="#334155" />,
      label: 'Permissions',
      link: '#/permissions',
      bg: '#e2e8f0',
      color: '#334155',
      show: has('PERMISSION_READ')
    },
    {
      icon: <BookIcon size={20} color="#0d9488" />,
      label: 'Courses',
      link: '#/courses',
      bg: '#ccfbf1',
      color: '#0d9488',
      show: has('COURSE_READ')
    }
  ].filter((a) => a.show);

  return (
    <PortalLayout
      title={dashboardTitle}
      subtitle={subtitle}
      currentPath="/dashboard"
      hideEyebrow={true}
      actions={
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            id="btn-date-range"
            onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.85rem',
              fontWeight: 500,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              cursor: 'pointer'
            }}
          >
            <span>📅</span>
            <span>{dateRange}</span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>⌄</span>
          </button>
          {dateDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                zIndex: 50,
                minWidth: '220px',
                overflow: 'hidden'
              }}
            >
              {[
                'Oct 1, 2025 - Oct 31, 2025',
                'Last 30 Days',
                'Last 6 Months',
                'This Academic Year'
              ].map((opt) => (
                <div
                  key={opt}
                  onClick={() => {
                    setDateRange(opt);
                    setDateDropdownOpen(false);
                  }}
                  style={{
                    padding: '9px 14px',
                    fontSize: '0.84rem',
                    color: opt === dateRange ? '#2563eb' : '#334155',
                    background: opt === dateRange ? '#eff6ff' : '#ffffff',
                    fontWeight: opt === dateRange ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'background 0.1s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = opt === dateRange ? '#eff6ff' : '#ffffff')
                  }
                >
                  {opt}
                </div>
              ))}
            </div>
          )}
        </div>
      }
    >
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* TOP ROW: 6 Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
          }}
        >
          {/* Card 1: Total Students */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <GraduationCapIcon size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '2px' }}>
                  Total Students
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.students}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
              — No change
            </div>
          </div>

          {/* Card 2: Registered Companies */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#22c55e',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <BuildingIcon size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '2px' }}>
                  Registered Companies
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.companies}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
              — No change
            </div>
          </div>

          {/* Card 3: Active Jobs */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#f97316',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <BriefcaseIcon size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '2px' }}>
                  Active Jobs
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.jobs}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
              — No change
            </div>
          </div>

          {/* Card 4: Total Applications */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#a855f7',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <DocumentIcon size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '2px' }}>
                  Total Applications
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.applications}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
              — No change
            </div>
          </div>

          {/* Card 5: Placement Officers / Interviews */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#ec4899',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <CalendarIcon size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '2px' }}>
                  Scheduled Interviews
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.interviews}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
              — No change
            </div>
          </div>

          {/* Card 6: Students Placed */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 18px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#06b6d4',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <TargetIcon size={22} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '2px' }}>
                  Students Placed
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.placed}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
              — No change
            </div>
          </div>
        </div>

        {/* MIDDLE ROW: 2 Charts (Recruitment Overview & Application Status) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1fr)',
            gap: '20px',
            marginBottom: '20px'
          }}
        >
          {/* Left Chart: Recruitment Overview */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>
                    Recruitment Overview
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Applications, Interviews and Placements over time
                  </p>
                </div>
                <select
                  value={chartTimeframe}
                  onChange={(e) => setChartTimeframe(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  <option value="Last 6 Months">Last 6 Months</option>
                  <option value="Last 30 Days">Last 30 Days</option>
                  <option value="This Year">This Year</option>
                </select>
              </div>

              {/* Chart Legend */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} />
                  <span>Applications</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316' }} />
                  <span>Interviews</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                  <span>Placements</span>
                </div>
              </div>

              {/* Interactive SVG Chart */}
              <div style={{ position: 'relative', width: '100%', height: '220px' }}>
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  style={{ width: '100%', height: '100%', overflow: 'visible' }}
                >
                  <defs>
                    <linearGradient id="gradApps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="gradInts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="gradPlac" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines & Y Labels */}
                  {[0, 10, 20, 30, 40, 50].map((val) => {
                    const y = padTop + plotHeight - (val / maxY) * plotHeight;
                    return (
                      <g key={val}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={svgWidth - padRight}
                          y2={y}
                          stroke="#f1f5f9"
                          strokeWidth="1.2"
                        />
                        <text
                          x={padLeft - 10}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="11"
                          fill="#94a3b8"
                          fontWeight="500"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* X Labels */}
                  {chartMonths.map((m, idx) => {
                    const x = padLeft + (idx / (chartMonths.length - 1)) * plotWidth;
                    return (
                      <text
                        key={m}
                        x={x}
                        y={svgHeight - 8}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#94a3b8"
                        fontWeight="500"
                      >
                        {m}
                      </text>
                    );
                  })}

                  {/* Area Fills */}
                  {hasChartData && (
                    <>
                      <path d={createAreaPath(appCoords)} fill="url(#gradApps)" />
                      <path d={createAreaPath(intCoords)} fill="url(#gradInts)" />
                      <path d={createAreaPath(plaCoords)} fill="url(#gradPlac)" />
                    </>
                  )}

                  {/* Lines */}
                  <path
                    d={createSmoothPath(appCoords)}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d={createSmoothPath(intCoords)}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d={createSmoothPath(plaCoords)}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  {/* Data Points */}
                  {hasChartData && (
                    <>
                      {appCoords.map((pt, idx) => (
                        <circle
                          key={`app-${idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredMonthIndex === idx ? 5.5 : 4}
                          fill="#ffffff"
                          stroke="#3b82f6"
                          strokeWidth={hoveredMonthIndex === idx ? 3 : 2}
                          style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                          onMouseEnter={() => setHoveredMonthIndex(idx)}
                          onMouseLeave={() => setHoveredMonthIndex(null)}
                        />
                      ))}
                      {intCoords.map((pt, idx) => (
                        <circle
                          key={`int-${idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredMonthIndex === idx ? 5.5 : 4}
                          fill="#ffffff"
                          stroke="#f97316"
                          strokeWidth={hoveredMonthIndex === idx ? 3 : 2}
                          style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                          onMouseEnter={() => setHoveredMonthIndex(idx)}
                          onMouseLeave={() => setHoveredMonthIndex(null)}
                        />
                      ))}
                      {plaCoords.map((pt, idx) => (
                        <circle
                          key={`pla-${idx}`}
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredMonthIndex === idx ? 5.5 : 4}
                          fill="#ffffff"
                          stroke="#22c55e"
                          strokeWidth={hoveredMonthIndex === idx ? 3 : 2}
                          style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                          onMouseEnter={() => setHoveredMonthIndex(idx)}
                          onMouseLeave={() => setHoveredMonthIndex(null)}
                        />
                      ))}
                    </>
                  )}
                </svg>

                {/* If no data, show gentle empty indicator */}
                {!hasChartData && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '45%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      color: '#94a3b8',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      pointerEvents: 'none'
                    }}
                  >
                    No recruitment data for this timeframe
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Donut: Application Status */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>
                Application Status
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                Distribution of applications by status
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flex: 1
              }}
            >
              {/* Donut Chart */}
              <div style={{ position: 'relative', width: '160px', height: '160px', flexShrink: 0 }}>
                <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle
                    cx="80"
                    cy="80"
                    r="56"
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="20"
                  />
                  {stats.applications > 0 && (
                    <circle
                      cx="80"
                      cy="80"
                      r="56"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="20"
                      strokeDasharray="352 352"
                      strokeDashoffset="0"
                    />
                  )}
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none'
                  }}
                >
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                    {stats.applications}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>
                    Total<br />Applications
                  </div>
                </div>
              </div>

              {/* Status Legend List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                {appStatus.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: item.color,
                          flexShrink: 0
                        }}
                      />
                      <span style={{ color: '#475569', fontWeight: 500 }}>{item.label}</span>
                    </div>
                    <span style={{ color: '#0f172a', fontWeight: 600 }}>
                      {item.count} ({item.pct})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: 3 Cards (Recent Activity, Upcoming Interviews, Quick Actions) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1.15fr) minmax(290px, 0.9fr)',
            gap: '20px'
          }}
        >
          {/* Card 1: Recent Activity */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>
                  Recent Activity
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                  {has('SESSION_READ') ? 'Latest authentication activity' : 'System updates & actions'}
                </p>
              </div>
              {has('SESSION_READ') && (
                <a
                  href="#/sessions"
                  style={{
                    color: '#2563eb',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                >
                  View All →
                </a>
              )}
            </div>

            {activities.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {activities.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: item.bg,
                          color: item.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.1rem',
                          flexShrink: 0
                        }}
                      >
                        {item.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0f172a' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {item.desc}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '3px' }}>
                        {item.time}
                      </div>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: item.bg,
                          color: item.color
                        }}
                      >
                        {item.tag}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '48px 16px',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: '0.88rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <DocumentIcon size={32} color="#94a3b8" />
                <div>No recent activity to display</div>
              </div>
            )}
          </div>

          {/* Card 2: Upcoming Interviews */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>
                  Upcoming Interviews
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                  Next scheduled recruitment interviews
                </p>
              </div>
              {has('USER_READ') && (
                <a
                  href="#/placement-officers"
                  style={{
                    color: '#2563eb',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                >
                  View All →
                </a>
              )}
            </div>

            <div
              style={{
                padding: '48px 16px',
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.88rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <CalendarIcon size={32} color="#94a3b8" />
              <div>No upcoming interviews scheduled</div>
            </div>
          </div>

          {/* Card 3: Quick Actions */}
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ marginBottom: '18px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '1.08rem', fontWeight: 700, color: '#0f172a' }}>
                Quick Actions
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                Frequently used operations
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {availableQuickActions.map((action, idx) => (
                <a
                  key={idx}
                  href={action.link}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px 8px',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    textDecoration: 'none',
                    textAlign: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#93c5fd';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.08)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: action.bg,
                      color: action.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                      marginBottom: '8px'
                    }}
                  >
                    {action.icon}
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', lineHeight: 1.25 }}>
                    {action.label}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
