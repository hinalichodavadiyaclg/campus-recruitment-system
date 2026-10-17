import { PERMISSION_IDS } from '../../../../backend/src/utils/access-constants.js';

/**
 * Single source of truth for Portal navigation configuration.
 * Items requiring permissions define their canonical PERMISSION_IDS.
 * Items without permissions are public to all authenticated users.
 */
export const NAVIGATION_GROUPS = [
  {
    id: 'top-general',
    items: [
      {
        id: 'nav-dashboard',
        label: 'Dashboard',
        path: '/dashboard',
        icon: 'HomeIcon'
      },
      {
        id: 'nav-my-account',
        label: 'My Account',
        path: '/profile',
        icon: 'UserIcon'
      }
    ]
  },
  {
    id: 'group-users',
    label: 'USERS',
    items: [
      {
        id: 'nav-users',
        label: 'Users',
        path: '/users',
        icon: 'UsersIcon',
        permission: PERMISSION_IDS.USER_READ
      }
    ]
  },
  {
    id: 'group-master-data',
    label: 'MASTER DATA',
    items: [
      {
        id: 'nav-departments',
        label: 'Departments',
        path: '/departments',
        icon: 'BuildingIcon',
        permission: PERMISSION_IDS.DEPARTMENT_MANAGE
      },
      {
        id: 'nav-courses',
        label: 'Courses',
        path: '/courses',
        icon: 'BookIcon',
        permission: PERMISSION_IDS.COURSE_READ
      }
    ]
  },
  {
    id: 'group-recruitment',
    label: 'RECRUITMENT',
    items: [
      {
        id: 'nav-job-postings',
        label: 'Job Postings',
        path: '/job-postings',
        icon: 'BriefcaseIcon',
        permission: PERMISSION_IDS.JOB_READ
      },
      {
        id: 'nav-applications',
        label: 'Applications',
        path: '/applications',
        icon: 'DocumentIcon',
        permission: PERMISSION_IDS.APPLICATION_READ
      },
      {
        id: 'nav-interviews',
        label: 'Interviews',
        path: '/interviews',
        icon: 'CalendarIcon'
      },
      {
        id: 'nav-placements',
        label: 'Placements',
        path: '/placements',
        icon: 'GraduationCapIcon'
      },
      {
        id: 'nav-workshops',
        label: 'Training & Workshops',
        path: '/training-workshops',
        icon: 'WorkshopsIcon',
        permission: PERMISSION_IDS.WORKSHOP_READ
      }
    ]
  },
  {
    id: 'group-access-management',
    label: 'ACCESS MANAGEMENT',
    items: [
      {
        id: 'nav-roles',
        label: 'Roles',
        path: '/roles',
        icon: 'ShieldIcon',
        permission: PERMISSION_IDS.ROLE_READ
      },
      {
        id: 'nav-permissions',
        label: 'Permissions',
        path: '/permissions',
        icon: 'KeyIcon',
        permission: PERMISSION_IDS.PERMISSION_READ
      }
    ]
  },
  {
    id: 'group-data-import',
    label: 'DATA IMPORT',
    items: [
      {
        id: 'nav-import',
        label: 'Import Data',
        path: '/import',
        icon: 'ImportIcon',
        permission: [
          PERMISSION_IDS.STUDENT_IMPORT,
          PERMISSION_IDS.COMPANY_IMPORT,
          PERMISSION_IDS.PLACEMENT_USER_IMPORT
        ]
      }
    ]
  },
  {
    id: 'group-reports',
    label: 'REPORTS',
    items: [
      {
        id: 'nav-reports',
        label: 'Reports & Analytics',
        path: '/reports',
        icon: 'ChartIcon'
      }
    ]
  },
  {
    id: 'group-system',
    divider: true,
    label: 'OTHER',
    items: [
      {
        id: 'nav-settings',
        label: 'Settings',
        path: '/settings',
        icon: 'SettingsIcon'
      }
    ]
  }
];

/**
 * Determines whether a navigation item or submenu is accessible.
 * - Fails closed if loading is true or permission checker is unavailable.
 * - Supports single permission, array of permissions (OR semantics), or custom checker functions.
 * - For items with children (submenus), checks children recursively and fails if no children accessible.
 */
export function canAccessNavItem(item, hasPermission, options = {}) {
  const { loading = false } = options;
  if (!item) return false;

  if (item.permission) {
    if (loading || typeof hasPermission !== 'function') {
      return false;
    }

    if (Array.isArray(item.permission)) {
      const hasAny = item.permission.some((perm) => Boolean(hasPermission(perm)));
      if (!hasAny) return false;
    } else if (typeof item.permission === 'function') {
      if (!item.permission(hasPermission)) return false;
    } else {
      if (!hasPermission(item.permission)) return false;
    }
  }

  if (Array.isArray(item.children) && item.children.length > 0) {
    const accessibleChildren = item.children.filter((child) =>
      canAccessNavItem(child, hasPermission, options)
    );
    if (accessibleChildren.length === 0) {
      return false;
    }
  }

  return true;
}

/**
 * Returns filtered navigation groups with accessible items.
 * If all items in a group are hidden, the entire parent group is hidden.
 */
export function getVisibleNavGroups(groups, hasPermission, options = {}) {
  if (!Array.isArray(groups)) return [];

  return groups
    .map((group) => {
      if (!Array.isArray(group.items)) return null;

      const visibleItems = group.items
        .filter((item) => canAccessNavItem(item, hasPermission, options))
        .map((item) => {
          if (Array.isArray(item.children)) {
            return {
              ...item,
              children: item.children.filter((child) =>
                canAccessNavItem(child, hasPermission, options)
              )
            };
          }
          return item;
        });

      if (visibleItems.length === 0) {
        return null;
      }

      return {
        ...group,
        items: visibleItems
      };
    })
    .filter(Boolean);
}
