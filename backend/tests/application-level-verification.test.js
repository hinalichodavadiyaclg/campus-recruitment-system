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
  { ROLE_IDS },
  importService
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/company.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js'),
  import('../src/services/import.service.js')
]);

let mongo;
let app;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT', linkedCompanyId = null) {
  const ts = Date.now() + Math.floor(Math.random() * 10000);
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

test('1. Company creation via API generates unique COMP-XXXX ID, sets primaryRecruiterId and userId dual-sync', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create First Company
  const res1 = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Acme Robotics',
      industryType: 'Robotics',
      hrRecruiterName: 'Alice Johnson',
      email: 'alice@acme.com',
      yearEstablished: 2020,
      description: 'Cutting edge robotics',
      mobileNumber: '+91 9876543210'
    });

  assert.equal(res1.status, 201);
  assert.equal(res1.body.success, true);
  const c1 = res1.body.data;
  assert.equal(c1.companyId, 'COMP-0001');
  assert.ok(c1.primaryRecruiterId);
  assert.equal(String(c1.primaryRecruiterId), String(c1.userId));

  // Create Second Company -> verifies sequential increment
  const res2 = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Beta Cloud Systems',
      industryType: 'Cloud',
      hrRecruiterName: 'Bob Vance',
      email: 'bob@betacloud.com',
      yearEstablished: 2018
    });

  assert.equal(res2.status, 201);
  const c2 = res2.body.data;
  assert.equal(c2.companyId, 'COMP-0002');
  assert.ok(c2.primaryRecruiterId);
});

test('2. Application endpoints (Companies list, Users list, Profile, Recruiters) return and display companyId', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create Company
  const createRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Cyberdyne Systems',
      industryType: 'AI',
      hrRecruiterName: 'Miles Dyson',
      email: 'miles@cyberdyne.com',
      yearEstablished: 2010
    });
  const comp = createRes.body.data;

  // A. GET /api/companies (Companies list page)
  const listRes = await request(app)
    .get('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.items[0].companyId, 'COMP-0001');

  // B. GET /api/users?userType=COMPANY (Company tab in User Management)
  const userListRes = await request(app)
    .get('/api/users?userType=COMPANY')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(userListRes.status, 200);
  const recruiterUser = userListRes.body.data.items[0];
  assert.equal(recruiterUser.companyBusinessId, 'COMP-0001');
  assert.equal(recruiterUser.companyId, String(comp._id)); // Preserves Mongo ObjectId for relational integrity

  // C. GET /api/companies/me (Company profile page)
  const recruiterSession = await createAuthenticatedSession(ROLE_IDS.COMPANY, 'COMPANY', comp._id);
  // Also link recruiter to company primary
  await Company.findByIdAndUpdate(comp._id, { primaryRecruiterId: recruiterSession.user._id, userId: recruiterSession.user._id });

  const profileRes = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${recruiterSession.token}`);
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.data.companyId, 'COMP-0001');

  // D. GET /api/companies/:id/recruiters (Recruiter management)
  const recruitersRes = await request(app)
    .get(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(recruitersRes.status, 200);
  assert.equal(recruitersRes.body.data.businessCompanyId, 'COMP-0001');
  assert.equal(recruitersRes.body.data.total, 2);
});

test('3. Recruiter CRUD, primary designation, and automatic safe primary reassignment', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create Company with initial primary recruiter
  const compRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Initech Global',
      industryType: 'Software',
      hrRecruiterName: 'Peter Gibbons',
      email: 'peter@initech.com',
      yearEstablished: 1999
    });
  const comp = compRes.body.data;
  const initialPrimaryRecruiterId = comp.primaryRecruiterId;

  // A. Create Secondary Recruiter (POST /:id/recruiters)
  const createRecRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      email: 'samir@initech.com',
      password: 'Password@123',
      accountStatus: 'ACTIVE'
    });
  assert.equal(createRecRes.status, 201);
  const secRecruiter = createRecRes.body.data;
  assert.equal(secRecruiter.isPrimary, false);
  assert.equal(secRecruiter.companyId, String(comp._id));

  // B. Edit Recruiter & promote to Primary (PUT /:id/recruiters/:recruiterId)
  const promoteRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${secRecruiter._id}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      isPrimary: true
    });
  assert.equal(promoteRes.status, 200);
  assert.equal(promoteRes.body.data.isPrimary, true);

  // Verify company document dual-synced primaryRecruiterId and userId to secRecruiter
  let updatedComp = await Company.findById(comp._id).lean();
  assert.equal(String(updatedComp.primaryRecruiterId), String(secRecruiter._id));
  assert.equal(String(updatedComp.userId), String(secRecruiter._id));

  // C. Delete Recruiter: Primary deletion automatically reassigns back to remaining recruiter
  const delRes = await request(app)
    .delete(`/api/companies/${comp._id}/recruiters/${secRecruiter._id}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(delRes.status, 200);

  updatedComp = await Company.findById(comp._id).lean();
  assert.equal(String(updatedComp.primaryRecruiterId), String(initialPrimaryRecruiterId));
  assert.equal(String(updatedComp.userId), String(initialPrimaryRecruiterId));

  // D. Guard: Cannot delete the last remaining recruiter
  const delLastRes = await request(app)
    .delete(`/api/companies/${comp._id}/recruiters/${initialPrimaryRecruiterId}`)
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(delLastRes.status, 400);
  assert.equal(delLastRes.body.error.code, 'CANNOT_DELETE_LAST_RECRUITER');
});

test('4. Duplicate company names and emails return specific, field-level errors independently', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Seed baseline company
  await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Stark Industries',
      industryType: 'Defense',
      hrRecruiterName: 'Pepper Potts',
      email: 'pepper@stark.com',
      yearEstablished: 2008
    });

  // A. Duplicate Email Only
  const dupEmailRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Hammer Advanced Industries',
      industryType: 'Defense',
      hrRecruiterName: 'Justin Hammer',
      email: 'PEPPER@STARK.COM', // Case-insensitive duplicate email
      yearEstablished: 2010
    });
  assert.equal(dupEmailRes.status, 409);
  assert.equal(dupEmailRes.body.error.code, 'EMAIL_EXISTS');
  assert.ok(dupEmailRes.body.error.details?.email);
  assert.equal(dupEmailRes.body.error.details?.companyName, undefined);

  // B. Duplicate Company Name Only
  const dupNameRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'STARK INDUSTRIES', // Case-insensitive duplicate name
      industryType: 'Tech',
      hrRecruiterName: 'Tony Stark',
      email: 'tony@stark.com', // Unique email
      yearEstablished: 2008
    });
  assert.equal(dupNameRes.status, 409);
  assert.equal(dupNameRes.body.error.code, 'COMPANY_NAME_EXISTS');
  assert.ok(dupNameRes.body.error.details?.companyName);
  assert.equal(dupNameRes.body.error.details?.email, undefined);

  // C. Both Duplicates Together -> verifies independent parallel execution and multi-field error details
  const dupBothRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'stark industries',
      industryType: 'Tech',
      hrRecruiterName: 'Pepper Potts',
      email: 'pepper@stark.com',
      yearEstablished: 2008
    });
  assert.equal(dupBothRes.status, 409);
  assert.equal(dupBothRes.body.error.code, 'DUPLICATE_ENTRY');
  assert.ok(dupBothRes.body.error.details?.email);
  assert.ok(dupBothRes.body.error.details?.companyName);
});

test('5. Excel bulk import allocates sequential companyId and links recruiter accounts', async () => {
  const importRows = [
    {
      companyName: 'Oscorp Technologies',
      industryType: 'Biotech',
      hrRecruiterName: 'Norman Osborn',
      email: 'norman@oscorp.com',
      yearEstablished: 2002,
      website: 'https://oscorp.com',
      designation: 'CEO'
    },
    {
      companyName: 'Daily Bugle Press',
      industryType: 'Media',
      hrRecruiterName: 'J. Jonah Jameson',
      email: 'jjj@dailybugle.com',
      yearEstablished: 1995,
      website: 'https://dailybugle.com',
      designation: 'Publisher'
    }
  ];

  const importResult = await importService.confirmImport('company', importRows);
  assert.equal(importResult.importedCount, 2);

  const c1 = await Company.findOne({ companyName: 'Oscorp Technologies' }).lean();
  const c2 = await Company.findOne({ companyName: 'Daily Bugle Press' }).lean();

  assert.equal(c1.companyId, 'COMP-0001');
  assert.ok(c1.primaryRecruiterId);
  assert.equal(String(c1.primaryRecruiterId), String(c1.userId));

  assert.equal(c2.companyId, 'COMP-0002');
  assert.ok(c2.primaryRecruiterId);
  assert.equal(String(c2.primaryRecruiterId), String(c2.userId));

  // Recruiter users verification
  const u1 = await User.findById(c1.primaryRecruiterId).lean();
  assert.equal(u1.email, 'norman@oscorp.com');
  assert.equal(u1.userType, 'COMPANY');
  assert.equal(String(u1.companyId), String(c1._id));
});
