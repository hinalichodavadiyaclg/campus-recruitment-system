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
  { hashPassword, verifyPassword },
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

test('Workflow 1: Create Company creates one company and its initial recruiter account with secure credential setup', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Exact payload matching CompanyModal.jsx form submission
  const createCompanyPayload = {
    companyName: 'Quantum Horizons Tech',
    industryType: 'Quantum Computing',
    hrRecruiterName: 'Dr. Evelyn Shaw',
    designation: 'Chief Talent Partner',
    email: 'evelyn@quantumhorizons.com',
    mobileNumber: '+91 9876543210',
    yearEstablished: 2022,
    website: 'https://quantumhorizons.com',
    officeAddress: 'Tower 4, Science Park',
    description: 'Next-generation quantum simulation algorithms'
  };

  const res = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send(createCompanyPayload);

  // 1. API Response Verification
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  const createdCompany = res.body.data;

  assert.equal(createdCompany.companyName, 'Quantum Horizons Tech');
  assert.equal(createdCompany.companyId, 'COMP-0001');
  assert.equal(createdCompany.hrRecruiterName, 'Dr. Evelyn Shaw');
  assert.equal(createdCompany.designation, 'Chief Talent Partner');
  assert.equal(createdCompany.email, 'evelyn@quantumhorizons.com');
  assert.equal(createdCompany.mobileNumber, '+91 9876543210');
  assert.ok(createdCompany.primaryRecruiterId);
  assert.ok(createdCompany.userId);
  assert.equal(String(createdCompany.primaryRecruiterId), String(createdCompany.userId));

  // Credential setup: temporary password securely generated and delivered in response
  assert.ok(createdCompany.temporaryPassword);
  const tempPassword = createdCompany.temporaryPassword;

  // 2. Database Record Verification
  const companyDocs = await Company.find({}).lean();
  assert.equal(companyDocs.length, 1, 'Exactly one company document must exist');
  const dbCompany = companyDocs[0];
  assert.equal(dbCompany.companyId, 'COMP-0001');
  assert.equal(dbCompany.companyName, 'Quantum Horizons Tech');
  assert.equal(dbCompany.email, 'evelyn@quantumhorizons.com');
  assert.equal(String(dbCompany.primaryRecruiterId), String(dbCompany.userId));

  const recruiterDocs = await User.find({ userType: 'COMPANY' }).select('+passwordHash').lean();
  assert.equal(recruiterDocs.length, 1, 'Exactly one recruiter user document must exist');
  const dbRecruiter = recruiterDocs[0];

  assert.equal(dbRecruiter.email, 'evelyn@quantumhorizons.com');
  assert.equal(dbRecruiter.userType, 'COMPANY');
  assert.equal(dbRecruiter.roleId, ROLE_IDS.COMPANY);
  assert.equal(dbRecruiter.accountStatus, 'ACTIVE');
  assert.equal(String(dbRecruiter.companyId), String(dbCompany._id));
  assert.equal(String(dbRecruiter._id), String(dbCompany.primaryRecruiterId));

  // Security check: password is hashed with bcrypt, plaintext is never stored
  assert.notEqual(dbRecruiter.passwordHash, tempPassword);
  const isMatch = await verifyPassword(tempPassword, dbRecruiter.passwordHash);
  assert.equal(isMatch, true, 'Stored hash must match temporary password');

  // 3. Functional Login Flow Verification
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'evelyn@quantumhorizons.com',
      password: tempPassword
    });

  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.body.data.sessionToken);
  assert.equal(loginRes.body.data.user.email, 'evelyn@quantumhorizons.com');
  assert.equal(loginRes.body.data.user.companyId, String(createdCompany._id));

  // Verify access to company profile with the new session
  const profileRes = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${loginRes.body.data.sessionToken}`);

  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.data.companyName, 'Quantum Horizons Tech');
  assert.equal(profileRes.body.data.companyId, 'COMP-0001');
});

test('Workflow 2: Add Recruiter creates an additional recruiter without creating a new company or changing company ID', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Setup: Existing company
  const compRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Stellar Aerospace',
      industryType: 'Aerospace',
      hrRecruiterName: 'Col. Chris Hadfield',
      designation: 'Director of Talent',
      email: 'chris@stellar-aero.com',
      mobileNumber: '+91 9123456789',
      yearEstablished: 2016
    });
  assert.equal(compRes.status, 201);
  const company = compRes.body.data;
  const originalCompanyId = company.companyId; // COMP-0001
  const initialPrimaryRecruiterId = company.primaryRecruiterId;

  // A. Add Recruiter with Custom Password and Full Recruiter Details
  const addRecruiterPayload = {
    hrRecruiterName: 'David Chen',
    designation: 'Campus Talent Acquisition Lead',
    email: 'david.chen@stellar-aero.com',
    mobileNumber: '+91 9876543211',
    password: 'DavidChenSecurePass2026!',
    accountStatus: 'ACTIVE'
  };

  const addRes = await request(app)
    .post(`/api/companies/${company._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send(addRecruiterPayload);

  assert.equal(addRes.status, 201);
  const addedRecruiter = addRes.body.data;
  assert.equal(addedRecruiter.email, 'david.chen@stellar-aero.com');
  assert.equal(addedRecruiter.name, 'David Chen');
  assert.equal(addedRecruiter.designation, 'Campus Talent Acquisition Lead');
  assert.equal(addedRecruiter.mobileNumber, '+91 9876543211');
  assert.equal(addedRecruiter.accountStatus, 'ACTIVE');
  assert.equal(addedRecruiter.isPrimary, false);
  assert.equal(addedRecruiter.companyId, String(company._id));

  // Critical Invariant Checks:
  // 1. Company count remains exactly 1 (ZERO extra companies created)
  const totalCompaniesAfterAdd = await Company.countDocuments();
  assert.equal(totalCompaniesAfterAdd, 1);

  // 2. Company business ID (COMP-0001) is unchanged
  const refreshedCompany = await Company.findById(company._id).lean();
  assert.equal(refreshedCompany.companyId, originalCompanyId);

  // 3. Primary recruiter remains original recruiter
  assert.equal(String(refreshedCompany.primaryRecruiterId), String(initialPrimaryRecruiterId));
  assert.equal(String(refreshedCompany.userId), String(initialPrimaryRecruiterId));

  // 4. Two recruiters now exist, both sharing the exact same companyId ObjectId
  const companyRecruiters = await User.find({ companyId: company._id }).select('+passwordHash').lean();
  assert.equal(companyRecruiters.length, 2);
  const davidDoc = companyRecruiters.find((r) => r.email === 'david.chen@stellar-aero.com');
  assert.ok(davidDoc);
  assert.equal(davidDoc.userType, 'COMPANY');
  assert.equal(davidDoc.roleId, ROLE_IDS.COMPANY);

  // 5. Credential security: custom password securely hashed
  assert.notEqual(davidDoc.passwordHash, 'DavidChenSecurePass2026!');
  const davidPassMatch = await verifyPassword('DavidChenSecurePass2026!', davidDoc.passwordHash);
  assert.equal(davidPassMatch, true);

  // 6. Login check for the newly added recruiter
  const davidLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'david.chen@stellar-aero.com',
      password: 'DavidChenSecurePass2026!'
    });
  assert.equal(davidLoginRes.status, 200);
  assert.ok(davidLoginRes.body.data.sessionToken);

  const davidProfile = await request(app)
    .get('/api/companies/me')
    .set('Authorization', `Bearer ${davidLoginRes.body.data.sessionToken}`);
  assert.equal(davidProfile.status, 200);
  assert.equal(davidProfile.body.data.companyName, 'Stellar Aerospace');
  assert.equal(davidProfile.body.data.companyId, 'COMP-0001');

  // B. Add Recruiter with Auto-Generated Password (password omitted)
  const autoPassPayload = {
    hrRecruiterName: 'Rachel Adams',
    designation: 'Senior Technical Recruiter',
    email: 'rachel.adams@stellar-aero.com',
    mobileNumber: '+91 9876543212',
    accountStatus: 'ACTIVE'
  };

  const autoPassRes = await request(app)
    .post(`/api/companies/${company._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send(autoPassPayload);

  assert.equal(autoPassRes.status, 201);
  const rachelRecruiter = autoPassRes.body.data;
  assert.equal(rachelRecruiter.name, 'Rachel Adams');
  assert.ok(rachelRecruiter.temporaryPassword, 'Must return temporary password when auto-generated');
  const rachelTempPass = rachelRecruiter.temporaryPassword;

  // Rachel can log in with auto-generated temporary password
  const rachelLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'rachel.adams@stellar-aero.com',
      password: rachelTempPass
    });
  assert.equal(rachelLoginRes.status, 200);

  // Company count is STILL exactly 1
  const finalCompanyCount = await Company.countDocuments();
  assert.equal(finalCompanyCount, 1);

  // C. Recruiter List Display Verification
  const listRecruitersRes = await request(app)
    .get(`/api/companies/${company._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`);

  assert.equal(listRecruitersRes.status, 200);
  assert.equal(listRecruitersRes.body.data.total, 3);
  const items = listRecruitersRes.body.data.items;

  // Verify fields: name, email, accountStatus, isPrimary
  const chrisItem = items.find((r) => r.email === 'chris@stellar-aero.com');
  const davidItem = items.find((r) => r.email === 'david.chen@stellar-aero.com');
  const rachelItem = items.find((r) => r.email === 'rachel.adams@stellar-aero.com');

  assert.equal(chrisItem.name, 'Col. Chris Hadfield');
  assert.equal(chrisItem.isPrimary, true);
  assert.equal(chrisItem.accountStatus, 'ACTIVE');

  assert.equal(davidItem.isPrimary, false);
  assert.equal(davidItem.accountStatus, 'ACTIVE');

  assert.equal(rachelItem.isPrimary, false);
  assert.equal(rachelItem.accountStatus, 'ACTIVE');
});

test('Workflow 3: Required-field validation, duplicate email rejection, and company relationship integrity for Add Recruiter', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Create base company
  const compRes = await request(app)
    .post('/api/companies')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      companyName: 'Nova Prime Tech',
      industryType: 'Artificial Intelligence',
      hrRecruiterName: 'Elena Gilbert',
      designation: 'Head of Recruitment',
      email: 'elena@novaprime.com',
      mobileNumber: '+91 9988776655',
      yearEstablished: 2020
    });
  const comp = compRes.body.data;

  // 1. Missing / invalid email is rejected
  const missingEmailRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Stefan Salvatore',
      designation: 'Talent Lead',
      mobileNumber: '+91 9876543210'
      // email omitted
    });
  assert.equal(missingEmailRes.status, 400);

  const invalidEmailRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Stefan Salvatore',
      designation: 'Talent Lead',
      email: 'not-an-email',
      mobileNumber: '+91 9876543210'
    });
  assert.equal(invalidEmailRes.status, 400);

  // 2. Duplicate email with existing primary recruiter is rejected with 409 EMAIL_EXISTS
  const dupPrimaryEmailRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Elena Copy',
      designation: 'Talent Lead',
      email: 'ELENA@NOVAPRIME.COM', // case-insensitive check
      mobileNumber: '+91 9876543210'
    });
  assert.equal(dupPrimaryEmailRes.status, 409);
  assert.equal(dupPrimaryEmailRes.body.error.code, 'EMAIL_EXISTS');

  // 3. Valid recruiter creation
  const validRecRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Damon Salvatore',
      designation: 'Senior Technical Sourcer',
      email: 'damon@novaprime.com',
      mobileNumber: '+91 9876543210',
      accountStatus: 'ACTIVE'
    });
  assert.equal(validRecRes.status, 201);

  // 4. Duplicate email with existing secondary recruiter is rejected with 409
  const dupSecEmailRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Damon Imposter',
      designation: 'Sourcer',
      email: 'damon@novaprime.com',
      mobileNumber: '+91 9876543219'
    });
  assert.equal(dupSecEmailRes.status, 409);
  assert.equal(dupSecEmailRes.body.error.code, 'EMAIL_EXISTS');

  // 5. Create recruiter without mobileNumber (optional) and without explicit accountStatus (defaults to ACTIVE)
  const noMobileRecRes = await request(app)
    .post(`/api/companies/${comp._id}/recruiters`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Bonnie Bennett',
      designation: 'Tech Lead Recruiter',
      email: 'bonnie@novaprime.com'
      // mobileNumber omitted -> optional
    });
  assert.equal(noMobileRecRes.status, 201);
  assert.equal(noMobileRecRes.body.data.accountStatus, 'ACTIVE');

  // 6. Edit recruiter updating all fields: hrRecruiterName, designation, email, mobileNumber, accountStatus
  const editRecRes = await request(app)
    .put(`/api/companies/${comp._id}/recruiters/${validRecRes.body.data._id}`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({
      hrRecruiterName: 'Damon Salvatore Senior',
      designation: 'Principal Talent Lead',
      email: 'damon.senior@novaprime.com',
      mobileNumber: '+91 9123456780',
      accountStatus: 'INACTIVE'
    });
  assert.equal(editRecRes.status, 200);
  assert.equal(editRecRes.body.data.name, 'Damon Salvatore Senior');
  assert.equal(editRecRes.body.data.designation, 'Principal Talent Lead');
  assert.equal(editRecRes.body.data.email, 'damon.senior@novaprime.com');
  assert.equal(editRecRes.body.data.mobileNumber, '+91 9123456780');
  assert.equal(editRecRes.body.data.accountStatus, 'INACTIVE');

  // 7. Relationship integrity check:
  // - Company count remains exactly 1
  assert.equal(await Company.countDocuments(), 1);
  // - Company companyId remains COMP-0001
  const refreshedComp = await Company.findById(comp._id).lean();
  assert.equal(refreshedComp.companyId, 'COMP-0001');
  // - All 3 recruiters reference the exact same companyId ObjectId
  const recruiters = await User.find({ companyId: comp._id }).lean();
  assert.equal(recruiters.length, 3);
  recruiters.forEach((r) => {
    assert.equal(String(r.companyId), String(comp._id));
    assert.equal(r.userType, 'COMPANY');
    assert.equal(r.roleId, ROLE_IDS.COMPANY);
  });
});

