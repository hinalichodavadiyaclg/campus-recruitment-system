import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { StudentDashboard } from './StudentDashboard.jsx';
import { CompanyDashboard } from './CompanyDashboard.jsx';
import { SuperAdminDashboard } from './SuperAdminDashboard.jsx';

export function DashboardPage() {
  const { user, role } = useAuth();

  const roleId = role?.id || user?.roleId;
  const userType = user?.userType;

  // Student Dashboard for ROLE_STUDENT
  if (roleId === 'ROLE_STUDENT' || userType === 'STUDENT') {
    return <StudentDashboard />;
  }

  // Company Dashboard for ROLE_COMPANY
  if (roleId === 'ROLE_COMPANY' || userType === 'COMPANY') {
    return <CompanyDashboard />;
  }

  // Administrative / Placement Dashboards for ROLE_SUPER_ADMIN, ROLE_PLACEMENT_HEAD, ROLE_PLACEMENT_COORDINATOR
  return <SuperAdminDashboard />;
}

export { StudentDashboard, CompanyDashboard, SuperAdminDashboard };
