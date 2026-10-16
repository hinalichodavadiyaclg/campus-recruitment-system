import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';

const [
  { connectDatabase, disconnectDatabase },
  { seedInitialData },
  { Permission },
  { Role },
  { ROLE_IDS, PERMISSION_IDS, ALL_PERMISSION_IDS, PERMISSION_LEGACY_ALIAS_MAP }
] = await Promise.all([
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/permission.model.js'),
  import('../src/models/role.model.js'),
  import('../src/utils/access-constants.js')
]);

const EXPECTED_WORKSHOP_PERMISSIONS = Object.freeze([
  'WORKSHOP_CREATE',
  'WORKSHOP_READ',
  'WORKSHOP_UPDATE',
  'WORKSHOP_DELETE',
  'WORKSHOP_APPROVE',
  'WORKSHOP_PUBLISH',
  'WORKSHOP_CANCEL',
  'WORKSHOP_REGISTER',
  'WORKSHOP_ROSTER_READ',
  'WORKSHOP_ATTENDANCE_MANAGE',
  'WORKSHOP_CERTIFICATE_MANAGE',
  'WORKSHOP_AUDIT_READ',
  'WORKSHOP_MANAGE'
]);

const VALID_SCHEMA_ACTIONS = Object.freeze(['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE']);

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await connectDatabase();
});

after(async () => {
  await disconnectDatabase();
  if (mongo) {
    await mongo.stop();
  }
});

test('Test Suite 1: Canonical Workshop Permission Constant Integrity', () => {
  assert.equal(EXPECTED_WORKSHOP_PERMISSIONS.length, 13, 'Expected exactly 13 canonical workshop permissions');

  for (const permId of EXPECTED_WORKSHOP_PERMISSIONS) {
    assert.ok(permId in PERMISSION_IDS, `PERMISSION_IDS must define ${permId}`);
    assert.equal(PERMISSION_IDS[permId], permId, `PERMISSION_IDS.${permId} must equal its key string`);
    assert.match(permId, /^WORKSHOP_[A-Z_]+$/, `${permId} must adhere to WORKSHOP_[ACTION] naming pattern`);
  }

  // Ensure all values in PERMISSION_IDS are unique
  const allIds = Object.values(PERMISSION_IDS);
  const uniqueIds = new Set(allIds);
  assert.equal(allIds.length, uniqueIds.size, 'PERMISSION_IDS must not contain duplicate values');
  assert.equal(allIds.length, 57, 'Total canonical permissions in PERMISSION_IDS must equal 57 (44 baseline + 13 workshop)');

  // Ensure ALL_PERMISSION_IDS includes all workshop permissions
  for (const permId of EXPECTED_WORKSHOP_PERMISSIONS) {
    assert.ok(ALL_PERMISSION_IDS.includes(permId), `ALL_PERMISSION_IDS must include ${permId}`);
  }
  assert.equal(ALL_PERMISSION_IDS.length, 57, 'ALL_PERMISSION_IDS must contain exactly 57 unique permissions');
});

test('Test Suite 2: Permission Metadata Parity in seedInitialData', async () => {
  // Read permissions from seed module by inspecting seeder execution in isolated memory DB
  const seededPermissions = await Permission.find({ module: 'Workshops & Training' }).lean();
  
  // Note: If not yet seeded in this block, execute seed once
  if (seededPermissions.length === 0) {
    await seedInitialData();
  }

  const workshopDocs = await Permission.find({ module: 'Workshops & Training' }).lean();
  assert.equal(workshopDocs.length, 13, 'There must be exactly 13 metadata definitions under module Workshops & Training');

  const metadataIds = new Set(workshopDocs.map((p) => p._id));
  const expectedSet = new Set(EXPECTED_WORKSHOP_PERMISSIONS);

  // Exact 1:1 bidirectional parity
  for (const permId of EXPECTED_WORKSHOP_PERMISSIONS) {
    assert.ok(metadataIds.has(permId), `Missing metadata definition for canonical permission: ${permId}`);
  }
  for (const metaId of metadataIds) {
    assert.ok(expectedSet.has(metaId), `Unexpected workshop metadata entry with ID: ${metaId}`);
  }

  // Validate fields and schema enum conformance
  for (const doc of workshopDocs) {
    assert.ok(typeof doc.name === 'string' && doc.name.trim().length > 0, `Permission ${doc._id} must have a non-empty name`);
    assert.equal(doc.module, 'Workshops & Training', `Permission ${doc._id} must belong to module 'Workshops & Training'`);
    assert.ok(VALID_SCHEMA_ACTIONS.includes(doc.action), `Permission ${doc._id} has invalid action '${doc.action}'`);
    assert.ok(typeof doc.description === 'string' && doc.description.trim().length > 0, `Permission ${doc._id} must have a description`);
    assert.equal(doc.isActive, true, `Permission ${doc._id} must be active`);
  }
});

test('Test Suite 3: Alias Safety & Anti-Privilege Creep Verification', () => {
  // Ensure every alias target exists in ALL_PERMISSION_IDS
  for (const [alias, target] of Object.entries(PERMISSION_LEGACY_ALIAS_MAP)) {
    assert.ok(ALL_PERMISSION_IDS.includes(target), `Alias ${alias} targets unknown permission ${target}`);
  }

  // Explicit safety firewalls: verify sensitive workshop actions are NOT aliased to broader permissions
  const dangerousMappings = [
    ['WORKSHOP_AUDIT_READ', 'WORKSHOP_READ'],
    ['WORKSHOP_AUDIT_VIEW', 'WORKSHOP_READ'],
    ['WORKSHOP_ROSTER_READ', 'WORKSHOP_READ'],
    ['VIEW_ROSTER', 'WORKSHOP_READ'],
    ['WORKSHOP_CANCEL', 'WORKSHOP_REGISTER'],
    ['CANCEL_REGISTRATION', 'WORKSHOP_CANCEL'],
    ['WORKSHOP_APPROVE', 'WORKSHOP_UPDATE'],
    ['REJECT_WORKSHOP', 'WORKSHOP_UPDATE'],
    ['WORKSHOP_ATTENDANCE_MANAGE', 'WORKSHOP_READ'],
    ['WORKSHOP_ATTENDANCE_MANAGE', 'WORKSHOP_UPDATE'],
    ['WORKSHOP_CERTIFICATE_MANAGE', 'WORKSHOP_READ'],
    ['WORKSHOP_CERTIFICATE_MANAGE', 'WORKSHOP_UPDATE']
  ];

  for (const [source, forbiddenTarget] of dangerousMappings) {
    assert.notEqual(
      PERMISSION_LEGACY_ALIAS_MAP[source],
      forbiddenTarget,
      `Unsafe alias detected: ${source} must NOT map to ${forbiddenTarget}`
    );
  }
});

test('Test Suite 4: Least-Privilege Role Authorization Matrix', async () => {
  await seedInitialData();

  const roles = await Role.find({}).lean();
  const roleMap = new Map(roles.map((r) => [r._id, new Set(r.permissionIds)]));

  // 1. Student Role
  const studentPerms = roleMap.get(ROLE_IDS.STUDENT);
  assert.ok(studentPerms, 'ROLE_STUDENT must exist');
  assert.ok(studentPerms.has(PERMISSION_IDS.WORKSHOP_READ), 'Student must have WORKSHOP_READ');
  assert.ok(studentPerms.has(PERMISSION_IDS.WORKSHOP_REGISTER), 'Student must have WORKSHOP_REGISTER');
  
  // Student must NOT have any of the 11 staff permissions
  const staffPermissions = [
    PERMISSION_IDS.WORKSHOP_CREATE,
    PERMISSION_IDS.WORKSHOP_UPDATE,
    PERMISSION_IDS.WORKSHOP_DELETE,
    PERMISSION_IDS.WORKSHOP_APPROVE,
    PERMISSION_IDS.WORKSHOP_PUBLISH,
    PERMISSION_IDS.WORKSHOP_CANCEL,
    PERMISSION_IDS.WORKSHOP_ROSTER_READ,
    PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE,
    PERMISSION_IDS.WORKSHOP_CERTIFICATE_MANAGE,
    PERMISSION_IDS.WORKSHOP_AUDIT_READ,
    PERMISSION_IDS.WORKSHOP_MANAGE
  ];
  for (const staffPerm of staffPermissions) {
    assert.equal(studentPerms.has(staffPerm), false, `Student must NOT hold staff permission: ${staffPerm}`);
  }
  assert.equal(studentPerms.size, 6, 'ROLE_STUDENT must have exactly 6 total permissions (4 baseline + 2 workshop)');

  // 2. Company Role
  const companyPerms = roleMap.get(ROLE_IDS.COMPANY);
  assert.ok(companyPerms, 'ROLE_COMPANY must exist');
  for (const permId of EXPECTED_WORKSHOP_PERMISSIONS) {
    assert.equal(companyPerms.has(permId), false, `Company recruiter must NOT hold workshop permission: ${permId}`);
  }
  assert.equal(companyPerms.size, 3, 'ROLE_COMPANY must have exactly 3 baseline permissions');

  // 3. Placement Coordinator Role
  const coordinatorPerms = roleMap.get(ROLE_IDS.PLACEMENT_COORDINATOR);
  assert.ok(coordinatorPerms, 'ROLE_PLACEMENT_COORDINATOR must exist');
  const expectedCoordinatorWorkshop = [
    PERMISSION_IDS.WORKSHOP_READ,
    PERMISSION_IDS.WORKSHOP_CREATE,
    PERMISSION_IDS.WORKSHOP_UPDATE,
    PERMISSION_IDS.WORKSHOP_DELETE,
    PERMISSION_IDS.WORKSHOP_PUBLISH,
    PERMISSION_IDS.WORKSHOP_CANCEL,
    PERMISSION_IDS.WORKSHOP_ROSTER_READ,
    PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE,
    PERMISSION_IDS.WORKSHOP_AUDIT_READ
  ];
  for (const permId of expectedCoordinatorWorkshop) {
    assert.ok(coordinatorPerms.has(permId), `Coordinator must have operational permission ${permId}`);
  }
  // Coordinator firewall: must NOT have APPROVE, CERTIFICATE_MANAGE, MANAGE, or student REGISTER
  const prohibitedCoordinator = [
    PERMISSION_IDS.WORKSHOP_APPROVE,
    PERMISSION_IDS.WORKSHOP_CERTIFICATE_MANAGE,
    PERMISSION_IDS.WORKSHOP_MANAGE,
    PERMISSION_IDS.WORKSHOP_REGISTER
  ];
  for (const permId of prohibitedCoordinator) {
    assert.equal(coordinatorPerms.has(permId), false, `Coordinator must NOT hold privileged/student permission ${permId}`);
  }
  assert.equal(coordinatorPerms.size, 20, 'ROLE_PLACEMENT_COORDINATOR must have exactly 20 permissions (11 baseline + 9 workshop)');

  // 4. Placement Head Role
  const headPerms = roleMap.get(ROLE_IDS.PLACEMENT_HEAD);
  assert.ok(headPerms, 'ROLE_PLACEMENT_HEAD must exist');
  for (const permId of expectedCoordinatorWorkshop) {
    assert.ok(headPerms.has(permId), `Placement Head must have operational permission ${permId}`);
  }
  // Placement Head executive additions
  assert.ok(headPerms.has(PERMISSION_IDS.WORKSHOP_APPROVE), 'Placement Head must have WORKSHOP_APPROVE');
  assert.ok(headPerms.has(PERMISSION_IDS.WORKSHOP_CERTIFICATE_MANAGE), 'Placement Head must have WORKSHOP_CERTIFICATE_MANAGE');
  assert.ok(headPerms.has(PERMISSION_IDS.WORKSHOP_MANAGE), 'Placement Head must have WORKSHOP_MANAGE');
  // Placement Head must NOT have student self-registration
  assert.equal(headPerms.has(PERMISSION_IDS.WORKSHOP_REGISTER), false, 'Placement Head must NOT hold student self-registration WORKSHOP_REGISTER');
  assert.equal(headPerms.size, 35, 'ROLE_PLACEMENT_HEAD must have exactly 35 permissions (23 baseline + 12 workshop)');

  // 5. Super Admin Role
  const adminPerms = roleMap.get(ROLE_IDS.SUPER_ADMIN);
  assert.ok(adminPerms, 'ROLE_SUPER_ADMIN must exist');
  for (const permId of ALL_PERMISSION_IDS) {
    assert.ok(adminPerms.has(permId), `Super Admin must hold permission ${permId}`);
  }
  assert.equal(adminPerms.size, 57, 'ROLE_SUPER_ADMIN must have all 57 canonical permissions');
});

test('Test Suite 5: Domain Boundary & Anti-Bypass Architectural Invariants', async () => {
  // Clarification 1 Verification:
  // Super Admin holds ALL_PERMISSION_IDS, but WORKSHOP_REGISTER is strictly a student self-service capability
  assert.ok(ALL_PERMISSION_IDS.includes(PERMISSION_IDS.WORKSHOP_REGISTER));
  const registerMeta = await Permission.findById(PERMISSION_IDS.WORKSHOP_REGISTER).lean();
  assert.equal(registerMeta.action, 'CREATE', 'WORKSHOP_REGISTER must be action CREATE');
  assert.equal(registerMeta.module, 'Workshops & Training');

  // Neither Placement Coordinator nor Placement Head holds WORKSHOP_REGISTER
  const coordRole = await Role.findById(ROLE_IDS.PLACEMENT_COORDINATOR).lean();
  const headRole = await Role.findById(ROLE_IDS.PLACEMENT_HEAD).lean();
  assert.equal(coordRole.permissionIds.includes(PERMISSION_IDS.WORKSHOP_REGISTER), false);
  assert.equal(headRole.permissionIds.includes(PERMISSION_IDS.WORKSHOP_REGISTER), false);

  // Clarification 2 Verification:
  // WORKSHOP_ATTENDANCE_MANAGE is an assigned-trainer capability, not a generic update bypass
  const attendanceMeta = await Permission.findById(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE).lean();
  assert.equal(attendanceMeta.action, 'MANAGE', 'WORKSHOP_ATTENDANCE_MANAGE must be action MANAGE');
  assert.notEqual(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE, PERMISSION_IDS.WORKSHOP_UPDATE);
  assert.notEqual(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE, PERMISSION_IDS.WORKSHOP_READ);

  // Student and Company roles must strictly lack WORKSHOP_ATTENDANCE_MANAGE
  const studentRole = await Role.findById(ROLE_IDS.STUDENT).lean();
  const companyRole = await Role.findById(ROLE_IDS.COMPANY).lean();
  assert.equal(studentRole.permissionIds.includes(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE), false);
  assert.equal(companyRole.permissionIds.includes(PERMISSION_IDS.WORKSHOP_ATTENDANCE_MANAGE), false);
});

test('Test Suite 6: Isolated In-Memory Seeder Idempotency & State Preservation', async () => {
  // Re-run seedInitialData multiple times in the isolated memory database
  await seedInitialData();
  await seedInitialData();

  const totalPermissions = await Permission.countDocuments();
  const totalRoles = await Role.countDocuments();

  assert.equal(totalPermissions, 57, 'Permission count must remain exactly 57 after repeated seeder runs');
  assert.equal(totalRoles, 5, 'Role count must remain exactly 5 after repeated seeder runs');

  // Verify that all 5 default roles exist and are active
  const expectedRoles = [
    ROLE_IDS.STUDENT,
    ROLE_IDS.COMPANY,
    ROLE_IDS.PLACEMENT_COORDINATOR,
    ROLE_IDS.PLACEMENT_HEAD,
    ROLE_IDS.SUPER_ADMIN
  ];
  for (const roleId of expectedRoles) {
    const roleDoc = await Role.findById(roleId).lean();
    assert.ok(roleDoc, `Role ${roleId} must exist`);
    assert.equal(roleDoc.isActive, true, `Role ${roleId} must be active`);
    assert.ok(Array.isArray(roleDoc.permissionIds), `Role ${roleId} permissionIds must be an array`);
    // Ensure no duplicates in role permissionIds
    const uniqueIds = new Set(roleDoc.permissionIds);
    assert.equal(roleDoc.permissionIds.length, uniqueIds.size, `Role ${roleId} must have no duplicate permission IDs`);
  }
});
