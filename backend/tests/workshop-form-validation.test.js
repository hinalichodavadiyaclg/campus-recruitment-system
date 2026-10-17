import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSHOP_CATEGORIES,
  WORKSHOP_MODES,
  TRAINER_TYPES,
  getInitialWorkshopFormData,
  validateWorkshopForm,
  buildTargetAudiencePayload,
  getTabForErrorKey,
  isValidUrl
} from '../../frontend/src/components/workshops/workshopValidation.js';

test('1. Initial Workshop Form Data — Placement Coordinator vs Other Roles', () => {
  const coordDeptId = '6ac9900ab9b209e72071c6cd';

  // Placement Coordinator
  const coordData = getInitialWorkshopFormData(true, coordDeptId);
  assert.equal(coordData.ownershipType, 'DEPARTMENT', 'Coordinator must default to DEPARTMENT');
  assert.equal(coordData.departmentId, coordDeptId, 'Coordinator must default to their department ID');
  assert.equal(coordData.title, '', 'Title must be empty in advance');
  assert.equal(coordData.description, '', 'Description must be empty in advance');
  assert.equal(coordData.category, '', 'Category must be empty in advance');
  assert.equal(coordData.mode, '', 'Mode must be empty in advance');
  assert.equal(coordData.venue, '', 'Venue must be empty in advance');
  assert.equal(coordData.meetingLink, '', 'Meeting link must be empty in advance');
  assert.equal(coordData.bannerUrl, '', 'Banner URL must be empty in advance');
  assert.equal(coordData.maxParticipants, '', 'Max participants must be empty in advance');
  assert.equal(coordData.startAt, '', 'startAt must be empty in advance');
  assert.equal(coordData.endAt, '', 'endAt must be empty in advance');
  assert.equal(coordData.registrationOpensAt, '', 'registrationOpensAt must be empty in advance');
  assert.equal(coordData.registrationDeadline, '', 'registrationDeadline must be empty in advance');
  assert.deepEqual(coordData.trainers, [], 'Trainers must be an empty array in advance');
  assert.deepEqual(coordData.sessions, [], 'Sessions must be an empty array in advance');
  assert.deepEqual(coordData.targetAudience, { isAllDepartments: false, departmentRules: [] }, 'Target audience checkboxes must be unselected first');

  // Non-coordinator (e.g. Admin or Placement Officer)
  const nonCoordData = getInitialWorkshopFormData(false, '');
  assert.equal(nonCoordData.ownershipType, '', 'Non-coordinator must NOT default ownershipType');
  assert.equal(nonCoordData.departmentId, '', 'Non-coordinator must NOT default departmentId');
  assert.equal(nonCoordData.title, '');
  assert.equal(nonCoordData.description, '');
  assert.equal(nonCoordData.category, '');
  assert.equal(nonCoordData.mode, '');
  assert.equal(nonCoordData.venue, '');
  assert.equal(nonCoordData.maxParticipants, '');
  assert.equal(nonCoordData.startAt, '');
  assert.equal(nonCoordData.endAt, '');
  assert.equal(nonCoordData.registrationDeadline, '');
  assert.deepEqual(nonCoordData.trainers, []);
  assert.deepEqual(nonCoordData.sessions, []);
  assert.deepEqual(nonCoordData.targetAudience, { isAllDepartments: false, departmentRules: [] }, 'Target audience checkboxes must be unselected first');
});

test('2. Form Validation — Blank Form Rejection', () => {
  const blankData = getInitialWorkshopFormData(false, '');
  const errors = validateWorkshopForm(blankData);

  assert.ok(errors.title, 'Title required error must trigger');
  assert.ok(errors.description, 'Description required error must trigger');
  assert.ok(errors.category, 'Category required error must trigger');
  assert.ok(errors.maxParticipants, 'Max capacity required error must trigger');
  assert.ok(errors.startAt, 'startAt required error must trigger');
  assert.ok(errors.endAt, 'endAt required error must trigger');
  assert.ok(errors.registrationDeadline, 'registrationDeadline required error must trigger');
  assert.ok(errors.mode, 'Delivery mode required error must trigger');
  assert.ok(errors.sessions, 'Sessions required error must trigger');
});

test('3. Form Validation — Title & Description Lengths', () => {
  const base = {
    ...getInitialWorkshopFormData(false, ''),
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T14:00',
    registrationDeadline: '2026-10-31T18:00',
    sessions: [{ title: 'Intro', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }]
  };

  // Too short title
  let errors = validateWorkshopForm({ ...base, title: 'AB', description: 'Valid workshop description' });
  assert.equal(errors.title, 'Workshop title must be at least 3 characters.');

  // Too long title
  errors = validateWorkshopForm({ ...base, title: 'A'.repeat(201), description: 'Valid workshop description' });
  assert.equal(errors.title, 'Workshop title cannot exceed 200 characters.');

  // Too short description
  errors = validateWorkshopForm({ ...base, title: 'Valid Title', description: 'Too short' });
  assert.equal(errors.description, 'Workshop description must be at least 10 characters.');
});

test('4. Form Validation — Category & Delivery Mode Options', () => {
  const base = {
    ...getInitialWorkshopFormData(false, ''),
    title: 'Valid Workshop',
    description: 'Valid workshop description with details',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T14:00',
    registrationDeadline: '2026-10-31T18:00',
    sessions: [{ title: 'Session 1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }]
  };

  // Invalid category
  let errors = validateWorkshopForm({ ...base, category: 'INVALID_CATEGORY', mode: 'ONLINE', meetingLink: 'https://meet.google.com/abc' });
  assert.equal(errors.category, 'Please select a valid workshop category.');

  // Invalid mode
  errors = validateWorkshopForm({ ...base, category: 'TECHNICAL', mode: 'FLYING' });
  assert.equal(errors.mode, 'Invalid delivery mode selected.');

  // Mode OFFLINE requires venue
  errors = validateWorkshopForm({ ...base, category: 'TECHNICAL', mode: 'OFFLINE', venue: '' });
  assert.equal(errors.venue, 'On-campus venue is required for offline/hybrid workshops.');

  // Mode ONLINE requires meetingLink
  errors = validateWorkshopForm({ ...base, category: 'TECHNICAL', mode: 'ONLINE', meetingLink: '' });
  assert.equal(errors.meetingLink, 'Virtual meeting link is required for online/hybrid workshops.');

  // Mode ONLINE with invalid URL format
  errors = validateWorkshopForm({ ...base, category: 'TECHNICAL', mode: 'ONLINE', meetingLink: 'not-a-valid-url' });
  assert.equal(errors.meetingLink, 'Meeting link must be a valid URL starting with http:// or https://');
});

test('5. Form Validation — Schedule and Date Constraints', () => {
  const base = {
    ...getInitialWorkshopFormData(false, ''),
    title: 'Valid Workshop',
    description: 'Valid workshop description with details',
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    maxParticipants: 50,
    sessions: [{ title: 'Session 1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }]
  };

  // Workshop endAt <= startAt
  let errors = validateWorkshopForm({
    ...base,
    startAt: '2026-11-01T14:00',
    endAt: '2026-11-01T10:00',
    registrationDeadline: '2026-10-31T10:00'
  });
  assert.equal(errors.endAt, 'Workshop end time must be strictly after workshop start time.');

  // Registration deadline after startAt
  errors = validateWorkshopForm({
    ...base,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T14:00',
    registrationDeadline: '2026-11-01T11:00'
  });
  assert.equal(errors.registrationDeadline, 'Registration deadline cannot be after workshop start time.');

  // Registration opens after deadline
  errors = validateWorkshopForm({
    ...base,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T14:00',
    registrationOpensAt: '2026-10-31T12:00',
    registrationDeadline: '2026-10-30T12:00'
  });
  assert.equal(errors.registrationOpensAt, 'Registration opens time must be strictly before registration deadline.');
});

test('6. Form Validation — Session Containment and Timings', () => {
  const base = {
    ...getInitialWorkshopFormData(false, ''),
    title: 'Valid Workshop',
    description: 'Valid workshop description with details',
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T18:00',
    registrationDeadline: '2026-10-31T18:00'
  };

  // Empty sessions
  let errors = validateWorkshopForm({ ...base, sessions: [] });
  assert.equal(errors.sessions, 'Every workshop must have at least one session. Please click "+ Add Session".');

  // Session startAt before workshop startAt
  errors = validateWorkshopForm({
    ...base,
    sessions: [
      {
        title: 'Morning Session',
        startAt: '2026-11-01T08:00', // Before workshop 10:00
        endAt: '2026-11-01T12:00'
      }
    ]
  });
  assert.ok(errors['session_0_startAt'], 'Must reject session starting before workshop');

  // Session endAt after workshop endAt
  errors = validateWorkshopForm({
    ...base,
    sessions: [
      {
        title: 'Late Session',
        startAt: '2026-11-01T14:00',
        endAt: '2026-11-01T19:00' // After workshop 18:00
      }
    ]
  });
  assert.ok(errors['session_0_endAt'], 'Must reject session ending after workshop');

  // Session endAt <= session startAt
  errors = validateWorkshopForm({
    ...base,
    sessions: [
      {
        title: 'Inverted Session',
        startAt: '2026-11-01T14:00',
        endAt: '2026-11-01T13:00'
      }
    ]
  });
  assert.equal(errors['session_0_endAt'], 'Session end time must be strictly after session start time.');

  // Session title too short
  errors = validateWorkshopForm({
    ...base,
    sessions: [
      {
        title: 'A',
        startAt: '2026-11-01T10:00',
        endAt: '2026-11-01T12:00'
      }
    ]
  });
  assert.equal(errors['session_0_title'], 'Session title must be at least 2 characters.');
});

test('7. Form Validation — Trainers and Tab Mapping', () => {
  const base = {
    ...getInitialWorkshopFormData(false, ''),
    title: 'Valid Workshop',
    description: 'Valid workshop description with details',
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T18:00',
    registrationDeadline: '2026-10-31T18:00',
    sessions: [{ title: 'Session 1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }]
  };

  // Trainer with blank name
  let errors = validateWorkshopForm({
    ...base,
    trainers: [{ trainerType: 'EXTERNAL', name: '  ' }]
  });
  assert.equal(errors['trainer_0_name'], 'Trainer name is required.');

  // Verify tab mappings
  assert.equal(getTabForErrorKey('title'), 'basic');
  assert.equal(getTabForErrorKey('mode'), 'logistics');
  assert.equal(getTabForErrorKey('venue'), 'logistics');
  assert.equal(getTabForErrorKey('meetingLink'), 'logistics');
  assert.equal(getTabForErrorKey('trainer_0_name'), 'trainers');
  assert.equal(getTabForErrorKey('targetAudience'), 'audience');
  assert.equal(getTabForErrorKey('sessions'), 'sessions');
  assert.equal(getTabForErrorKey('session_0_startAt'), 'sessions');
});

test('8. Form Validation — Fully Valid Form Passes with 0 Errors', () => {
  const validWorkshop = {
    title: 'Advanced Full Stack Web Engineering Masterclass',
    description: 'Comprehensive 1-day masterclass covering React, Node, microservices, and system design.',
    category: 'TECHNICAL',
    ownershipType: 'DEPARTMENT',
    departmentId: '6ac9900ab9b209e72071c6cd',
    mode: 'HYBRID',
    venue: 'VVWU Main Auditorium',
    meetingLink: 'https://meet.google.com/abc-defg-hij',
    bannerUrl: 'https://example.com/banner.png',
    maxParticipants: 100,
    startAt: '2026-11-15T09:00',
    endAt: '2026-11-15T17:00',
    registrationOpensAt: '2026-11-01T09:00',
    registrationDeadline: '2026-11-14T23:59',
    trainers: [
      {
        trainerType: 'EXTERNAL',
        name: 'Dr. Jane Doe',
        designation: 'Principal Architect',
        organization: 'CloudTech Labs'
      }
    ],
    targetAudience: { isAllDepartments: true, departmentRules: [] },
    sessions: [
      {
        title: 'Morning: Architecture & React 18',
        startAt: '2026-11-15T09:00',
        endAt: '2026-11-15T12:30'
      },
      {
        title: 'Afternoon: Node Backend & DB Scaling',
        startAt: '2026-11-15T13:30',
        endAt: '2026-11-15T17:00'
      }
    ]
  };

  const errors = validateWorkshopForm(validWorkshop, { isCoordinator: true });
  assert.deepEqual(errors, {}, 'Valid workshop must produce 0 errors');
});

test('9. Course Targeting Payload — Single Department (One Course vs All Courses) & Campus-wide', () => {
  const deptId = '6ac9900ab9b209e72071c6cd';
  const courseId = '6ac99963d925d911687eaaf6';

  // Case 1: One course, one department
  const oneCoursePayload = buildTargetAudiencePayload({
    targetingScope: 'SINGLE_DEPARTMENT',
    departmentId: deptId,
    targetCourseId: courseId
  });
  assert.equal(oneCoursePayload.isAllDepartments, false);
  assert.equal(oneCoursePayload.departmentRules.length, 1);
  assert.equal(oneCoursePayload.departmentRules[0].departmentId, deptId);
  assert.equal(oneCoursePayload.departmentRules[0].targetingMode, 'SELECTED_COURSES_ALL_SEMESTERS');
  assert.deepEqual(oneCoursePayload.departmentRules[0].courseIds, [courseId]);

  // Case 2: One department, all courses
  const allCoursesPayload = buildTargetAudiencePayload({
    targetingScope: 'SINGLE_DEPARTMENT',
    departmentId: deptId,
    targetCourseId: 'ALL'
  });
  assert.equal(allCoursesPayload.isAllDepartments, false);
  assert.equal(allCoursesPayload.departmentRules.length, 1);
  assert.equal(allCoursesPayload.departmentRules[0].departmentId, deptId);
  assert.equal(allCoursesPayload.departmentRules[0].targetingMode, 'ALL_COURSES_ALL_SEMESTERS');
  assert.deepEqual(allCoursesPayload.departmentRules[0].courseIds, []);

  // Case 3: All departments campus-wide
  const campusWidePayload = buildTargetAudiencePayload({
    targetingScope: 'ALL_DEPARTMENTS',
    departmentId: deptId
  });
  assert.equal(campusWidePayload.isAllDepartments, true);
  assert.deepEqual(campusWidePayload.departmentRules, []);
});

test('10. Course Targeting Payload — Multiple Departments with Multiple Courses & Validation', () => {
  const dept1 = '6ac9900ab9b209e72071c6cd';
  const dept2 = '6ac9900ab9b209e72071c6ce';
  const course1 = '6ac99963d925d911687eaaf6';
  const course2 = '6ac99963d925d911687eaaf7';

  // Multi-department payload construction
  const multiPayload = buildTargetAudiencePayload({
    targetingScope: 'MULTI_DEPARTMENT',
    targetAudience: {
      departmentRules: [
        {
          departmentId: dept1,
          targetingMode: 'SELECTED_COURSES_ALL_SEMESTERS',
          courseIds: [course1, course2]
        },
        {
          departmentId: dept2,
          targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
          courseIds: []
        }
      ]
    }
  });

  assert.equal(multiPayload.isAllDepartments, false);
  assert.equal(multiPayload.departmentRules.length, 2);
  assert.equal(multiPayload.departmentRules[0].departmentId, dept1);
  assert.equal(multiPayload.departmentRules[0].targetingMode, 'SELECTED_COURSES_ALL_SEMESTERS');
  assert.deepEqual(multiPayload.departmentRules[0].courseIds, [course1, course2]);
  assert.equal(multiPayload.departmentRules[1].departmentId, dept2);
  assert.equal(multiPayload.departmentRules[1].targetingMode, 'ALL_COURSES_ALL_SEMESTERS');

  // Multi-department validation: empty departmentRules error
  const emptyRulesError = validateWorkshopForm({
    title: 'Valid Title Here',
    description: 'Valid Description Here for Workshop',
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T12:00',
    registrationDeadline: '2026-10-31T18:00',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    sessions: [{ title: 'S1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }],
    targetingScope: 'MULTI_DEPARTMENT',
    targetAudience: { departmentRules: [] }
  });
  assert.equal(emptyRulesError.targetAudience, 'Please select at least one department for multi-department targeting.');

  // Multi-department validation: department has specific mode but 0 courses selected
  const emptyCoursesError = validateWorkshopForm({
    title: 'Valid Title Here',
    description: 'Valid Description Here for Workshop',
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T12:00',
    registrationDeadline: '2026-10-31T18:00',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    sessions: [{ title: 'S1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }],
    targetingScope: 'MULTI_DEPARTMENT',
    targetAudience: {
      departmentRules: [
        {
          departmentId: dept1,
          targetingMode: 'SELECTED_COURSES_ALL_SEMESTERS',
          courseIds: []
        }
      ]
    }
  });
  assert.equal(emptyCoursesError.targetAudience, 'Please select at least one course for each department with specific course targeting.');
});

test('11. Single Department — Multiple Course Selection and Validation', () => {
  const deptId = '6ac9900ab9b209e72071c6cd';
  const course1 = '6ac99963d925d911687eaaf6';
  const course2 = '6ac99963d925d911687eaaf7';

  // 1. Multiple courses selected in single department
  const multiCoursePayload = buildTargetAudiencePayload({
    targetingScope: 'SINGLE_DEPARTMENT',
    departmentId: deptId,
    targetCourseScope: 'SPECIFIC',
    targetCourseIds: [course1, course2]
  });
  assert.equal(multiCoursePayload.isAllDepartments, false);
  assert.equal(multiCoursePayload.departmentRules.length, 1);
  assert.equal(multiCoursePayload.departmentRules[0].departmentId, deptId);
  assert.equal(multiCoursePayload.departmentRules[0].targetingMode, 'SELECTED_COURSES_ALL_SEMESTERS');
  assert.deepEqual(multiCoursePayload.departmentRules[0].courseIds, [course1, course2]);

  // 2. Specific mode with 0 courses selected triggers validation error
  const invalidSpecific = validateWorkshopForm({
    title: 'Valid Title Here',
    description: 'Valid Description Here for Workshop',
    category: 'TECHNICAL',
    ownershipType: 'DEPARTMENT',
    departmentId: deptId,
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T12:00',
    registrationDeadline: '2026-10-31T18:00',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    sessions: [{ title: 'S1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }],
    targetingScope: 'SINGLE_DEPARTMENT',
    targetCourseScope: 'SPECIFIC',
    targetCourseIds: []
  });
  assert.equal(
    invalidSpecific.targetCourseIds,
    'Please select at least one course for specific course targeting, or switch to "All Courses in this Department".'
  );

  // 3. Specific mode with multiple courses validly passes
  const validSpecific = validateWorkshopForm({
    title: 'Valid Title Here',
    description: 'Valid Description Here for Workshop',
    category: 'TECHNICAL',
    ownershipType: 'DEPARTMENT',
    departmentId: deptId,
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T12:00',
    registrationDeadline: '2026-10-31T18:00',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    sessions: [{ title: 'S1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }],
    targetingScope: 'SINGLE_DEPARTMENT',
    targetCourseScope: 'SPECIFIC',
    targetCourseIds: [course1, course2]
  });
  assert.equal(validSpecific.targetCourseIds, undefined);

  // 4. Tab mapping for targetCourseIds (now located in Target Audience tab)
  assert.equal(getTabForErrorKey('targetCourseIds'), 'audience');
});

test('12. Hierarchical Checkbox Audience — All Departments / Specific Department / Course Payload Handling', () => {
  const dept1 = '6ac9900ab9b209e72071c6cd';
  const dept2 = '6ac9900ab9b209e72071c6ce';
  const course1 = '6ac99963d925d911687eaaf6';

  // 1. All Departments checked returns clean isAllDepartments: true
  const allDeptsPayload = buildTargetAudiencePayload({
    targetAudience: {
      isAllDepartments: true,
      departmentRules: []
    }
  });
  assert.equal(allDeptsPayload.isAllDepartments, true);
  assert.deepEqual(allDeptsPayload.departmentRules, []);

  // 2. Specific departments with mixed all courses and selected courses
  const mixedPayload = buildTargetAudiencePayload({
    targetAudience: {
      isAllDepartments: false,
      departmentRules: [
        {
          departmentId: dept1,
          targetingMode: 'SELECTED_COURSES_ALL_SEMESTERS',
          courseIds: [course1]
        },
        {
          departmentId: dept2,
          targetingMode: 'ALL_COURSES_ALL_SEMESTERS',
          courseIds: []
        }
      ]
    }
  });
  assert.equal(mixedPayload.isAllDepartments, false);
  assert.equal(mixedPayload.departmentRules.length, 2);
  assert.equal(mixedPayload.departmentRules[0].targetingMode, 'SELECTED_COURSES_ALL_SEMESTERS');
  assert.deepEqual(mixedPayload.departmentRules[0].courseIds, [course1]);
  assert.equal(mixedPayload.departmentRules[1].targetingMode, 'ALL_COURSES_ALL_SEMESTERS');
  assert.deepEqual(mixedPayload.departmentRules[1].courseIds, []);

  // 3. Form validation passes with clean hierarchical audience
  const validHierarchical = validateWorkshopForm({
    title: 'Clean Hierarchy Masterclass',
    description: 'Testing clean audience checkboxes without descriptive text.',
    category: 'TECHNICAL',
    ownershipType: 'CENTRAL_PLACEMENT_CELL',
    maxParticipants: 50,
    startAt: '2026-11-01T10:00',
    endAt: '2026-11-01T12:00',
    registrationDeadline: '2026-10-31T18:00',
    mode: 'ONLINE',
    meetingLink: 'https://meet.google.com/abc',
    sessions: [{ title: 'S1', startAt: '2026-11-01T10:00', endAt: '2026-11-01T12:00' }],
    targetAudience: {
      isAllDepartments: true,
      departmentRules: []
    }
  });
  assert.deepEqual(validHierarchical, {}, 'Clean hierarchical audience form passes with zero errors');
});


