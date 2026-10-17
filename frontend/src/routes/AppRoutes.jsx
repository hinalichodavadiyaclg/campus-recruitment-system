import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Loading } from '../components/common/Loading.jsx';

// Auth Pages
import { LoginPage } from '../pages/auth/LoginPage.jsx';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage.jsx';
import { VerifyResetPage } from '../pages/auth/VerifyResetPage.jsx';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage.jsx';
import { ResetSuccessPage } from '../pages/auth/ResetSuccessPage.jsx';

// Dashboard & Profile
import { DashboardPage } from '../pages/dashboard/DashboardPage.jsx';
import { ProfilePage } from '../pages/profile/ProfilePage.jsx';
import { ChangePasswordPage } from '../pages/profile/ChangePasswordPage.jsx';
import { SettingsPage } from '../pages/settings/SettingsPage.jsx';

// Users
import { UsersListPage } from '../pages/users/UsersListPage.jsx';
import { UserDetailsPage } from '../pages/users/UserDetailsPage.jsx';
import { UserRoleChangePage } from '../pages/users/UserRoleChangePage.jsx';

// Domain Profile Pages
import { FilteredStudentRecordsPage } from '../pages/students/FilteredStudentRecordsPage.jsx';
import { StudentMyProfilePage } from '../pages/students/StudentMyProfilePage.jsx';
import { StudentPublicProfilePage } from '../pages/students/StudentPublicProfilePage.jsx';
import { CompaniesListPage } from '../pages/companies/CompaniesListPage.jsx';
import { FilteredCompanyRecordsPage } from '../pages/companies/FilteredCompanyRecordsPage.jsx';
import { CompanyMyProfilePage } from '../pages/companies/CompanyMyProfilePage.jsx';
import { PlacementOfficersListPage } from '../pages/placement/PlacementOfficersListPage.jsx';
import { FilteredPlacementRecordsPage } from '../pages/placement/FilteredPlacementRecordsPage.jsx';
import { PlacementMyProfilePage } from '../pages/placement/PlacementMyProfilePage.jsx';
import { DepartmentsListPage } from '../pages/departments/DepartmentsListPage.jsx';
import { CoursesListPage } from '../pages/courses/CoursesListPage.jsx';

// Roles
import { RolesListPage } from '../pages/roles/RolesListPage.jsx';
import { RoleFormPage } from '../pages/roles/RoleFormPage.jsx';
import { RoleDetailsPage } from '../pages/roles/RoleDetailsPage.jsx';
import { RolePermissionsPage } from '../pages/roles/RolePermissionsPage.jsx';

// Permissions
import { PermissionsListPage } from '../pages/permissions/PermissionsListPage.jsx';
import { PermissionFormPage } from '../pages/permissions/PermissionFormPage.jsx';
import { PermissionDetailsPage } from '../pages/permissions/PermissionDetailsPage.jsx';

// Sessions & Imports
import { SessionsListPage } from '../pages/sessions/SessionsListPage.jsx';
import { ExcelImportPage } from '../pages/imports/ExcelImportPage.jsx';
import { JobPostingsPage } from '../pages/jobs/JobPostingsPage.jsx';
import { ApplicationsPage } from '../pages/applications/ApplicationsPage.jsx';
import { NotFoundModulePage } from '../pages/common/NotFoundModulePage.jsx';

const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/verify-reset',
  '/reset-password',
  '/reset-success'
];

function getCurrentRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/login';
}

export function AppRoutes() {
  const { me, user, role, loading, has } = useAuth();
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getCurrentRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (loading) {
    return <Loading message="Loading your secure workspace…" />;
  }

  const [pathname] = route.split('?');
  const parts = pathname.split('/').filter(Boolean);
  const isPublicProfileRoute = parts[0] === 'student-profile' || (parts[0] === 'students' && parts[2] === 'public');
  const isPublic = PUBLIC_ROUTES.includes(pathname) || isPublicProfileRoute;

  // Render public shareable profile route immediately if requested
  if (isPublicProfileRoute) {
    const profileId = parts[0] === 'student-profile' ? parts[1] : parts[1];
    return <StudentPublicProfilePage studentId={profileId} />;
  }

  // If user is not authenticated and trying to access private route
  if (!me && !isPublic) {
    window.location.hash = '#/login';
    return <LoginPage />;
  }

  // If user is already authenticated and visits login
  if (me && pathname === '/login') {
    window.location.hash = '#/dashboard';
    return <DashboardPage />;
  }

  // Public route rendering
  if (pathname === '/login') return <LoginPage />;
  if (pathname === '/forgot-password') return <ForgotPasswordPage />;
  if (pathname === '/verify-reset') return <VerifyResetPage />;
  if (pathname === '/reset-password') return <ResetPasswordPage />;
  if (pathname === '/reset-success') return <ResetSuccessPage />;

  // Authenticated workspace routes
  if (pathname === '/dashboard') return <DashboardPage />;
  if (pathname === '/profile') {
    if (user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT') return <StudentMyProfilePage />;
    if (user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY') return <CompanyMyProfilePage />;
    if (user?.userType === 'PLACEMENT' || role?.id === 'ROLE_PLACEMENT_COORDINATOR' || role?.id === 'ROLE_PLACEMENT_HEAD' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_HEAD') {
      return <PlacementMyProfilePage />;
    }
    return <ProfilePage />;
  }
  if (pathname === '/my-profile') {
    if (user?.userType === 'STUDENT' || role?.id === 'ROLE_STUDENT' || user?.roleId === 'ROLE_STUDENT') return <StudentMyProfilePage />;
    if (user?.userType === 'PLACEMENT' || role?.id === 'ROLE_PLACEMENT_COORDINATOR' || role?.id === 'ROLE_PLACEMENT_HEAD' || user?.roleId === 'ROLE_PLACEMENT_COORDINATOR' || user?.roleId === 'ROLE_PLACEMENT_HEAD') {
      return <PlacementMyProfilePage />;
    }
    return <DashboardPage />;
  }
  if (pathname === '/placement-profile' || pathname === '/placement/profile') {
    return <PlacementMyProfilePage />;
  }
  if (pathname === '/company-profile' || pathname === '/company/profile') {
    return (user?.userType === 'COMPANY' || role?.id === 'ROLE_COMPANY' || user?.roleId === 'ROLE_COMPANY') ? <CompanyMyProfilePage /> : <DashboardPage />;
  }
  if (pathname === '/change-password') return <SettingsPage />;
  if (pathname === '/first-login-password') return <ChangePasswordPage firstLogin={true} />;

  // Excel Data Import routes
  if (pathname === '/import' || pathname === '/import/student') {
    return has('STUDENT_IMPORT') ? <ExcelImportPage type="student" /> : <NotFoundModulePage title="Import Data" path="/import" />;
  }
  if (pathname === '/import/company') {
    return has('COMPANY_IMPORT') ? <ExcelImportPage type="company" /> : <NotFoundModulePage title="Import Companies" path="/import/company" />;
  }
  if (pathname === '/import/placement') {
    return has('PLACEMENT_USER_IMPORT') ? <ExcelImportPage type="placement" /> : <NotFoundModulePage title="Import Placement Cell" path="/import/placement" />;
  }

  // Domain Profile routes (Read-only student records with department/course filtering)
  if (parts[0] === 'students') {
    const subRoute = (parts[1] || '').split('?')[0];
    if (parts.length > 1 && subRoute !== 'filtered' && subRoute !== 'public') {
      return <StudentPublicProfilePage studentId={parts[1]} />;
    }
    return (has('USER_READ') || has('STUDENT_READ')) ? <FilteredStudentRecordsPage /> : <DashboardPage />;
  }

  if (parts[0] === 'companies') {
    const subRoute = (parts[1] || '').split('?')[0];
    if (subRoute === 'filtered') {
      return has('USER_READ') ? <FilteredCompanyRecordsPage /> : <NotFoundModulePage title="Company Records" path="/companies/filtered" />;
    }
    return has('USER_READ') ? <CompaniesListPage /> : <DashboardPage />;
  }

  if (parts[0] === 'placement-officers') {
    const canAccessPlacementCell = has('PLACEMENT_USER_IMPORT') || has('USER_CREATE');
    if (!canAccessPlacementCell) {
      window.location.hash = '#/dashboard';
      return <DashboardPage />;
    }
    const subRoute = (parts[1] || '').split('?')[0];
    if (subRoute === 'filtered') {
      return <FilteredPlacementRecordsPage />;
    }
    return <PlacementOfficersListPage />;
  }

  if (parts[0] === 'departments') {
    if (!has('DEPARTMENT_MANAGE') && !has('DEPARTMENT_CREATE')) {
      window.location.hash = '#/dashboard';
      return <DashboardPage />;
    }
    return <DepartmentsListPage />;
  }

  if (parts[0] === 'courses') {
    if (!has('COURSE_READ')) {
      window.location.hash = '#/dashboard';
      return <DashboardPage />;
    }
    return <CoursesListPage />;
  }

  // Users routes
  if (parts[0] === 'users') {
    if (!has('USER_READ')) {
      window.location.hash = '#/dashboard';
      return <DashboardPage />;
    }
    if (parts.length === 1) return <UsersListPage />;
    if (parts[2] === 'role') return <UserRoleChangePage userId={parts[1]} />;
    if (parts[1]) return <UserDetailsPage userId={parts[1]} />;
  }

  // Roles routes
  if (parts[0] === 'roles') {
    if (!has('ROLE_READ')) {
      window.location.hash = '#/dashboard';
      return <DashboardPage />;
    }
    if (parts[1] === 'new') return <RoleFormPage />;
    if (parts[2] === 'edit') return <RoleFormPage roleId={parts[1]} />;
    if (parts[2] === 'permissions') return <RolePermissionsPage roleId={parts[1]} />;
    if (parts[1]) return <RoleDetailsPage roleId={parts[1]} />;
    return <RolesListPage />;
  }

  // Permissions routes
  if (parts[0] === 'permissions') {
    if (!has('PERMISSION_READ')) {
      window.location.hash = '#/dashboard';
      return <DashboardPage />;
    }
    if (parts[1] === 'new') return <PermissionFormPage />;
    if (parts[2] === 'edit') return <PermissionFormPage permissionId={parts[1]} />;
    if (parts[1]) return <PermissionDetailsPage permissionId={parts[1]} />;
    return <PermissionsListPage />;
  }

  // Session Activity route
  if (parts[0] === 'sessions') {
    return has('SESSION_READ') ? <SessionsListPage /> : <NotFoundModulePage title="Login Activity" path="/sessions" />;
  }

  // Recruitment modules
  if (parts[0] === 'job-postings' || parts[0] === 'jobs') {
    return has('JOB_READ') ? <JobPostingsPage /> : <NotFoundModulePage title="Job Postings" path="/job-postings" />;
  }

  if (parts[0] === 'applications') {
    return has('APPLICATION_READ') ? <ApplicationsPage /> : <NotFoundModulePage title="Applications" path="/applications" />;
  }

  if (parts[0] === 'interviews') {
    return <NotFoundModulePage title="Interviews" path="/interviews" />;
  }

  if (parts[0] === 'placements') {
    return <NotFoundModulePage title="Placements" path="/placements" />;
  }

  if (parts[0] === 'training-workshops' || parts[0] === 'workshops' || parts[0] === 'training') {
    return <NotFoundModulePage title="Training & Workshops" path="/training-workshops" />;
  }

  // Reports module
  if (parts[0] === 'reports') {
    return <NotFoundModulePage title="Reports & Analytics" path="/reports" />;
  }

  // System settings module
  if (parts[0] === 'settings') {
    return <SettingsPage />;
  }

  // Fallback: render Not found if route is unrecognized
  return <NotFoundModulePage title="Page Not Found" path={route} />;
}