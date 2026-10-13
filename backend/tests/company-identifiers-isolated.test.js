import assert from 'node:assert/strict';
import test, { before, after, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Company } from '../src/models/company.model.js';
import { User } from '../src/models/user.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import {
  getNextCandidateCompanyId,
  executeWithCompanyIdRetry,
  formatCompanyId
} from '../src/utils/company-id.js';
import {
  validateRecruiterCandidate,
  runMigration,
  runRollback
} from '../src/scripts/migrate-company-identifiers.js';
import * as companyService from '../src/services/company.service.js';
import * as userService from '../src/services/user.service.js';
import * as importService from '../src/services/import.service.js';

let mongod;

before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Company.deleteMany({});
  await User.deleteMany({});
});

test('1. Sequential companyId allocation generates formatted COMP-0001 with zero extra collections', async () => {
  const firstId = await getNextCandidateCompanyId();
  assert.equal(firstId, 'COMP-0001');

  // Insert a company with COMP-0001
  await Company.create({
    companyId: 'COMP-0001',
    companyName: 'Acme Corp',
    industryType: 'Technology',
    yearEstablished: 2020,
    hrRecruiterName: 'Alice',
    email: 'alice@acme.com'
  });

  const secondId = await getNextCandidateCompanyId();
  assert.equal(secondId, 'COMP-0002');
});

test('2. Candidate recruiter relationship validation strictly checks userType, roleId, and companyId', async () => {
  const company = await Company.create({
    companyName: 'Globex Inc',
    industryType: 'Finance',
    yearEstablished: 2018,
    hrRecruiterName: 'Bob',
    email: 'bob@globex.com'
  });

  // Valid recruiter
  const validUser = await User.create({
    email: 'recruiter@globex.com',
    passwordHash: 'hash',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: company._id,
    accountStatus: 'ACTIVE'
  });

  const validRes = await validateRecruiterCandidate(validUser._id, company._id);
  assert.equal(validRes.valid, true);

  // Invalid: student userType
  const studentUser = await User.create({
    universityId: 'STU-TEST-001',
    email: 'student@example.com',
    passwordHash: 'hash',
    userType: 'STUDENT',
    roleId: 'ROLE_STUDENT',
    companyId: company._id,
    accountStatus: 'ACTIVE'
  });
  const studentRes = await validateRecruiterCandidate(studentUser._id, company._id);
  assert.equal(studentRes.valid, false);
  assert.match(studentRes.reason, /INVALID_USER_TYPE/);

  // Invalid: mismatched companyId
  const otherCompany = await Company.create({
    companyName: 'Other Corp',
    industryType: 'Retail',
    yearEstablished: 2015,
    hrRecruiterName: 'Dave',
    email: 'dave@other.com'
  });
  const mismatchRes = await validateRecruiterCandidate(validUser._id, otherCompany._id);
  assert.equal(mismatchRes.valid, false);
  assert.match(mismatchRes.reason, /COMPANY_MISMATCH/);
});

test('3. Migration dry-run verifies actions without modifying database', async () => {
  const company = await Company.create({
    companyName: 'Wayne Enterprises',
    industryType: 'Defense',
    yearEstablished: 2005,
    hrRecruiterName: 'Lucius',
    email: 'lucius@wayne.com'
  });

  const recruiter = await User.create({
    email: 'hr@wayne.com',
    passwordHash: 'hash',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: company._id,
    accountStatus: 'ACTIVE'
  });

  company.userId = recruiter._id;
  await company.save();

  const report = await runMigration({ dryRun: true, allowLiveDb: true });
  assert.equal(report.status, 'DRY_RUN_COMPLETED');
  assert.equal(report.migratedCount, 1);

  // Check company in DB was NOT changed
  const fresh = await Company.findById(company._id).lean();
  assert.equal(fresh.companyId, undefined);
  assert.equal(fresh.primaryRecruiterId, undefined);
  assert.equal(String(fresh.userId), String(recruiter._id));
});

test('4. Migration applies identifiers, writes manifest, and is fully resumable/idempotent', async () => {
  const company = await Company.create({
    companyName: 'Stark Industries',
    industryType: 'Engineering',
    yearEstablished: 2008,
    hrRecruiterName: 'Pepper',
    email: 'pepper@stark.com'
  });

  const recruiter = await User.create({
    email: 'pepper@stark.com',
    passwordHash: 'hash',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: company._id,
    accountStatus: 'ACTIVE'
  });

  company.userId = recruiter._id;
  await company.save();

  // Run migration
  const report1 = await runMigration({ dryRun: false, allowLiveDb: true });
  assert.equal(report1.status, 'COMPLETED');
  assert.equal(report1.migratedCount, 1);

  const migrated = await Company.findById(company._id).lean();
  assert.equal(migrated.companyId, 'COMP-0001');
  assert.equal(String(migrated.primaryRecruiterId), String(recruiter._id));
  assert.equal(String(migrated.userId), String(recruiter._id)); // Legacy preserved

  // Re-run migration: should be a clean no-op (resumable)
  const report2 = await runMigration({ dryRun: false, allowLiveDb: true });
  assert.equal(report2.alreadyMigratedCount, 1);
  assert.equal(report2.migratedCount, 0);
});

test('5. Surgical rollback restores original state and aborts on conflict', async () => {
  const company = await Company.create({
    companyName: 'Cyberdyne Systems',
    industryType: 'Robotics',
    yearEstablished: 2010,
    hrRecruiterName: 'Miles',
    email: 'miles@cyberdyne.com'
  });

  const recruiter = await User.create({
    email: 'miles@cyberdyne.com',
    passwordHash: 'hash',
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: company._id,
    accountStatus: 'ACTIVE'
  });
  company.userId = recruiter._id;
  await company.save();

  const migrationReport = await runMigration({ dryRun: false, allowLiveDb: true });
  assert.equal(migrationReport.status, 'COMPLETED');

  // Verify fields applied
  let doc = await Company.findById(company._id).lean();
  assert.equal(doc.companyId, 'COMP-0001');

  // Rollback using manifest
  const rollbackReport = await runRollback({ manifestPath: migrationReport.manifestPath });
  assert.equal(rollbackReport.status, 'ROLLED_BACK');
  assert.equal(rollbackReport.rolledBackCount, 1);

  // Verify fields unset, but original record intact
  doc = await Company.findById(company._id).lean();
  assert.equal(doc.companyId, undefined);
  assert.equal(doc.primaryRecruiterId, undefined);
  assert.equal(String(doc.userId), String(recruiter._id));
  assert.equal(doc.companyName, 'Cyberdyne Systems');
});

test('6. Company service dual-syncs primaryRecruiterId and userId, and reassigns on deletion', async () => {
  const created = await companyService.createCompany({
    companyName: 'Initech',
    industryType: 'Software',
    hrRecruiterName: 'Peter',
    email: 'peter@initech.com',
    yearEstablished: 1999
  });

  assert.match(created.companyId, /^COMP-\d{4}$/);
  assert.ok(created.userId);
  assert.ok(created.primaryRecruiterId);
  assert.equal(String(created.userId), String(created.primaryRecruiterId));

  // Add a secondary recruiter
  const secRecruiter = await companyService.createCompanyRecruiter(created._id, {
    email: 'samir@initech.com',
    password: 'Password@123'
  });
  assert.equal(secRecruiter.isPrimary, false);

  // List recruiters
  const list = await companyService.listCompanyRecruiters(created._id);
  assert.equal(list.total, 2);
  assert.equal(list.businessCompanyId, created.companyId);

  // Delete primary recruiter -> verify automatic reassignment to secondary
  await companyService.deleteCompanyRecruiter(created._id, created.primaryRecruiterId, null);

  const updatedCompany = await Company.findById(created._id).lean();
  assert.equal(String(updatedCompany.primaryRecruiterId), String(secRecruiter._id));
  assert.equal(String(updatedCompany.userId), String(secRecruiter._id));
});

test('7. User list service returns companyBusinessId while preserving users.companyId ObjectId', async () => {
  const company = await companyService.createCompany({
    companyName: 'Umbrella Corp',
    industryType: 'Pharma',
    hrRecruiterName: 'Wesker',
    email: 'wesker@umbrella.com',
    yearEstablished: 1998
  });

  const usersRes = await userService.listUsers({ userType: 'COMPANY' });
  assert.equal(usersRes.total, 1);
  const u = usersRes.items[0];

  // Preserves users.companyId as ObjectId string matching company._id
  assert.equal(u.companyId, String(company._id));
  // Returns business company ID
  assert.equal(u.companyBusinessId, company.companyId);
  assert.match(u.companyBusinessId, /^COMP-\d{4}$/);
});

test('8. Excel bulk import assigns sequential companyId (COMP-XXXX) and dual-syncs primaryRecruiterId and userId', async () => {
  const importRows = [
    {
      companyName: 'Wayne Security',
      industryType: 'Defense',
      hrRecruiterName: 'Lucius Fox',
      email: 'lucius@waynesecurity.com',
      yearEstablished: 2012,
      website: 'https://wayne.com',
      designation: 'VP Security'
    },
    {
      companyName: 'Queen Consolidated',
      industryType: 'Technology',
      hrRecruiterName: 'Oliver Queen',
      email: 'oliver@queen.com',
      yearEstablished: 2015,
      website: 'https://queen.com',
      designation: 'Director'
    }
  ];

  const importResult = await importService.confirmImport('company', importRows);
  assert.equal(importResult.importedCount, 2);

  const c1 = await Company.findOne({ companyName: 'Wayne Security' }).lean();
  const c2 = await Company.findOne({ companyName: 'Queen Consolidated' }).lean();

  assert.equal(c1.companyId, 'COMP-0001');
  assert.ok(c1.primaryRecruiterId);
  assert.equal(String(c1.primaryRecruiterId), String(c1.userId));

  assert.equal(c2.companyId, 'COMP-0002');
  assert.ok(c2.primaryRecruiterId);
  assert.equal(String(c2.primaryRecruiterId), String(c2.userId));

  // Verify associated recruiter users
  const u1 = await User.findById(c1.primaryRecruiterId).lean();
  assert.equal(u1.email, 'lucius@waynesecurity.com');
  assert.equal(u1.userType, 'COMPANY');
  assert.equal(String(u1.companyId), String(c1._id));
});

test('9. Concurrent creation handles duplicate candidate collision by re-querying latest maximum ID', async () => {
  let callCount = 0;
  const dummyAction = async () => {
    callCount++;
    if (callCount === 1) {
      // Simulate MongoDB duplicate key error code 11000 on companyId index
      const err = new Error('E11000 duplicate key error collection: companies index: companyId_1 dup key: { companyId: "COMP-0001" }');
      err.code = 11000;
      err.keyPattern = { companyId: 1 };
      // Simulate that another concurrent transaction committed COMP-0001
      await Company.create({
        companyId: 'COMP-0001',
        companyName: 'Pre-existing Winner Corp',
        industryType: 'Logistics',
        hrRecruiterName: 'Winner',
        email: 'winner@logistics.com',
        yearEstablished: 2021
      });
      throw err;
    }
    // On retry, re-query latest ID:
    const nextId = await getNextCandidateCompanyId();
    assert.equal(nextId, 'COMP-0002'); // Verify it re-queried and advanced to COMP-0002, did not retry COMP-0001
    return await Company.create({
      companyId: nextId,
      companyName: 'Retried Competitor Corp',
      industryType: 'Logistics',
      hrRecruiterName: 'Competitor',
      email: 'competitor@logistics.com',
      yearEstablished: 2021
    });
  };

  const created = await executeWithCompanyIdRetry(dummyAction);
  assert.equal(created.companyId, 'COMP-0002');
  assert.equal(callCount, 2);
});

test('10. Duplicate email is rejected case-insensitively across existing user and company accounts', async () => {
  await companyService.createCompany({
    companyName: 'Acme Original',
    industryType: 'Tech',
    hrRecruiterName: 'Alice',
    email: 'Recruiter@Acme.com',
    yearEstablished: 2020
  });

  await assert.rejects(
    async () => {
      await companyService.createCompany({
        companyName: 'Different Name Corp',
        industryType: 'Tech',
        hrRecruiterName: 'Bob',
        email: 'recruiter@acme.com',
        yearEstablished: 2021
      });
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'EMAIL_EXISTS');
      assert.ok(err.details?.email);
      assert.equal(err.details?.companyName, undefined);
      return true;
    }
  );
});

test('11. Duplicate companyName is rejected case-insensitively', async () => {
  await companyService.createCompany({
    companyName: 'Globex Corporation',
    industryType: 'Finance',
    hrRecruiterName: 'Bob',
    email: 'bob@globex.com',
    yearEstablished: 2019
  });

  await assert.rejects(
    async () => {
      await companyService.createCompany({
        companyName: 'GLOBEX CORPORATION',
        industryType: 'Finance',
        hrRecruiterName: 'Charlie',
        email: 'charlie@globex.com',
        yearEstablished: 2021
      });
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'COMPANY_NAME_EXISTS');
      assert.ok(err.details?.companyName);
      assert.equal(err.details?.email, undefined);
      return true;
    }
  );
});

test('12. Independent duplicate validation detects both duplicate email and duplicate companyName simultaneously', async () => {
  await companyService.createCompany({
    companyName: 'Initech Systems',
    industryType: 'Software',
    hrRecruiterName: 'Peter',
    email: 'peter@initech.com',
    yearEstablished: 1999
  });

  await assert.rejects(
    async () => {
      await companyService.createCompany({
        companyName: 'INITECH SYSTEMS',
        industryType: 'Software',
        hrRecruiterName: 'Samir',
        email: 'PETER@INITECH.COM',
        yearEstablished: 2000
      });
    },
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, 'DUPLICATE_ENTRY');
      assert.ok(err.details?.email);
      assert.ok(err.details?.companyName);
      assert.match(err.details.email, /email already exists/i);
      assert.match(err.details.companyName, /company with this name already exists/i);
      return true;
    }
  );
});


