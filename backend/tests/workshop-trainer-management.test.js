import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedInitialData } from '../src/seeders/seed.js';
import { User } from '../src/models/user.model.js';
import { UserSession } from '../src/models/user-session.model.js';
import { Company } from '../src/models/company.model.js';
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { WorkshopAuditLog } from '../src/models/workshop_audit_log.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { hashPassword } from '../src/utils/password.js';
import { createRawSessionToken, hashSessionToken } from '../src/utils/session-token.js';
import {
  validateWorkshopForm,
  getTabForErrorKey
} from '../../frontend/src/components/workshops/workshopValidation.js';

let replSet;
let app;
let departmentDoc;
let sampleCompany;

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replSet.getUri());
  await seedInitialData();
  app = createApp();
});

after(async () => {
  await disconnectDatabase();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  await Workshop.deleteMany({});
  await WorkshopAuditLog.deleteMany({});
  await UserSession.deleteMany({});
  await Company.deleteMany({});

  departmentDoc = await Department.findOne({ code: 'CSE' });
  if (!departmentDoc) {
    departmentDoc = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true
    });
  }

  sampleCompany = await Company.create({
    companyId: 'COMP-TEST-001',
    companyName: 'Technova Solutions',
    industryType: 'Information Technology',
    hrRecruiterName: 'Jiya Patel',
    email: 'recruiter@technova.com',
    yearEstablished: 2018
  });
});

async function createAuthSession(roleId, userType = 'PLACEMENT', extraData = {}) {
  const ts = Date.now() + Math.floor(Math.random() * 1000000);
  const email = `test-${roleId.toLowerCase()}-${ts}@domain.com`;
  const passwordHash = await hashPassword('Password!123456');

  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    accountStatus: 'ACTIVE',
    ...extraData
  });

  if (roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    await PlacementOfficer.create({
      userId: user._id,
      employeeId: user.employeeId,
      firstName: 'Coordinator',
      lastName: 'User',
      email: user.email,
      mobileNumber: '9876543210',
      designation: 'Assistant Professor',
      department: departmentDoc.name,
      departmentId: departmentDoc._id,
      role: ROLE_IDS.PLACEMENT_COORDINATOR
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

function makeValidWorkshopPayload(overrides = {}) {
  return {
    title: 'Industry Cloud Computing BootCamp',
    description: 'Comprehensive hands-on training for cloud architecture, containers and CI/CD pipelines.',
    category: 'TECHNICAL',
    ownershipType: 'DEPARTMENT',
    departmentId: String(departmentDoc._id),
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/xyz-abcd-efg',
    maxParticipants: 60,
    startAt: '2026-11-20T09:00:00.000Z',
    endAt: '2026-11-20T17:00:00.000Z',
    registrationDeadline: '2026-11-19T18:00:00.000Z',
    targetAudience: { isAllDepartments: true, departmentRules: [] },
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Microservices & Docker Fundamentals',
        startAt: '2026-11-20T09:00:00.000Z',
        endAt: '2026-11-20T12:30:00.000Z',
        isAttendanceRequired: true
      }
    ],
    trainers: [],
    ...overrides
  };
}

// ==========================================
// 1. Frontend Form Validation Unit Tests
// ==========================================

test('1. Frontend validation: Company Trainer requires valid companyId', () => {
  const formWithMissingCompany = {
    ...makeValidWorkshopPayload(),
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        designation: 'HR',
        organization: 'Technova'
        // companyId is missing!
      }
    ]
  };

  const errors = validateWorkshopForm(formWithMissingCompany, { isCoordinator: true });
  assert.equal(
    errors['trainer_0_companyId'],
    'Please select a company for this company trainer.',
    'Must require companyId when trainerType is COMPANY'
  );
  assert.equal(getTabForErrorKey('trainer_0_companyId'), 'trainers', 'Must map to trainers tab');

  // Invalid ObjectId format
  const formWithInvalidId = {
    ...makeValidWorkshopPayload(),
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        companyId: 'invalid-id'
      }
    ]
  };
  const errorsInvalid = validateWorkshopForm(formWithInvalidId, { isCoordinator: true });
  assert.equal(errorsInvalid['trainer_0_companyId'], 'Invalid company selected.');

  // Valid companyId provided
  const formWithValidCompany = {
    ...makeValidWorkshopPayload(),
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        designation: 'Technical Recruiter',
        companyId: String(sampleCompany._id)
      }
    ]
  };
  const errorsValid = validateWorkshopForm(formWithValidCompany, { isCoordinator: true });
  assert.equal(errorsValid['trainer_0_companyId'], undefined, 'Must not produce companyId error when valid');
});

test('2. Frontend validation: External Expert requires organization name', () => {
  const formWithoutOrg = {
    ...makeValidWorkshopPayload(),
    trainers: [
      {
        trainerType: 'EXTERNAL',
        name: 'Dr. John Doe',
        designation: 'Architect',
        organization: '  ' // empty organization
      }
    ]
  };

  const errors = validateWorkshopForm(formWithoutOrg, { isCoordinator: true });
  assert.equal(
    errors['trainer_0_organization'],
    'Organization is required for external industry experts.',
    'Must require organization for external experts'
  );
  assert.equal(getTabForErrorKey('trainer_0_organization'), 'trainers');

  // Valid organization provided
  const formWithOrg = {
    ...makeValidWorkshopPayload(),
    trainers: [
      {
        trainerType: 'EXTERNAL',
        name: 'Dr. John Doe',
        designation: 'Architect',
        organization: 'Google Cloud'
      }
    ]
  };
  const validErrors = validateWorkshopForm(formWithOrg, { isCoordinator: true });
  assert.equal(validErrors['trainer_0_organization'], undefined);
});

test('3. Frontend validation: Multiple trainers with mixed types are independently validated', () => {
  const formMixed = {
    ...makeValidWorkshopPayload(),
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        // missing companyId
        companyId: ''
      },
      {
        trainerType: 'EXTERNAL',
        name: '', // missing name
        organization: 'RedHat'
      }
    ]
  };

  const errors = validateWorkshopForm(formMixed, { isCoordinator: true });
  assert.equal(errors['trainer_0_companyId'], 'Please select a company for this company trainer.');
  assert.equal(errors['trainer_1_name'], 'Trainer name is required.');
});

// ==========================================
// 2. Backend Validation & API Integration Tests
// ==========================================

test('4. Backend rejects COMPANY trainer when companyId is missing', async () => {
  const coordinator = await createAuthSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const payload = makeValidWorkshopPayload({
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        designation: 'HR',
        organization: 'Technova'
        // companyId omitted
      }
    ]
  });

  const res = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send(payload);

  assert.equal(res.status, 400, 'Expected 400 Bad Request');
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');

  const fieldErrors = res.body.error.details?.fieldErrors || {};
  const trainerErrors = fieldErrors['trainers.0.companyId'] || [];
  assert.ok(
    trainerErrors.some((msg) => msg.includes('companyId is required when trainerType is COMPANY.')),
    `Expected companyId required message, got: ${JSON.stringify(fieldErrors)}`
  );
});

test('5. Backend rejects COMPANY trainer when userId is mistakenly provided', async () => {
  const coordinator = await createAuthSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const payload = makeValidWorkshopPayload({
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        companyId: String(sampleCompany._id),
        userId: String(coordinator.user._id) // Invalid for COMPANY
      }
    ]
  });

  const res = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send(payload);

  assert.equal(res.status, 400, 'Expected 400 Bad Request');
  assert.equal(res.body.success, false);

  const fieldErrors = res.body.error.details?.fieldErrors || {};
  const userErrors = fieldErrors['trainers.0.userId'] || [];
  assert.ok(
    userErrors.some((msg) => msg.includes('userId must be absent when trainerType is COMPANY.')),
    `Expected userId absent message, got: ${JSON.stringify(fieldErrors)}`
  );
});

test('6. Backend successfully creates workshop draft with valid COMPANY trainer and persists companyId', async () => {
  const coordinator = await createAuthSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const payload = makeValidWorkshopPayload({
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        designation: 'Lead Technical Recruiter',
        organization: sampleCompany.companyName,
        companyId: String(sampleCompany._id)
      }
    ]
  });

  const res = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send(payload);

  assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data._id);
  assert.equal(res.body.data.trainers.length, 1);

  const savedTrainer = res.body.data.trainers[0];
  assert.equal(savedTrainer.trainerType, 'COMPANY');
  assert.equal(savedTrainer.name, 'Jiya Patel');
  assert.equal(savedTrainer.designation, 'Lead Technical Recruiter');
  assert.equal(savedTrainer.organization, sampleCompany.companyName);
  assert.equal(String(savedTrainer.companyId), String(sampleCompany._id));
  assert.equal(savedTrainer.userId, undefined, 'userId must be absent in persisted document');

  // Verify DB record directly
  const dbWorkshop = await Workshop.findById(res.body.data._id).lean();
  assert.equal(String(dbWorkshop.trainers[0].companyId), String(sampleCompany._id));
  assert.equal(dbWorkshop.trainers[0].userId, undefined);
});

test('7. Backend successfully creates workshop draft with multiple diverse trainers', async () => {
  const coordinator = await createAuthSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  const payload = makeValidWorkshopPayload({
    trainers: [
      {
        trainerType: 'COMPANY',
        name: 'Jiya Patel',
        designation: 'HR Lead',
        organization: sampleCompany.companyName,
        companyId: String(sampleCompany._id)
      },
      {
        trainerType: 'EXTERNAL',
        name: 'Dr. Jane Cloud',
        designation: 'AWS Certified Fellow',
        organization: 'Independent Cloud Consulting'
      },
      {
        trainerType: 'PLACEMENT_COORDINATOR',
        name: 'Prof. Sharma',
        designation: 'Placement Coordinator',
        userId: String(coordinator.user._id)
      }
    ]
  });

  const res = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send(payload);

  assert.equal(res.status, 201);
  assert.equal(res.body.data.trainers.length, 3);

  const [tComp, tExt, tCoord] = res.body.data.trainers;
  // Company trainer
  assert.equal(tComp.trainerType, 'COMPANY');
  assert.equal(String(tComp.companyId), String(sampleCompany._id));
  assert.equal(tComp.userId, undefined);

  // External trainer
  assert.equal(tExt.trainerType, 'EXTERNAL');
  assert.equal(tExt.companyId, undefined);
  assert.equal(tExt.userId, undefined);
  assert.equal(tExt.name, 'Dr. Jane Cloud');

  // Coordinator trainer
  assert.equal(tCoord.trainerType, 'PLACEMENT_COORDINATOR');
  assert.equal(String(tCoord.userId), String(coordinator.user._id));
  assert.equal(tCoord.companyId, undefined);
});

test('8. Backend allows updating workshop trainers: modifying, adding and removing trainers', async () => {
  const coordinator = await createAuthSession(ROLE_IDS.PLACEMENT_COORDINATOR, 'PLACEMENT');

  // 1. Create with initial External trainer
  const createRes = await request(app)
    .post('/api/workshops')
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send(makeValidWorkshopPayload({
      trainers: [
        {
          trainerType: 'EXTERNAL',
          name: 'Initial Trainer',
          organization: 'External Org'
        }
      ]
    }));
  assert.equal(createRes.status, 201);
  const workshopId = createRes.body.data._id;

  // 2. Update to replace with Company Trainer
  const updateRes = await request(app)
    .put(`/api/workshops/${workshopId}`)
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send({
      trainers: [
        {
          trainerType: 'COMPANY',
          name: 'Updated Company Trainer',
          designation: 'Tech Lead',
          organization: sampleCompany.companyName,
          companyId: String(sampleCompany._id)
        }
      ]
    });

  assert.equal(updateRes.status, 200, `Expected 200 OK: ${JSON.stringify(updateRes.body)}`);
  assert.equal(updateRes.body.data.trainers.length, 1);
  assert.equal(updateRes.body.data.trainers[0].trainerType, 'COMPANY');
  assert.equal(String(updateRes.body.data.trainers[0].companyId), String(sampleCompany._id));
  assert.equal(updateRes.body.data.trainers[0].name, 'Updated Company Trainer');

  // 3. Clear all trainers (empty array is valid)
  const clearRes = await request(app)
    .put(`/api/workshops/${workshopId}`)
    .set('Authorization', `Bearer ${coordinator.token}`)
    .send({ trainers: [] });

  assert.equal(clearRes.status, 200);
  assert.equal(clearRes.body.data.trainers.length, 0);
});
