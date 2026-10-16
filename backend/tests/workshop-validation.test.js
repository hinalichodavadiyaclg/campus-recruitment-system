import assert from 'node:assert/strict';
import test from 'node:test';
import {
  workshopCreateSchema,
  workshopUpdateSchema,
  workshopListQuerySchema,
  workshopApproveSchema,
  workshopRejectSchema,
  workshopPublishSchema,
  workshopCancelSchema,
  workshopRegisterSchema,
  workshopCancelRegistrationSchema,
  workshopAttendanceSubmitSchema,
  workshopCertificateIssueSchema,
  workshopCertificateRevokeSchema,
  workshopRosterQuerySchema,
  workshopAttendanceQuerySchema,
  workshopCertificateQuerySchema,
  workshopAuditLogQuerySchema
} from '../src/validators/workshop.validator.js';

const VALID_OBJECT_ID_1 = '507f1f77bcf86cd799439011';
const VALID_OBJECT_ID_2 = '507f1f77bcf86cd799439012';
const VALID_OBJECT_ID_3 = '507f1f77bcf86cd799439013';

function buildValidWorkshopCreatePayload() {
  const now = Date.now();
  const start = new Date(now + 86400000 * 5); // +5 days
  const end = new Date(now + 86400000 * 6); // +6 days
  const regDeadline = new Date(now + 86400000 * 3); // +3 days
  const regOpen = new Date(now + 86400000 * 1); // +1 day

  return {
    title: 'Advanced Full Stack Web Development Workshop',
    description: 'A comprehensive hands-on workshop covering Node.js, Express, and React architectures.',
    category: 'TECHNICAL',
    mode: 'OFFLINE',
    bannerUrl: 'https://vvwu.ac.in/banners/workshop.jpg',
    ownershipType: 'DEPARTMENT',
    departmentId: VALID_OBJECT_ID_1,
    maxParticipants: 60,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    registrationOpensAt: regOpen.toISOString(),
    registrationDeadline: regDeadline.toISOString(),
    venue: 'Computer Science Lab 3, Block A',
    trainers: [
      {
        trainerType: 'PLACEMENT_COORDINATOR',
        name: 'Dr. Jane Smith',
        designation: 'Associate Professor',
        organization: 'VVWU',
        userId: VALID_OBJECT_ID_2
      }
    ],
    targetAudience: {
      isAllDepartments: false,
      departmentRules: [
        {
          departmentId: VALID_OBJECT_ID_1,
          targetingMode: 'ALL_COURSES_SELECTED_SEMESTERS',
          semesters: [5, 6]
        }
      ]
    },
    sessions: [
      {
        sessionId: 'S1',
        sessionNumber: 1,
        title: 'Session 1: Backend Architecture',
        description: 'Deep dive into Express and Mongoose.',
        startAt: new Date(start.getTime() + 3600000 * 1).toISOString(),
        endAt: new Date(start.getTime() + 3600000 * 4).toISOString(),
        trainerIds: ['TRAINER_1'],
        venue: 'Lab 3',
        isAttendanceRequired: true
      }
    ]
  };
}

test('1. workshopCreateSchema - Valid payload passes and populates defaults', () => {
  const payload = buildValidWorkshopCreatePayload();
  const result = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });

  assert.equal(result.success, true, `Validation failed: ${JSON.stringify(result.error?.flatten())}`);
  assert.equal(result.data.body.title, payload.title);
  assert.equal(result.data.body.sessions.length, 1);
  assert.equal(result.data.body.ownershipType, 'DEPARTMENT');
});

test('2. workshopCreateSchema - Required field failures', () => {
  const requiredFields = [
    'title',
    'description',
    'category',
    'mode',
    'maxParticipants',
    'startAt',
    'endAt',
    'registrationDeadline',
    'sessions'
  ];

  for (const field of requiredFields) {
    const payload = buildValidWorkshopCreatePayload();
    delete payload[field];

    const result = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
    assert.equal(result.success, false, `Expected validation failure when ${field} is missing.`);
  }
});

test('3. workshopCreateSchema - Bounds and string lengths', () => {
  // Title too short (<3)
  let payload = buildValidWorkshopCreatePayload();
  payload.title = 'AB';
  let res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // maxParticipants <= 0
  payload = buildValidWorkshopCreatePayload();
  payload.maxParticipants = 0;
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // maxParticipants > 10000
  payload = buildValidWorkshopCreatePayload();
  payload.maxParticipants = 10001;
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);
});

test('4. workshopCreateSchema - Date ordering constraints', () => {
  const now = Date.now();

  // endAt <= startAt
  let payload = buildValidWorkshopCreatePayload();
  payload.startAt = new Date(now + 86400000 * 5).toISOString();
  payload.endAt = new Date(now + 86400000 * 4).toISOString();
  let res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // registrationDeadline > startAt
  payload = buildValidWorkshopCreatePayload();
  payload.startAt = new Date(now + 86400000 * 5).toISOString();
  payload.registrationDeadline = new Date(now + 86400000 * 6).toISOString();
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // registrationDeadline <= registrationOpensAt
  payload = buildValidWorkshopCreatePayload();
  payload.registrationOpensAt = new Date(now + 86400000 * 3).toISOString();
  payload.registrationDeadline = new Date(now + 86400000 * 2).toISOString();
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // Session startAt < workshop startAt
  payload = buildValidWorkshopCreatePayload();
  payload.sessions[0].startAt = new Date(now + 86400000 * 4).toISOString(); // Before workshop startAt (+5 days)
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // Session endAt > workshop endAt
  payload = buildValidWorkshopCreatePayload();
  payload.sessions[0].endAt = new Date(now + 86400000 * 7).toISOString(); // After workshop endAt (+6 days)
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);
});

test('5. workshopCreateSchema - Mode and ownership rules', () => {
  // OFFLINE mode without venue
  let payload = buildValidWorkshopCreatePayload();
  payload.mode = 'OFFLINE';
  delete payload.venue;
  let res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // ONLINE mode without meetingLink
  payload = buildValidWorkshopCreatePayload();
  payload.mode = 'ONLINE';
  delete payload.meetingLink;
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // DEPARTMENT ownership without departmentId
  payload = buildValidWorkshopCreatePayload();
  payload.ownershipType = 'DEPARTMENT';
  delete payload.departmentId;
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // CENTRAL_PLACEMENT_CELL with departmentId
  payload = buildValidWorkshopCreatePayload();
  payload.ownershipType = 'CENTRAL_PLACEMENT_CELL';
  payload.departmentId = VALID_OBJECT_ID_1;
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);
});

test('6. workshopCreateSchema - Trainer type constraints', () => {
  // COMPANY without companyId
  let payload = buildValidWorkshopCreatePayload();
  payload.trainers = [{ trainerType: 'COMPANY', name: 'Google Recruiter' }];
  let res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // PLACEMENT_COORDINATOR without userId
  payload = buildValidWorkshopCreatePayload();
  payload.trainers = [{ trainerType: 'PLACEMENT_COORDINATOR', name: 'Faculty Member' }];
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);

  // EXTERNAL with userId
  payload = buildValidWorkshopCreatePayload();
  payload.trainers = [{ trainerType: 'EXTERNAL', name: 'Guest Speaker', userId: VALID_OBJECT_ID_2 }];
  res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
  assert.equal(res.success, false);
});

test('7. workshopCreateSchema - Strict mass-assignment protection', () => {
  // Injected server-controlled fields must fail validation via .strict()
  const forbiddenFields = [
    'workshopId',
    'createdBy',
    'approvalStatus',
    'isPublished',
    'lifecycleStatus',
    '_id',
    'createdAt',
    'updatedAt',
    'unknownHackerProperty'
  ];

  for (const field of forbiddenFields) {
    const payload = buildValidWorkshopCreatePayload();
    payload[field] = 'malicious_value';

    const res = workshopCreateSchema.safeParse({ body: payload, params: {}, query: {} });
    assert.equal(res.success, false, `Expected schema to reject server-controlled/unknown key: ${field}`);
  }
});

test('8. workshopUpdateSchema - Partial update behavior & strictness', () => {
  // Partial update with only title
  let res = workshopUpdateSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { title: 'Updated Title Only' },
    query: {}
  });
  assert.equal(res.success, true);
  assert.equal(res.data.body.title, 'Updated Title Only');

  // Partial update with only maxParticipants
  res = workshopUpdateSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { maxParticipants: 75 },
    query: {}
  });
  assert.equal(res.success, true);

  // Empty update body must fail
  res = workshopUpdateSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: {}
  });
  assert.equal(res.success, false);

  // Server-controlled field in update must fail
  res = workshopUpdateSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { title: 'Updated Title', approvalStatus: 'APPROVED' },
    query: {}
  });
  assert.equal(res.success, false);

  // Intra-payload cross-field check: both startAt and endAt supplied with endAt <= startAt
  const now = Date.now();
  res = workshopUpdateSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {
      startAt: new Date(now + 86400000 * 5).toISOString(),
      endAt: new Date(now + 86400000 * 4).toISOString()
    },
    query: {}
  });
  assert.equal(res.success, false);
});

test('9. workshopListQuerySchema - Strict boolean & integer coercion', () => {
  // Valid queries
  let res = workshopListQuerySchema.safeParse({
    params: {},
    body: {},
    query: { page: '2', limit: '50', isPublished: 'true', category: 'TECHNICAL' }
  });
  assert.equal(res.success, true);
  assert.equal(res.data.query.page, 2);
  assert.equal(res.data.query.limit, 50);
  assert.equal(res.data.query.isPublished, true);
  assert.equal(res.data.query.category, 'TECHNICAL');

  // Invalid boolean query must fail with error, NOT silently become undefined
  res = workshopListQuerySchema.safeParse({
    params: {},
    body: {},
    query: { isPublished: 'banana' }
  });
  assert.equal(res.success, false, 'Expected isPublished=banana to fail validation.');

  // Invalid integer query must fail with error
  res = workshopListQuerySchema.safeParse({
    params: {},
    body: {},
    query: { page: 'abc' }
  });
  assert.equal(res.success, false, 'Expected page=abc to fail validation.');

  // Zero page must fail with error
  res = workshopListQuerySchema.safeParse({
    params: {},
    body: {},
    query: { page: '0' }
  });
  assert.equal(res.success, false, 'Expected page=0 to fail validation.');

  // Unknown query parameter must fail due to .strict()
  res = workshopListQuerySchema.safeParse({
    params: {},
    body: {},
    query: { unknownFilter: 'value' }
  });
  assert.equal(res.success, false, 'Expected unknown query param to fail validation.');
});

test('10. workshopAttendanceSubmitSchema - Attendance constraints & duplicate detection', () => {
  // Valid attendance payload
  let res = workshopAttendanceSubmitSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1, sessionId: 'S1' },
    body: {
      attendees: [
        {
          registrationId: VALID_OBJECT_ID_1,
          studentId: VALID_OBJECT_ID_2,
          attendanceStatus: 'PRESENT',
          remarks: 'On time'
        },
        {
          registrationId: VALID_OBJECT_ID_2,
          studentId: VALID_OBJECT_ID_3,
          attendanceStatus: 'ABSENT'
        }
      ]
    },
    query: {}
  });
  assert.equal(res.success, true);

  // Empty attendees array must fail
  res = workshopAttendanceSubmitSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1, sessionId: 'S1' },
    body: { attendees: [] },
    query: {}
  });
  assert.equal(res.success, false);

  // Duplicate studentId in attendees array must fail
  res = workshopAttendanceSubmitSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1, sessionId: 'S1' },
    body: {
      attendees: [
        { registrationId: VALID_OBJECT_ID_1, studentId: VALID_OBJECT_ID_2, attendanceStatus: 'PRESENT' },
        { registrationId: VALID_OBJECT_ID_3, studentId: VALID_OBJECT_ID_2, attendanceStatus: 'ABSENT' }
      ]
    },
    query: {}
  });
  assert.equal(res.success, false, 'Expected duplicate studentId to fail attendance validation.');

  // Invalid attendance status must fail
  res = workshopAttendanceSubmitSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1, sessionId: 'S1' },
    body: {
      attendees: [
        { registrationId: VALID_OBJECT_ID_1, studentId: VALID_OBJECT_ID_2, attendanceStatus: 'UNKNOWN_STATUS' }
      ]
    },
    query: {}
  });
  assert.equal(res.success, false);
});

test('11. Lifecycle & Operational Action Schemas', () => {
  // Approval
  let res = workshopApproveSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { comment: 'Looks great!' },
    query: {}
  });
  assert.equal(res.success, true);

  // Rejection without reason must fail
  res = workshopRejectSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: {}
  });
  assert.equal(res.success, false);

  // Rejection with short reason (<5 chars) must fail
  res = workshopRejectSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { reason: 'No' },
    query: {}
  });
  assert.equal(res.success, false);

  // Rejection with valid reason passes
  res = workshopRejectSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { reason: 'Please update session description and trainers.' },
    query: {}
  });
  assert.equal(res.success, true);

  // Cancellation without reason must fail
  res = workshopCancelSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: {}
  });
  assert.equal(res.success, false);

  // Cancellation with valid reason passes
  res = workshopCancelSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { reason: 'Trainer unavailable due to emergency.' },
    query: {}
  });
  assert.equal(res.success, true);

  // Registration & self-cancellation
  res = workshopRegisterSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: {}
  });
  assert.equal(res.success, true);

  res = workshopCancelRegistrationSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { reason: 'Conflicting exam schedule.' },
    query: {}
  });
  assert.equal(res.success, true);
});

test('12. Certificate Issuance & Revocation Schemas', () => {
  // Issuance with empty body (meaning all eligible) passes
  let res = workshopCertificateIssueSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: {}
  });
  assert.equal(res.success, true);

  // Issuance with targeted registrationIds passes
  res = workshopCertificateIssueSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { registrationIds: [VALID_OBJECT_ID_1, VALID_OBJECT_ID_2] },
    query: {}
  });
  assert.equal(res.success, true);

  // Issuance with empty registrationIds array fails
  res = workshopCertificateIssueSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { registrationIds: [] },
    query: {}
  });
  assert.equal(res.success, false);

  // Revocation without reason fails
  res = workshopCertificateRevokeSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: {}
  });
  assert.equal(res.success, false);

  // Revocation with valid reason passes
  res = workshopCertificateRevokeSchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: { reason: 'Issued in error; student did not meet 75% attendance threshold.' },
    query: {}
  });
  assert.equal(res.success, true);
});

test('13. Roster, Attendance, Certificate & Audit Query Schemas', () => {
  // Roster query with valid status
  let res = workshopRosterQuerySchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: { status: 'REGISTERED', page: '1', limit: '10' }
  });
  assert.equal(res.success, true);
  assert.equal(res.data.query.status, 'REGISTERED');

  // Attendance query
  res = workshopAttendanceQuerySchema.safeParse({
    params: { id: VALID_OBJECT_ID_1, sessionId: 'S1' },
    body: {},
    query: { status: 'PRESENT' }
  });
  assert.equal(res.success, true);
  assert.equal(res.data.query.status, 'PRESENT');

  // Certificate query
  res = workshopCertificateQuerySchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: { status: 'ISSUED' }
  });
  assert.equal(res.success, true);

  // Audit log query
  res = workshopAuditLogQuerySchema.safeParse({
    params: { id: VALID_OBJECT_ID_1 },
    body: {},
    query: { entityType: 'WORKSHOP', action: 'WORKSHOP_UPDATED' }
  });
  assert.equal(res.success, true);
});
