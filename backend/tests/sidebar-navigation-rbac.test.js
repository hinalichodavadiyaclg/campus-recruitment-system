import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';
process.env.SESSION_TOKEN_PEPPER = 'test-session-token-pepper-that-is-long-enough';
process.env.PASSWORD_RESET_SECRET = 'test-password-reset-secret-that-is-long-enough';

const [
  { createApp },
  { connectDatabase, disconnectDatabase },
  { seedInitialData },
  { User },
  { UserSession },
  { Role },
  { Company },
  { Department },
  { PlacementOfficer },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS, PERMISSION_IDS },
  { NAVIGATION_GROUPS, getVisibleNavGroups, canAccessNavItem }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/role.model.js'),
  import('../src/models/company.model.js'),
  import('../src/models/department.model.js'),
  import('../src/models/placement_officer.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js'),
  import('../../frontend/src/components/layout/navigationConfig.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', linkedCompanyId = null) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `nav-${roleId.toLowerCase()}-${ts}@vvwu.ac.in`;
  const passwordHash = await hashPassword('Password!123456');

  let companyId = linkedCompanyId;
  if (userType === 'COMPANY' && !companyId) {
    const comp = await Company.create({
      companyId: `COMP-${ts}`,
      companyName: `Test Company ${ts}`,
      industryType: 'IT',
      hrRecruiterName: 'HR Recruiter',
      email: `hr-${ts}@company.com`,
      yearEstablished: 2020
    });
    companyId = comp._id;
  }

  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `U${ts}` : undefined,
    companyId: userType === 'COMPANY' ? companyId : undefined,
    accountStatus: 'ACTIVE'
  });

  if (roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    let dept = await Department.findOne({ code: 'CSE' });
    if (!dept) {
      dept = await Department.create({
        name: 'Computer Science and Engineering',
        code: 'CSE',
        isActive: true
      });
    }
    await PlacementOfficer.create({
      userId: user._id,
      employeeId: user.employeeId,
      firstName: 'Coordinator',
      lastName: 'User',
      email: user.email,
      mobileNumber: '9876543210',
      designation: 'Department Coordinator',
      role: 'ROLE_PLACEMENT_COORDINATOR',
      departmentId: dept._id,
      department: dept.name
    });
  }

  const rawToken = createRawSessionToken();
  const sessionTokenHash = hashSessionToken(rawToken);
  const now = new Date();
  await UserSession.create({
    userId: user._id,
    sessionTokenHash,
    loginAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    isActive: true
  });

  return { token: rawToken, user };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await seedInitialData();
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

test('1. Student without USER_READ permission: Users menu & group hidden, direct backend access returns 403', async () => {
  const studentRole = await Role.findById(ROLE_IDS.STUDENT).lean();
  assert.ok(studentRole, 'ROLE_STUDENT must exist');
  const studentPermissionSet = new Set(studentRole.permissionIds || []);

  // Verify Student role definition does NOT have USER_READ
  assert.equal(studentPermissionSet.has(PERMISSION_IDS.USER_READ), false);

  // Frontend navigation dynamic visibility test
  const hasStudentPermission = (perm) => studentPermissionSet.has(perm);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasStudentPermission);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const usersItem = allVisibleItems.find((item) => item.path === '/users');
  const usersGroup = visibleGroups.find((g) => g.label === 'USERS');

  assert.equal(usersItem, undefined, 'Users menu item must NOT be visible to student');
  assert.equal(usersGroup, undefined, 'USERS group header must be hidden when all children are inaccessible');

  // Verify other unauthorized groups are also hidden
  assert.equal(visibleGroups.find((g) => g.label === 'MASTER DATA'), undefined);
  assert.equal(visibleGroups.find((g) => g.label === 'ACCESS MANAGEMENT'), undefined);
  assert.equal(visibleGroups.find((g) => g.label === 'DATA IMPORT'), undefined);

  // Backend authorization test: Direct HTTP call must return 403 Forbidden
  const studentSession = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${studentSession.token}`);

  assert.equal(res.status, 403, 'Backend must return 403 Forbidden for Student accessing /api/users');
});

test('2. Company recruiter without USER_READ permission: Users menu & group hidden, direct backend access returns 403', async () => {
  const companyRole = await Role.findById(ROLE_IDS.COMPANY).lean();
  assert.ok(companyRole, 'ROLE_COMPANY must exist');
  const companyPermissionSet = new Set(companyRole.permissionIds || []);

  // Verify Company role definition does NOT have USER_READ
  assert.equal(companyPermissionSet.has(PERMISSION_IDS.USER_READ), false);

  // Frontend navigation dynamic visibility test
  const hasCompanyPermission = (perm) => companyPermissionSet.has(perm);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasCompanyPermission);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const usersItem = allVisibleItems.find((item) => item.path === '/users');
  const usersGroup = visibleGroups.find((g) => g.label === 'USERS');

  assert.equal(usersItem, undefined, 'Users menu item must NOT be visible to company');
  assert.equal(usersGroup, undefined, 'USERS group header must be hidden when all children are inaccessible');

  // Backend authorization test: Direct HTTP call must return 403 Forbidden
  const companySession = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY');
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${companySession.token}`);

  assert.equal(res.status, 403, 'Backend must return 403 Forbidden for Company accessing /api/users');
});

test('3. Placement Coordinator with USER_READ permission: Users menu visible, Permissions hidden, backend allows access', async () => {
  const coordRole = await Role.findById(ROLE_IDS.PLACEMENT_COORDINATOR).lean();
  assert.ok(coordRole);
  const coordPermissionSet = new Set(coordRole.permissionIds || []);

  // Coordinator has USER_READ, but lacks PERMISSION_READ
  assert.equal(coordPermissionSet.has(PERMISSION_IDS.USER_READ), true);
  assert.equal(coordPermissionSet.has(PERMISSION_IDS.PERMISSION_READ), false);

  const hasCoordPermission = (perm) => coordPermissionSet.has(perm);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasCoordPermission);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const usersItem = allVisibleItems.find((item) => item.path === '/users');
  const usersGroup = visibleGroups.find((g) => g.label === 'USERS');

  assert.ok(usersItem, 'Users menu item must be visible to Placement Coordinator');
  assert.ok(usersGroup, 'USERS group header must be visible');

  // ACCESS MANAGEMENT: Roles visible, but Permissions hidden
  const accessMgmtGroup = visibleGroups.find((g) => g.label === 'ACCESS MANAGEMENT');
  assert.ok(accessMgmtGroup, 'ACCESS MANAGEMENT group header must be visible because Roles is visible');
  assert.ok(accessMgmtGroup.items.find((i) => i.path === '/roles'), 'Roles must be visible');
  assert.equal(accessMgmtGroup.items.find((i) => i.path === '/permissions'), undefined, 'Permissions must be hidden for Coordinator');

  // Backend authorization test: Direct HTTP call must return 200 OK
  const coordSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${coordSession.token}`);

  assert.equal(res.status, 200, 'Backend must return 200 OK for Placement Coordinator accessing /api/users');
});

test('4. Placement Head with USER_READ permission: Users menu visible, Permissions hidden, backend allows access', async () => {
  const headRole = await Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean();
  assert.ok(headRole);
  const headPermissionSet = new Set(headRole.permissionIds || []);

  assert.equal(headPermissionSet.has(PERMISSION_IDS.USER_READ), true);
  assert.equal(headPermissionSet.has(PERMISSION_IDS.PERMISSION_READ), false);

  const hasHeadPermission = (perm) => headPermissionSet.has(perm);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasHeadPermission);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  assert.ok(allVisibleItems.find((item) => item.path === '/users'), 'Users menu must be visible to Placement Head');
  assert.ok(visibleGroups.find((g) => g.label === 'USERS'));

  const accessMgmtGroup = visibleGroups.find((g) => g.label === 'ACCESS MANAGEMENT');
  assert.ok(accessMgmtGroup.items.find((i) => i.path === '/roles'));
  assert.equal(accessMgmtGroup.items.find((i) => i.path === '/permissions'), undefined, 'Permissions must be hidden for Placement Head');

  // Backend authorization test: Direct HTTP call must return 200 OK
  const headSession = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${headSession.token}`);

  assert.equal(res.status, 200, 'Backend must return 200 OK for Placement Head accessing /api/users');
});

test('5. Super Admin with all permissions: all menu items visible, backend allows access', async () => {
  const adminRole = await Role.findById(ROLE_IDS.SUPER_ADMIN).lean();
  assert.ok(adminRole);
  const adminPermissionSet = new Set(adminRole.permissionIds || []);

  const hasAdminPermission = (perm) => adminPermissionSet.has(perm);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasAdminPermission);

  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  assert.ok(allVisibleItems.find((i) => i.path === '/users'));
  assert.ok(allVisibleItems.find((i) => i.path === '/departments'));
  assert.ok(allVisibleItems.find((i) => i.path === '/courses'));
  assert.ok(allVisibleItems.find((i) => i.path === '/roles'));
  assert.ok(allVisibleItems.find((i) => i.path === '/permissions'));
  assert.ok(allVisibleItems.find((i) => i.path === '/import'));

  const adminSession = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
  const res = await request(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${adminSession.token}`);

  assert.equal(res.status, 200, 'Backend must return 200 OK for Super Admin accessing /api/users');
});

test('6. Fail-closed behavior during loading or when permissions are missing', async () => {
  // During loading, even an admin permission checker fails closed
  const loadingGroups = getVisibleNavGroups(NAVIGATION_GROUPS, () => true, { loading: true });
  const loadingItems = loadingGroups.flatMap((g) => g.items);

  assert.equal(loadingItems.find((i) => i.path === '/users'), undefined);
  assert.equal(loadingItems.find((i) => i.path === '/departments'), undefined);
  assert.equal(loadingItems.find((i) => i.path === '/roles'), undefined);
  assert.equal(loadingItems.find((i) => i.path === '/permissions'), undefined);

  // Only public items without permissions are visible during loading
  assert.ok(loadingItems.find((i) => i.path === '/dashboard'));
  assert.ok(loadingItems.find((i) => i.path === '/profile'));

  // Missing or non-function permission checker also fails closed
  const noPermGroups = getVisibleNavGroups(NAVIGATION_GROUPS, null, { loading: false });
  const noPermItems = noPermGroups.flatMap((g) => g.items);
  assert.equal(noPermItems.find((i) => i.path === '/users'), undefined);
});

test('7. Nested navigation / submenus: parent item hidden when all children are inaccessible', async () => {
  const customGroups = [
    {
      id: 'nested-group',
      label: 'NESTED SECTION',
      items: [
        {
          id: 'parent-item',
          label: 'Parent With Children',
          path: '/parent',
          children: [
            { id: 'child-1', label: 'Child 1', path: '/parent/child-1', permission: 'SECRET_ONE' },
            { id: 'child-2', label: 'Child 2', path: '/parent/child-2', permission: 'SECRET_TWO' }
          ]
        }
      ]
    }
  ];

  // User has no secret permissions -> Both children hidden -> Parent item hidden -> Parent group hidden
  const hiddenResult = getVisibleNavGroups(customGroups, () => false);
  assert.equal(hiddenResult.length, 0);

  // User has SECRET_ONE -> Child 1 visible -> Parent item visible -> Parent group visible
  const visibleResult = getVisibleNavGroups(customGroups, (p) => p === 'SECRET_ONE');
  assert.equal(visibleResult.length, 1);
  assert.equal(visibleResult[0].items.length, 1);
  assert.equal(visibleResult[0].items[0].children.length, 1);
  assert.equal(visibleResult[0].items[0].children[0].id, 'child-1');
});
