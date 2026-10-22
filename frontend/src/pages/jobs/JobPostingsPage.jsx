import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Loading } from '../../components/common/Loading.jsx';
import { NotFoundModulePage } from '../common/NotFoundModulePage.jsx';

import { CompanyJobPostingsView } from './CompanyJobPostingsView.jsx';
import { StudentJobOpportunitiesView } from './StudentJobOpportunitiesView.jsx';
import { PlacementHeadJobPostingsView } from './PlacementHeadJobPostingsView.jsx';
import { CoordinatorJobPostingsView } from './CoordinatorJobPostingsView.jsx';

/**
 * JobPostingsPage Controller:
 * Dynamic Role-Based Resolution for the Job Module.
 *
 * Directs the authenticated user to the appropriate experience:
 * 1. Company: "My Job Postings" (Job management, creation, lifecycle actions)
 * 2. Student: "Job Opportunities" (Discovery, eligibility checking, application flow)
 * 3. Placement Head / Super Admin: "All Job Postings" (Institution-wide oversight & suspension)
 * 4. Placement Coordinator: "Department Job Postings" (Department-scoped view & monitoring)
 */
export function JobPostingsPage({ initialJobId }) {
  const { user, role, loading, has } = useAuth();

  // Show established loading state while session authentication is initializing
  if (loading) {
    return <Loading message="Loading job recruitment workspace…" />;
  }

  // Authoritative dynamic RBAC check
  if (!has('JOB_READ')) {
    return <NotFoundModulePage title="Job Postings" path="/job-postings" />;
  }

  // Role Resolution
  const isStudent =
    user?.userType === 'STUDENT' ||
    role?.id === 'ROLE_STUDENT' ||
    user?.roleId === 'ROLE_STUDENT';

  const isCompany =
    user?.userType === 'COMPANY' ||
    role?.id === 'ROLE_COMPANY' ||
    user?.roleId === 'ROLE_COMPANY';

  const isCoordinator =
    role?.id === 'ROLE_PLACEMENT_COORDINATOR' ||
    user?.roleId === 'ROLE_PLACEMENT_COORDINATOR';

  const isPlacementHeadOrAdmin =
    role?.id === 'ROLE_PLACEMENT_HEAD' ||
    role?.id === 'ROLE_SUPER_ADMIN' ||
    user?.roleId === 'ROLE_PLACEMENT_HEAD' ||
    user?.roleId === 'ROLE_SUPER_ADMIN';

  // 1. Student Experience: Job Opportunities
  if (isStudent) {
    return <StudentJobOpportunitiesView initialJobId={initialJobId} />;
  }

  // 2. Company Experience: My Job Postings
  if (isCompany) {
    return <CompanyJobPostingsView initialJobId={initialJobId} />;
  }

  // 3. Placement Coordinator Experience: Department Job Postings
  if (isCoordinator) {
    return <CoordinatorJobPostingsView initialJobId={initialJobId} />;
  }

  // 4. Placement Head / Super Admin Experience: All Job Postings
  if (isPlacementHeadOrAdmin) {
    return <PlacementHeadJobPostingsView initialJobId={initialJobId} />;
  }

  // Fallback for authorized staff with JOB_READ
  return <PlacementHeadJobPostingsView initialJobId={initialJobId} />;
}
