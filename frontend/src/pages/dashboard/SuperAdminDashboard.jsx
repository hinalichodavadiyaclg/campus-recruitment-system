import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { PortalLayout } from '../../components/layout/PortalLayout.jsx';
import { studentService } from '../../services/student.service.js';
import { companyService } from '../../services/company.service.js';
import { placementOfficerService } from '../../services/placement_officer.service.js';
import { sessionService } from '../../services/session.service.js';
import { jobService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
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
  const [upcomingInterviews, setUpcomingInterviews] = useState([]);
  const [applicationsList, setApplicationsList] = useState([]);

  const currentYear = new Date().getFullYear();
  const [dateRange, setDateRange] = useState(`Academic Year ${currentYear}-${currentYear + 1}`);
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

      let loadedApps = [];

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
        if (has('JOB_READ')) {
          const res = await jobService.listJobs({ status: 'OPEN', limit: 1 });
          if (res?.total !== undefined) {
            updates.jobs = res.total;
          } else if (res?.jobs?.length !== undefined) {
            updates.jobs = res.jobs.length;
          }
        }
      } catch {}

      try {
        if (has('APPLICATION_READ')) {
          const [appsRes, placedRes, interviewRes] = await Promise.allSettled([
            applicationService.listApplications({ limit: 100 }),
            applicationService.listApplications({ status: 'SELECTED', limit: 1 }),
            applicationService.listApplications({ status: 'INTERVIEW', limit: 10 })
          ]);

          if (appsRes.status === 'fulfilled' && appsRes.value) {
            updates.applications = appsRes.value.total ?? (appsRes.value.items?.length || 0);
            loadedApps = appsRes.value.items || [];
          }

          if (placedRes.status === 'fulfilled' && placedRes.value?.total !== undefined) {
            updates.placed = placedRes.value.total;
          } else {
            updates.placed = loadedApps.filter((a) => a.status === 'SELECTED').length;
          }

          if (interviewRes.status === 'fulfilled' && interviewRes.value?.total !== undefined) {
            updates.interviews = interviewRes.value.total;
            if (mounted && Array.isArray(interviewRes.value.items)) {
              setUpcomingInterviews(interviewRes.value.items);
            }
          } else {
            const ints = loadedApps.filter((a) => a.status === 'INTERVIEW');
            updates.interviews = ints.length;
            if (mounted) setUpcomingInterviews(ints);
          }
        }
      } catch {}

      if (mounted) {
        setStats(updates);
        setApplicationsList(loadedApps);
      }

      // Load real sessions or fallback to recent application actions for activity feed
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
            } else if (loadedApps.length > 0) {
              setActivities(
                loadedApps.slice(0, 5).map((app) => {
                  const studentName = `${app.studentId?.firstName || ''} ${app.studentId?.lastName || ''}`.trim() || 'Student';
                  const jobTitle = app.jobSnapshot?.title || app.jobId?.title || 'Job Opening';
                  return {
                    id: app._id || app.applicationId,
                    title: `${studentName} — ${app.status?.replace('_', ' ') || 'Applied'}`,
                    desc: `${jobTitle} (${app.companyId?.companyName || 'Company'})`,
                    time: app.createdAt ? formatTimeAgo(new Date(app.createdAt)) : 'Recently',
                    tag: app.status || 'Application',
                    icon: <DocumentIcon size={18} color="#2563eb" />,
                    bg: '#eff6ff',
                    color: '#2563eb'
                  };
                })
              );
            } else {
              setActivities([]);
            }
          }
        } else if (mounted) {
          if (loadedApps.length > 0) {
            setActivities(
              loadedApps.slice(0, 5).map((app) => {
                const studentName = `${app.studentId?.firstName || ''} ${app.studentId?.lastName || ''}`.trim() || 'Student';
                const jobTitle = app.jobSnapshot?.title || app.jobId?.title || 'Job Opening';
                return {
                  id: app._id || app.applicationId,
                  title: `${studentName} — ${app.status?.replace('_', ' ') || 'Applied'}`,
                  desc: `${jobTitle} (${app.companyId?.companyName || 'Company'})`,
                  time: app.createdAt ? formatTimeAgo(new Date(app.createdAt)) : 'Recently',
                  tag: app.status || 'Application',
                  icon: <DocumentIcon size={18} color="#2563eb" />,
                  bg: '#eff6ff',
                  color: '#2563eb'
                };
              })
            );
          } else {
            setActivities([]);
          }
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

  // Compute Dynamic Timeframe Buckets based on selected timeframe
  const getTimelineBuckets = (timeframe) => {
    const now = new Date();
    const buckets = [];
    if (timeframe === 'Last 30 Days') {
      for (let i = 4; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        const start = new Date(d);
        start.setDate(start.getDate() - 7);
        buckets.push({
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          start,
          end: d
        });
      }
    } else if (timeframe === 'This Year') {
      const curMonth = now.getMonth();
      const yr = now.getFullYear();
      for (let i = 0; i <= curMonth; i++) {
        const d = new Date(yr, i, 1);
        const endD = new Date(yr, i + 1, 0, 23, 59, 59);
        buckets.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          start: d,
          end: endD
        });
      }
      if (buckets.length < 4) {
        for (let i = 4 - buckets.length; i >= 1; i--) {
          const dPrev = new Date(yr - 1, 12 - i, 1);
          const endDPrev = new Date(yr - 1, 13 - i, 0, 23, 59, 59);
          buckets.unshift({
            label: dPrev.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
            start: dPrev,
            end: endDPrev
          });
        }
      }
    } else {
      // Default: Last 6 Months
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const endD = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        buckets.push({
          label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          start: d,
          end: endD
        });
      }
    }
    return buckets;
  };

  const timelineBuckets = getTimelineBuckets(chartTimeframe);
  const chartMonths = timelineBuckets.map((b) => b.label);

  // Compute dynamic points from real applications
  const appCountsByBucket = timelineBuckets.map((b) =>
    applicationsList.filter((a) => {
      const dt = new Date(a.createdAt);
      return dt >= b.start && dt <= b.end;
    }).length
  );

  const intCountsByBucket = timelineBuckets.map((b) =>
    applicationsList.filter((a) => {
      const dt = new Date(a.updatedAt || a.createdAt);
      return a.status === 'INTERVIEW' && dt >= b.start && dt <= b.end;
    }).length
  );

  const plaCountsByBucket = timelineBuckets.map((b) =>
    applicationsList.filter((a) => {
      const dt = new Date(a.updatedAt || a.createdAt);
      return a.status === 'SELECTED' && dt >= b.start && dt <= b.end;
    }).length
  );

  const hasChartData =
    appCountsByBucket.some((c) => c > 0) ||
    intCountsByBucket.some((c) => c > 0) ||
    plaCountsByBucket.some((c) => c > 0) ||
    stats.applications > 0;

  // If applications exist but were created before the window, assign to earliest/latest visible bucket
  const chartSeries = {
    applications: hasChartData
      ? (appCountsByBucket.every((c) => c === 0) && stats.applications > 0
          ? [0, 0, 0, 0, 0, stats.applications]
          : appCountsByBucket)
      : [0, 0, 0, 0, 0, 0],
    interviews: hasChartData
      ? (intCountsByBucket.every((c) => c === 0) && stats.interviews > 0
          ? [0, 0, 0, 0, 0, stats.interviews]
          : intCountsByBucket)
      : [0, 0, 0, 0, 0, 0],
    placements: hasChartData
      ? (plaCountsByBucket.every((c) => c === 0) && stats.placed > 0
          ? [0, 0, 0, 0, 0, stats.placed]
          : plaCountsByBucket)
      : [0, 0, 0, 0, 0, 0]
  };

  // Convert array of values to SVG coordinates with dynamic scaling
  const allChartVals = [
    ...chartSeries.applications,
    ...chartSeries.interviews,
    ...chartSeries.placements
  ];
  const maxDataVal = Math.max(0, ...allChartVals);
  const maxY = maxDataVal > 0 ? Math.max(10, Math.ceil((maxDataVal * 1.35) / 5) * 5) : 50;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => Math.round(maxY * pct));

  const svgWidth = 600;
  const svgHeight = 220;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 30;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const getCoordinates = (values) => {
    return values.map((val, idx) => {
      const x = padLeft + (idx / Math.max(1, values.length - 1)) * plotWidth;
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

  // Application Status breakdown computed from real data
  const totalAppsCount = stats.applications;
  const statusCounts = {
    APPLIED: 0,
    UNDER_REVIEW: 0,
    SHORTLISTED: 0,
    INTERVIEW: 0,
    SELECTED: 0,
    REJECTED: 0,
    WITHDRAWN: 0
  };

  applicationsList.forEach((app) => {
    if (statusCounts[app.status] !== undefined) {
      statusCounts[app.status]++;
    } else if (app.status === 'ASSESSMENT') {
      statusCounts.SHORTLISTED++;
    }
  });

  // If applications count > 0 but applicationsList was truncated or partial, ensure numbers reflect
  if (totalAppsCount > 0 && applicationsList.length === 0) {
    statusCounts.APPLIED = totalAppsCount - stats.placed - stats.interviews;
    statusCounts.INTERVIEW = stats.interviews;
    statusCounts.SELECTED = stats.placed;
  }

  const denominator = Math.max(1, totalAppsCount);
  const getPct = (cnt) => {
    if (!totalAppsCount || totalAppsCount === 0) return '0%';
    return `${Math.round((cnt / denominator) * 100)}%`;
  };

  const appStatus = [
    { label: 'Applied', count: statusCounts.APPLIED, pct: getPct(statusCounts.APPLIED), color: '#3b82f6' },
    { label: 'Under Review', count: statusCounts.UNDER_REVIEW, pct: getPct(statusCounts.UNDER_REVIEW), color: '#eab308' },
    { label: 'Shortlisted', count: statusCounts.SHORTLISTED, pct: getPct(statusCounts.SHORTLISTED), color: '#8b5cf6' },
    { label: 'Interviews', count: statusCounts.INTERVIEW, pct: getPct(statusCounts.INTERVIEW), color: '#f97316' },
    { label: 'Selected / Placed', count: statusCounts.SELECTED, pct: getPct(statusCounts.SELECTED), color: '#22c55e' },
    { label: 'Rejected', count: statusCounts.REJECTED, pct: getPct(statusCounts.REJECTED), color: '#ef4444' },
    { label: 'Withdrawn', count: statusCounts.WITHDRAWN, pct: getPct(statusCounts.WITHDRAWN), color: '#64748b' }
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
                `Academic Year ${currentYear}-${currentYear + 1}`,
                'Last 30 Days',
                'Last 6 Months',
                'This Year'
              ].map((opt) => (
                <div
                  key={opt}
                  onClick={() => {
                    setDateRange(opt);
                    if (opt === 'Last 30 Days' || opt === 'Last 6 Months' || opt === 'This Year') {
                      setChartTimeframe(opt);
                    }
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
            title="Total Registered Students"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <GraduationCapIcon size={22} color="#0284c7" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    fontWeight: 600,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Students
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.students}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Registered Companies */}
          <div
            title="Registered Companies"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#dcfce7',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <BuildingIcon size={22} color="#16a34a" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    fontWeight: 600,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Companies
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.companies}
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Active Jobs */}
          <div
            title="Active Job Openings"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#ffedd5',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <BriefcaseIcon size={22} color="#ea580c" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    fontWeight: 600,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Active Jobs
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.jobs}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Total Applications */}
          <div
            title="Total Candidate Applications"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#f3e8ff',
                  color: '#9333ea',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <DocumentIcon size={22} color="#9333ea" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    fontWeight: 600,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Applications
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.applications}
                </div>
              </div>
            </div>
          </div>

          {/* Card 5: Scheduled Interviews */}
          <div
            title="Scheduled Recruitment Interviews"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#fce7f3',
                  color: '#db2777',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <CalendarIcon size={22} color="#db2777" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    fontWeight: 600,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Interviews
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.interviews}
                </div>
              </div>
            </div>
          </div>

          {/* Card 6: Students Placed */}
          <div
            title="Total Students Placed"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#ccfbf1',
                  color: '#0d9488',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <TargetIcon size={22} color="#0d9488" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: '#64748b',
                    fontWeight: 600,
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  Placements
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                  {stats.placed}
                </div>
              </div>
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
                  {yTicks.map((val) => {
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
                    const x = padLeft + (idx / Math.max(1, chartMonths.length - 1)) * plotWidth;
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
                  {stats.applications > 0 && (() => {
                    let accOffset = 0;
                    const circ = 351.86;
                    return appStatus.map((item) => {
                      if (item.count <= 0) return null;
                      const sliceLen = (item.count / Math.max(1, totalAppsCount)) * circ;
                      const dashOffset = -accOffset;
                      accOffset += sliceLen;
                      return (
                        <circle
                          key={item.label}
                          cx="80"
                          cy="80"
                          r="56"
                          fill="none"
                          stroke={item.color}
                          strokeWidth="20"
                          strokeDasharray={`${sliceLen} ${Math.max(0, circ - sliceLen)}`}
                          strokeDashoffset={dashOffset}
                          style={{ transition: 'stroke-dasharray 0.4s ease' }}
                        />
                      );
                    });
                  })()}
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
              {has('APPLICATION_READ') && (
                <a
                  href="#/applications"
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

            {upcomingInterviews.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {upcomingInterviews.map((interview) => {
                  const candName =
                    `${interview.studentId?.firstName || ''} ${interview.studentId?.lastName || ''}`.trim() ||
                    interview.candidateName ||
                    'Candidate';
                  const roleTitle = interview.jobSnapshot?.title || interview.jobId?.title || 'Job Opening';
                  const companyName = interview.companyId?.companyName || 'Company';
                  return (
                    <a
                      key={interview._id || interview.id}
                      href="#/applications"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9',
                        textDecoration: 'none',
                        background: '#f8fafc',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: '#eff6ff',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.85rem'
                          }}
                        >
                          {candName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#0f172a' }}>
                            {candName}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            {roleTitle} • {companyName}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: '12px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: '#fef3c7',
                            color: '#b45309'
                          }}
                        >
                          Round {interview.recruitmentRound || 1}
                        </span>
                      </div>
                    </a>
                  );
                })}
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
                <CalendarIcon size={32} color="#94a3b8" />
                <div>No upcoming interviews scheduled</div>
              </div>
            )}
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
