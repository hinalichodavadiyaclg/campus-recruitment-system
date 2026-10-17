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
  { NAVIGATION_GROUPS, getVisibleNavGroups, canAccessNavItem },
  { parseCertificateVerificationRoute }
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
  import('../../frontend/src/components/layout/navigationConfig.js'),
  import('../../frontend/src/routes/certificateRoutes.js')
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

test('1. Navigation item configuration integrity for Training & Workshops', () => {
  const recruitmentGroup = NAVIGATION_GROUPS.find((g) => g.id === 'group-recruitment');
  assert.ok(recruitmentGroup, 'group-recruitment must exist in NAVIGATION_GROUPS');

  const workshopItem = recruitmentGroup.items.find((item) => item.id === 'nav-workshops');
  assert.ok(workshopItem, 'nav-workshops must exist under group-recruitment');
  assert.equal(workshopItem.path, '/training-workshops');
  assert.equal(workshopItem.label, 'Training & Workshops');
  assert.equal(workshopItem.icon, 'WorkshopsIcon');
  assert.equal(workshopItem.permission, PERMISSION_IDS.WORKSHOP_READ);
});

test('2. Student role: Workshop item is visible in frontend and accessible on backend', async () => {
  const studentRole = await Role.findById(ROLE_IDS.STUDENT).lean();
  assert.ok(studentRole, 'ROLE_STUDENT must exist');
  const studentPerms = new Set(studentRole.permissionIds || []);

  assert.ok(studentPerms.has(PERMISSION_IDS.WORKSHOP_READ), 'Student must hold WORKSHOP_READ');
  assert.ok(studentPerms.has(PERMISSION_IDS.WORKSHOP_REGISTER), 'Student must hold WORKSHOP_REGISTER');

  const hasPerm = (p) => studentPerms.has(p);
  const recruitmentGroup = NAVIGATION_GROUPS.find((g) => g.id === 'group-recruitment');
  const workshopItem = recruitmentGroup.items.find((item) => item.id === 'nav-workshops');

  assert.equal(canAccessNavItem(workshopItem, hasPerm), true, 'Student canAccessNavItem must return true');

  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasPerm);
  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const foundItem = allVisibleItems.find((item) => item.path === '/training-workshops');
  assert.ok(foundItem, 'Training & Workshops must appear in visible navigation for Student');

  const session = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${session.token}`);

  assert.equal(res.status, 200, 'Student should be allowed to call GET /api/workshops');
  assert.equal(res.body.success, true);
});

test('3. Company Recruiter role: Workshop item is HIDDEN in frontend and BLOCKED on backend', async () => {
  const companyRole = await Role.findById(ROLE_IDS.COMPANY).lean();
  assert.ok(companyRole, 'ROLE_COMPANY must exist');
  const companyPerms = new Set(companyRole.permissionIds || []);

  assert.equal(companyPerms.has(PERMISSION_IDS.WORKSHOP_READ), false, 'Company must NOT hold WORKSHOP_READ');

  const hasPerm = (p) => companyPerms.has(p);
  const recruitmentGroup = NAVIGATION_GROUPS.find((g) => g.id === 'group-recruitment');
  const workshopItem = recruitmentGroup.items.find((item) => item.id === 'nav-workshops');

  assert.equal(canAccessNavItem(workshopItem, hasPerm), false, 'Company canAccessNavItem must return false');

  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasPerm);
  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  const foundItem = allVisibleItems.find((item) => item.path === '/training-workshops');
  assert.equal(foundItem, undefined, 'Training & Workshops must NOT appear in visible navigation for Company');

  const session = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY');
  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${session.token}`);

  assert.equal(res.status, 403, 'Company must receive 403 Forbidden when accessing /api/workshops');
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 'FORBIDDEN');
});

test('4. Placement Coordinator role: Workshop item is visible in frontend and accessible on backend', async () => {
  const coordinatorRole = await Role.findById(ROLE_IDS.PLACEMENT_COORDINATOR).lean();
  assert.ok(coordinatorRole, 'ROLE_PLACEMENT_COORDINATOR must exist');
  const coordPerms = new Set(coordinatorRole.permissionIds || []);

  assert.ok(coordPerms.has(PERMISSION_IDS.WORKSHOP_READ), 'Coordinator must hold WORKSHOP_READ');
  assert.ok(coordPerms.has(PERMISSION_IDS.WORKSHOP_CREATE), 'Coordinator must hold WORKSHOP_CREATE');

  const hasPerm = (p) => coordPerms.has(p);
  const recruitmentGroup = NAVIGATION_GROUPS.find((g) => g.id === 'group-recruitment');
  const workshopItem = recruitmentGroup.items.find((item) => item.id === 'nav-workshops');

  assert.equal(canAccessNavItem(workshopItem, hasPerm), true);

  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasPerm);
  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  assert.ok(allVisibleItems.find((item) => item.path === '/training-workshops'));

  const session = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');
  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${session.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('5. Placement Head role: Workshop item is visible in frontend and accessible on backend', async () => {
  const headRole = await Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean();
  assert.ok(headRole, 'ROLE_PLACEMENT_HEAD must exist');
  const headPerms = new Set(headRole.permissionIds || []);

  assert.ok(headPerms.has(PERMISSION_IDS.WORKSHOP_READ), 'Head must hold WORKSHOP_READ');
  assert.ok(headPerms.has(PERMISSION_IDS.WORKSHOP_APPROVE), 'Head must hold WORKSHOP_APPROVE');

  const hasPerm = (p) => headPerms.has(p);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasPerm);
  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  assert.ok(allVisibleItems.find((item) => item.path === '/training-workshops'));

  const session = await createAuthenticatedSession(ROLE_IDS.PLACEMENT_HEAD, 'PLACEMENT');
  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${session.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('6. Super Admin role: Workshop item is visible and fully accessible', async () => {
  const adminRole = await Role.findById(ROLE_IDS.SUPER_ADMIN).lean();
  assert.ok(adminRole, 'ROLE_SUPER_ADMIN must exist');
  const adminPerms = new Set(adminRole.permissionIds || []);

  assert.ok(adminPerms.has(PERMISSION_IDS.WORKSHOP_READ));

  const hasPerm = (p) => adminPerms.has(p);
  const visibleGroups = getVisibleNavGroups(NAVIGATION_GROUPS, hasPerm);
  const allVisibleItems = visibleGroups.flatMap((g) => g.items);
  assert.ok(allVisibleItems.find((item) => item.path === '/training-workshops'));

  const session = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN, 'PLACEMENT');
  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${session.token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('7. Public certificate verification route: accessible unauthenticated without session token', async () => {
  const res = await request(app)
    .get('/api/workshops/certificates/verify/NON-EXISTENT-CODE');

  // Should return 404 CERTIFICATE_NOT_FOUND rather than 401 UNAUTHORIZED
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error?.code, 'CERTIFICATE_NOT_FOUND');
});

test('8. Public certificate route resolution — canonical and alias URL forms', () => {
  assert.equal(typeof parseCertificateVerificationRoute, 'function', 'parseCertificateVerificationRoute must be exported');

  // Canonical route: #/verify-certificate/:code
  const canonical = parseCertificateVerificationRoute('/verify-certificate/CERT-2026-0001');
  assert.equal(canonical.isVerifyRoute, true);
  assert.equal(canonical.code, 'CERT-2026-0001');

  // Short alias route: #/verify/:code
  const shortAlias = parseCertificateVerificationRoute('/verify/CERT-2026-0002');
  assert.equal(shortAlias.isVerifyRoute, true);
  assert.equal(shortAlias.code, 'CERT-2026-0002');

  // Structured alias route: #/certificates/verify/:code
  const structuredAlias = parseCertificateVerificationRoute('/certificates/verify/CERT-2026-0003');
  assert.equal(structuredAlias.isVerifyRoute, true);
  assert.equal(structuredAlias.code, 'CERT-2026-0003');

  // URL-encoded verification code
  const encoded = parseCertificateVerificationRoute('/verify/CERT%202026%20CODE');
  assert.equal(encoded.isVerifyRoute, true);
  assert.equal(encoded.code, 'CERT 2026 CODE');

  // Base routes without code (opens search / lookup form)
  assert.deepEqual(parseCertificateVerificationRoute('/verify-certificate'), { isVerifyRoute: true, code: '' });
  assert.deepEqual(parseCertificateVerificationRoute('/verify'), { isVerifyRoute: true, code: '' });
  assert.deepEqual(parseCertificateVerificationRoute('/certificates/verify'), { isVerifyRoute: true, code: '' });

  // Non-verification routes must NOT be intercepted
  assert.equal(parseCertificateVerificationRoute('/workshops').isVerifyRoute, false);
  assert.equal(parseCertificateVerificationRoute('/dashboard').isVerifyRoute, false);
  assert.equal(parseCertificateVerificationRoute('/login').isVerifyRoute, false);
  assert.equal(parseCertificateVerificationRoute('/certificates').isVerifyRoute, false);
  assert.equal(parseCertificateVerificationRoute('/students').isVerifyRoute, false);
  assert.equal(parseCertificateVerificationRoute('').isVerifyRoute, false);
});
