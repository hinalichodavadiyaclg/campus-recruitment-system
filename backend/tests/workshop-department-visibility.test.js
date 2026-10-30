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
import { Department } from '../src/models/department.model.js';
import { PlacementOfficer } from '../src/models/placement_officer.model.js';
import { Workshop } from '../src/models/workshop.model.js';
import { ROLE_IDS } from '../src/utils/access-constants.js';
import { hashPassword } from '../src/utils/password.js';
import { createRawSessionToken, hashSessionToken } from '../src/utils/session-token.js';

let replSet;
let app;
let cseDept;
let itDept;
let coordinatorUser;
let coordinatorToken;
let placementHeadUser;
let placementHeadToken;

async function createAuthenticatedSession(userId) {
  const rawToken = createRawSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await UserSession.create({
    userId,
    sessionTokenHash: hashSessionToken(rawToken),
    loginAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt,
    isActive: true
  });
  return rawToken;
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(replSet.getUri());
  await seedInitialData();
  app = createApp();

  // Create CSE and IT departments
  cseDept = await Department.create({
    name: 'Computer Science',
    code: 'CSE',
    isActive: true
  });

  itDept = await Department.create({
    name: 'Information Technology',
    code: 'IT',
    isActive: true
  });

  // Create Placement Coordinator in CSE
  const pwdHash = await hashPassword('Coordinator@123');
  coordinatorUser = await User.create({
    email: 'coordinator.cse@example.edu',
    employeeId: 'EMP-CSE-01',
    passwordHash: pwdHash,
    roleId: ROLE_IDS.PLACEMENT_COORDINATOR,
    userType: 'PLACEMENT',
    accountStatus: 'ACTIVE'
  });

  await PlacementOfficer.create({
    userId: coordinatorUser._id,
    employeeId: 'EMP-CSE-01',
    firstName: 'Meera',
    lastName: 'Patel',
    email: 'coordinator.cse@example.edu',
    designation: 'Assistant Placement Officer',
    department: 'Computer Science',
    departmentId: cseDept._id,
    role: ROLE_IDS.PLACEMENT_COORDINATOR
  });

  // Create Placement Head
  const headPwdHash = await hashPassword('Head@123');
  placementHeadUser = await User.create({
    email: 'placement.head@example.edu',
    employeeId: 'EMP-HEAD-01',
    passwordHash: headPwdHash,
    roleId: ROLE_IDS.PLACEMENT_HEAD,
    userType: 'PLACEMENT',
    accountStatus: 'ACTIVE'
  });

  await PlacementOfficer.create({
    userId: placementHeadUser._id,
    employeeId: 'EMP-HEAD-01',
    firstName: 'Kriti',
    lastName: 'Savaliya',
    email: 'placement.head@example.edu',
    designation: 'Placement Head',
    role: ROLE_IDS.PLACEMENT_HEAD
  });

  coordinatorToken = await createAuthenticatedSession(coordinatorUser._id);
  placementHeadToken = await createAuthenticatedSession(placementHeadUser._id);
});

after(async () => {
  await disconnectDatabase();
  if (replSet) {
    await replSet.stop();
  }
});

beforeEach(async () => {
  await Workshop.deleteMany({});
});

test('1. Placement Coordinator sees CSE workshop with populated departmentId.name and code', async () => {
  const startAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const endAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

  // Create CSE workshop
  const cseWorkshop = await Workshop.create({
    workshopId: 'WS-2026-0001',
    title: 'Advanced JavaScript Mastery',
    description: 'Deep dive into modern JS features and async patterns.',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    ownershipType: 'DEPARTMENT',
    departmentId: cseDept._id,
    createdBy: coordinatorUser._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    targetAudience: { isAllDepartments: false, departmentRules: [] },
    startAt,
    endAt,
    registrationDeadline: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    maxParticipants: 50,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Async JS & V8',
        startAt,
        endAt
      }
    ]
  });

  // Create Central Placement Cell workshop
  const cpcStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const cpcEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  await Workshop.create({
    workshopId: 'WS-2026-0002',
    title: 'Aptitude & Soft Skills Prep',
    description: 'Campus-wide aptitude masterclass.',
    category: 'APTITUDE',
    mode: 'ONLINE',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    createdBy: placementHeadUser._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    targetAudience: { isAllDepartments: true, departmentRules: [] },
    startAt: cpcStart,
    endAt: cpcEnd,
    registrationDeadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    maxParticipants: 100,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Quantitative Logic',
        startAt: cpcStart,
        endAt: cpcEnd
      }
    ]
  });

  // Coordinator lists workshops
  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${coordinatorToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.workshops.length, 2);

  const foundCse = res.body.data.workshops.find((w) => w.workshopId === 'WS-2026-0001');
  assert.ok(foundCse, 'CSE workshop should be returned');
  assert.ok(foundCse.departmentId, 'departmentId should be present');
  assert.equal(foundCse.departmentId.name, 'Computer Science', 'departmentId.name must be populated');
  assert.equal(foundCse.departmentId.code, 'CSE', 'departmentId.code must be populated');

  // Also verify single workshop details by ID
  const detailRes = await request(app)
    .get(`/api/workshops/${foundCse._id}`)
    .set('Authorization', `Bearer ${coordinatorToken}`);

  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.data.departmentId.name, 'Computer Science');
  assert.equal(detailRes.body.data.departmentId.code, 'CSE');
});

test('2. Department filter returns only matching department workshops and CPC workshops when requested', async () => {
  const cseStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const cseEnd = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);
  // CSE workshop
  await Workshop.create({
    workshopId: 'WS-2026-0003',
    title: 'Python for Data Science',
    description: 'CSE departmental workshop.',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    ownershipType: 'DEPARTMENT',
    departmentId: cseDept._id,
    createdBy: coordinatorUser._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    targetAudience: { isAllDepartments: false, departmentRules: [] },
    startAt: cseStart,
    endAt: cseEnd,
    registrationDeadline: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
    maxParticipants: 60,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Pandas & Numpy',
        startAt: cseStart,
        endAt: cseEnd
      }
    ]
  });

  const itStart = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
  const itEnd = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000);
  // IT workshop
  await Workshop.create({
    workshopId: 'WS-2026-0004',
    title: 'Network Security Fundamentals',
    description: 'IT departmental workshop.',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    ownershipType: 'DEPARTMENT',
    departmentId: itDept._id,
    createdBy: placementHeadUser._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    targetAudience: { isAllDepartments: false, departmentRules: [] },
    startAt: itStart,
    endAt: itEnd,
    registrationDeadline: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
    maxParticipants: 40,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'Firewalls & Protocols',
        startAt: itStart,
        endAt: itEnd
      }
    ]
  });

  // Filter by CSE departmentId
  const cseFilterRes = await request(app)
    .get(`/api/workshops?departmentId=${cseDept._id}`)
    .set('Authorization', `Bearer ${coordinatorToken}`);

  assert.equal(cseFilterRes.status, 200);
  assert.equal(cseFilterRes.body.data.workshops.length, 1);
  assert.equal(cseFilterRes.body.data.workshops[0].workshopId, 'WS-2026-0003');
  assert.equal(cseFilterRes.body.data.workshops[0].departmentId.name, 'Computer Science');

  // Filter by IT departmentId
  const itFilterRes = await request(app)
    .get(`/api/workshops?departmentId=${itDept._id}`)
    .set('Authorization', `Bearer ${placementHeadToken}`);

  assert.equal(itFilterRes.status, 200);
  assert.equal(itFilterRes.body.data.workshops.length, 1);
  assert.equal(itFilterRes.body.data.workshops[0].workshopId, 'WS-2026-0004');
  assert.equal(itFilterRes.body.data.workshops[0].departmentId.name, 'Information Technology');
});

test('3. Placement Head can view department workshops and see populated department info', async () => {
  const startAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
  const endAt = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);

  await Workshop.create({
    workshopId: 'WS-2026-0005',
    title: 'Cloud Architecture Workshop',
    description: 'Cloud training for CSE.',
    category: 'TECHNICAL',
    mode: 'ONLINE',
    ownershipType: 'DEPARTMENT',
    departmentId: cseDept._id,
    createdBy: coordinatorUser._id,
    approvalStatus: 'APPROVED',
    isPublished: true,
    lifecycleStatus: 'SCHEDULED',
    targetAudience: { isAllDepartments: false, departmentRules: [] },
    startAt,
    endAt,
    registrationDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    maxParticipants: 45,
    sessions: [
      {
        sessionId: 'SES-01',
        sessionNumber: 1,
        title: 'AWS & Microservices',
        startAt,
        endAt
      }
    ]
  });

  const res = await request(app)
    .get('/api/workshops')
    .set('Authorization', `Bearer ${placementHeadToken}`);

  assert.equal(res.status, 200);
  const cseWs = res.body.data.workshops.find((w) => w.workshopId === 'WS-2026-0005');
  assert.ok(cseWs);
  assert.equal(cseWs.departmentId.name, 'Computer Science');
  assert.equal(cseWs.departmentId.code, 'CSE');
});
