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
  { Company },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS }
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/company.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', linkedCompanyId = null) {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `test-${roleId.toLowerCase()}-${ts}@example.edu`;
  const passwordHash = await hashPassword('Password!123456');
  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `UNI-${ts}` : undefined,
    companyId: linkedCompanyId || undefined,
    accountStatus: 'ACTIVE'
  });

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
  await Company.deleteMany({});
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

test('1. Company registration creates the company and its initial primary recruiter correctly', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  const res = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Apex Innovations',
      industryType: 'Software',
      hrRecruiterName: 'Elena Rostova',
      email: 'elena@apex.io',
      yearEstablished: 2021,
      description: 'Enterprise Cloud Solutions'
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  const comp = res.body.data;

  // 1. Company ID formatted as COMP-XXXX
  assert.equal(comp.companyId, 'COMP-0001');

  // 2. Primary recruiter is linked and dual-synced with userId
  assert.ok(comp.primaryRecruiterId);
  assert.equal(String(comp.primaryRecruiterId), String(comp.userId));

  // 3. User document is created with userType: 'COMPANY', roleId: ROLE_COMPANY, and companyId: companies._id
  const recruiterUser = await User.findById(comp.primaryRecruiterId);
  assert.ok(recruiterUser);
  assert.equal(recruiterUser.email, 'elena@apex.io');
  assert.equal(recruiterUser.userType, 'COMPANY');
  assert.equal(recruiterUser.roleId, ROLE_IDS.COMPANY);
  assert.equal(recruiterUser.accountStatus, 'ACTIVE');
  assert.equal(String(recruiterUser.companyId), String(comp._id));

  // Exactly 1 company and 1 recruiter created
  const companyCount = await Company.countDocuments();
  const recruiterCount = await User.countDocuments({ companyId: comp._id });
  assert.equal(companyCount, 1);
  assert.equal(recruiterCount, 1);
});

test('2. An administrator can add a second recruiter to the same company without creating another company', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Initial company registration
  const regRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Starlight Tech',
      industryType: 'Semiconductors',
      hrRecruiterName: 'Sarah Connor',
      email: 'sarah@starlight.com',
      yearEstablished: 2015
    });
  const comp = regRes.body.data;

  // Admin adds a second recruiter
  const addRecRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'john@starlight.com',
      password: 'Recruiter@Password123',
      accountStatus: 'ACTIVE'
    });

  assert.equal(addRecRes.status, 201);
  const secondRecruiter = addRecRes.body.data;
  assert.equal(secondRecruiter.email, 'john@starlight.com');
  assert.equal(secondRecruiter.isPrimary, false);
  assert.equal(secondRecruiter.companyId, String(comp._id));

  // Crucial invariant: Exactly 1 company record must exist, and companyId remains COMP-0001
  const companyCount = await Company.countDocuments();
  assert.equal(companyCount, 1);

  const dbCompany = await Company.findById(comp._id);
  assert.equal(dbCompany.companyId, 'COMP-0001');

  // Both recruiters are linked to the same company
  const recruiters = await User.find({ companyId: comp._id });
  assert.equal(recruiters.length, 2);
});

test('3. Multiple recruiters share the same company reference but have separate login accounts', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create Company with Primary Recruiter
  const regRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Zenith Dynamics',
      industryType: 'Automotive',
      hrRecruiterName: 'Diana Prince',
      email: 'diana@zenith.com',
      yearEstablished: 2012
    });
  const comp = regRes.body.data;

  // Add Secondary Recruiter with custom password
  const addRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'clark@zenith.com',
      password: 'ClarkSecretPassword!1',
      accountStatus: 'ACTIVE'
    });
  assert.equal(addRes.status, 201);

  // Set password for primary recruiter to test login
  const primaryUser = await User.findById(comp.primaryRecruiterId);
  primaryUser.passwordHash = await hashPassword('DianaSecretPassword!1');
  await primaryUser.save();

  // Test Login 1: Primary recruiter
  const login1 = await request(app)
    .post('/api/auth/login')
    .send({ email: 'diana@zenith.com', password: 'DianaSecretPassword!1' });
  assert.equal(login1.status, 200);
  assert.ok(login1.body.data.sessionToken);
  assert.equal(login1.body.data.user.email, 'diana@zenith.com');

  // Test Login 2: Secondary recruiter
  const login2 = await request(app)
    .post('/api/auth/login')
    .send({ email: 'clark@zenith.com', password: 'ClarkSecretPassword!1' });
  assert.equal(login2.status, 200);
  assert.ok(login2.body.data.sessionToken);
  assert.equal(login2.body.data.user.email, 'clark@zenith.com');

  // Both tokens query /api/companies/me -> both access the exact same company profile
  const me1 = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${login1.body.data.sessionToken}`);
  assert.equal(me1.status, 200);
  assert.equal(me1.body.data.companyName, 'Zenith Dynamics');
  assert.equal(me1.body.data.companyId, 'COMP-0001');

  const me2 = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${login2.body.data.sessionToken}`);
  assert.equal(me2.status, 200);
  assert.equal(me2.body.data.companyName, 'Zenith Dynamics');
  assert.equal(me2.body.data.companyId, 'COMP-0001');
});

test('4. Recruiter listing, editing, activation/deactivation, and deletion work correctly', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create Company
  const regRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Omni Consumer Products',
      industryType: 'Defense',
      hrRecruiterName: 'Richard Jones',
      email: 'richard@ocp.com',
      yearEstablished: 1987
    });
  const comp = regRes.body.data;
  const primaryId = comp.primaryRecruiterId;

  // Add Secondary Recruiter
  const addRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'bob.morton@ocp.com',
      accountStatus: 'ACTIVE'
    });
  const secId = addRes.body.data._id;

  // A. Listing: GET /api/companies/:id/recruiters
  const listRes = await request(app)
    .get(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.total, 2);
  const items = listRes.body.data.items;
  const primItem = items.find((r) => r.isPrimary);
  const secItem = items.find((r) => !r.isPrimary);
  assert.ok(primItem);
  assert.equal(primItem.email, 'richard@ocp.com');
  assert.equal(primItem.name, 'Richard Jones');
  assert.ok(secItem);
  assert.equal(secItem.email, 'bob.morton@ocp.com');

  // B. Editing: PUT /api/companies/:id/recruiters/:recruiterId (update email)
  const editRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${secId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'robert.morton@ocp.com'
    });
  assert.equal(editRes.status, 200);
  assert.equal(editRes.body.data.email, 'robert.morton@ocp.com');

  // C. Deactivation of secondary recruiter
  const deactRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${secId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      accountStatus: 'INACTIVE'
    });
  assert.equal(deactRes.status, 200);
  assert.equal(deactRes.body.data.accountStatus, 'INACTIVE');

  // Reactivate secondary recruiter
  const reactRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${secId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      accountStatus: 'ACTIVE'
    });
  assert.equal(reactRes.status, 200);
  assert.equal(reactRes.body.data.accountStatus, 'ACTIVE');

  // D. Safe primary deactivation: deactivating primary automatically promotes other active recruiter
  const deactPrimRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${primaryId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      accountStatus: 'INACTIVE'
    });
  assert.equal(deactPrimRes.status, 200);

  // Verify secId was promoted to primary
  let compDb = await Company.findById(comp._id);
  assert.equal(String(compDb.primaryRecruiterId), String(secId));
  assert.equal(String(compDb.userId), String(secId));

  // Now secId is the sole active recruiter. Attempting to deactivate it when no other active recruiter exists is blocked!
  const deactLastActiveRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${secId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      accountStatus: 'INACTIVE'
    });
  assert.equal(deactLastActiveRes.status, 400);
  assert.equal(deactLastActiveRes.body.error.code, 'CANNOT_DEACTIVATE_PRIMARY_RECRUITER');

  // E. Deletion: DELETE /api/companies/:id/recruiters/:recruiterId
  // Delete the inactive recruiter (primaryId)
  const delRes = await request(app)
    .delete(`/api/companies/${comp._id}/recruiters/${primaryId}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(delRes.status, 200);

  const deletedUser = await User.findById(primaryId);
  assert.equal(deletedUser, null);
});

test('5. Primary recruiter reassignment preserves both company references', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create Company with Recruiter A
  const regRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Wayne Enterprises',
      industryType: 'Defense & Tech',
      hrRecruiterName: 'Bruce Wayne',
      email: 'bruce@wayne.com',
      yearEstablished: 1939
    });
  const comp = regRes.body.data;
  const recruiterAId = comp.primaryRecruiterId;

  // Add Recruiter B
  const addRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'lucius@wayne.com',
      accountStatus: 'ACTIVE'
    });
  const recruiterBId = addRes.body.data._id;

  // A. Reassign primary to Recruiter B via edit
  const promoteRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${recruiterBId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      isPrimary: true
    });
  assert.equal(promoteRes.status, 200);
  assert.equal(promoteRes.body.data.isPrimary, true);

  // Both primaryRecruiterId and userId must match Recruiter B
  let dbComp = await Company.findById(comp._id);
  assert.equal(String(dbComp.primaryRecruiterId), String(recruiterBId));
  assert.equal(String(dbComp.userId), String(recruiterBId));

  // B. Deleting primary recruiter (Recruiter B) safely reassigns primary back to Recruiter A
  const delBRes = await request(app)
    .delete(`/api/companies/${comp._id}/recruiters/${recruiterBId}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(delBRes.status, 200);

  dbComp = await Company.findById(comp._id);
  assert.equal(String(dbComp.primaryRecruiterId), String(recruiterAId));
  assert.equal(String(dbComp.userId), String(recruiterAId));

  // C. Cannot delete the sole remaining recruiter
  const delLastRes = await request(app)
    .delete(`/api/companies/${comp._id}/recruiters/${recruiterAId}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(delLastRes.status, 400);
  assert.equal(delLastRes.body.error.code, 'CANNOT_DELETE_LAST_RECRUITER');
});

test('6. Duplicate emails, invalid roles, unauthorized access, and cross-company access are rejected', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create Company 1
  const comp1Res = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Umbrella Corp',
      industryType: 'Bio-engineering',
      hrRecruiterName: 'Albert Wesker',
      email: 'wesker@umbrella.com',
      yearEstablished: 1998
    });
  const comp1 = comp1Res.body.data;

  // Create Company 2
  const comp2Res = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Tricell Inc',
      industryType: 'Pharmaceuticals',
      hrRecruiterName: 'Excella Gionne',
      email: 'excella@tricell.com',
      yearEstablished: 2003
    });
  const comp2 = comp2Res.body.data;

  // Add Recruiter to Company 1
  const rec1Res = await request(app)
    .post(`/api/companies/${comp1._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'william.birkin@umbrella.com',
      accountStatus: 'ACTIVE'
    });
  const rec1Id = rec1Res.body.data._id;

  // A. Duplicate Email on Add Recruiter -> rejected with 409
  const dupEmailAdd = await request(app)
    .post(`/api/companies/${comp1._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'WESKER@UMBRELLA.COM',
      accountStatus: 'ACTIVE'
    });
  assert.equal(dupEmailAdd.status, 409);
  assert.equal(dupEmailAdd.body.error.code, 'EMAIL_EXISTS');

  // B. Duplicate Email on Edit Recruiter -> rejected with 409
  const dupEmailEdit = await request(app)
    .put(`/api/companies/${comp1._id}/recruiters/${rec1Id}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'wesker@umbrella.com'
    });
  assert.equal(dupEmailEdit.status, 409);
  assert.equal(dupEmailEdit.body.error.code, 'EMAIL_EXISTS');

  // C. Invalid role on Add / Update Recruiter -> rejected with 400 INVALID_ROLE
  const invalidRoleAdd = await request(app)
    .post(`/api/companies/${comp1._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'nemesis@umbrella.com',
      roleId: 'ROLE_STUDENT'
    });
  assert.equal(invalidRoleAdd.status, 400);
  assert.equal(invalidRoleAdd.body.error.code, 'INVALID_ROLE');

  // D. Cross-Company Access: Trying to update or delete Company 1 recruiter via Company 2 route -> 403 RECRUITER_MISMATCH
  const crossUpdate = await request(app)
    .put(`/api/companies/${comp2._id}/recruiters/${rec1Id}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'hacked@umbrella.com'
    });
  assert.equal(crossUpdate.status, 403);
  assert.equal(crossUpdate.body.error.code, 'RECRUITER_MISMATCH');

  const crossDelete = await request(app)
    .delete(`/api/companies/${comp2._id}/recruiters/${rec1Id}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(crossDelete.status, 403);
  assert.equal(crossDelete.body.error.code, 'RECRUITER_MISMATCH');

  // E. Unauthorized Access: Student attempting to manage recruiters -> 403 Forbidden
  const student = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');
  const studentAdd = await request(app)
    .post(`/api/companies/${comp1._id}/recruiters`)
    .set('Authorization', `Bearer ${student.token}`)
    .send({
      email: 'intruder@umbrella.com'
    });
  assert.equal(studentAdd.status, 403);

  // F. Cannot delete self
  const cannotDelSelf = await request(app)
    .delete(`/api/companies/${comp1._id}/recruiters/${admin.user._id}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(cannotDelSelf.status, 400);
  assert.equal(cannotDelSelf.body.error.code, 'CANNOT_DELETE_SELF');

  // G. Inactive recruiter cannot be promoted to primary
  const inactAdd = await request(app)
    .post(`/api/companies/${comp1._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'inactive.recruiter@umbrella.com',
      accountStatus: 'INACTIVE'
    });
  const inactId = inactAdd.body.data._id;

  const promoteInactive = await request(app)
    .put(`/api/companies/${comp1._id}/recruiters/${inactId}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      isPrimary: true
    });
  assert.equal(promoteInactive.status, 400);
  assert.equal(promoteInactive.body.error.code, 'INELIGIBLE_PRIMARY_RECRUITER');
});

test('7. Existing company login and company-management workflows remain compatible', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // 1. Create company via standard flow
  const compRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Pied Piper Silicon Valley',
      industryType: 'Compression Tech',
      hrRecruiterName: 'Richard Hendricks',
      email: 'richard@piedpiper.com',
      yearEstablished: 2014
    });
  assert.equal(compRes.status, 201);
  const comp = compRes.body.data;

  // 2. Set credentials and verify recruiter login
  const recruiter = await User.findById(comp.primaryRecruiterId);
  recruiter.passwordHash = await hashPassword('MiddleOutCompression!99');
  await recruiter.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'richard@piedpiper.com',
      password: 'MiddleOutCompression!99'
    });
  assert.equal(loginRes.status, 200);
  const token = loginRes.body.data.sessionToken;

  // 3. Authenticated recruiter reads /api/companies/me
  const profileRes = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.data.companyName, 'Pied Piper Silicon Valley');
  assert.equal(profileRes.body.data.companyId, 'COMP-0001');

  // 4. Authenticated recruiter updates profile
  const updateRes = await request(app)
    .put('/api/companies/me')
    .set('Authorization', `Bearer ${token}`)
    .send({
      description: 'The premier lossless compression platform.'
    });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.data.description, 'The premier lossless compression platform.');

  // 5. Admin lists companies: company profile retains compatibility with legacy userId and primaryRecruiterId
  const listRes = await request(app)
    .get('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(listRes.status, 200);
  const found = listRes.body.data.items.find((c) => c.companyName === 'Pied Piper Silicon Valley');
  assert.ok(found);
  assert.equal(found.companyId, 'COMP-0001');
  assert.equal(String(found.primaryRecruiterId), String(found.userId));
});
