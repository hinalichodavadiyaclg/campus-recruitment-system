import { z } from 'zod';
import {
  WORKSHOP_CATEGORIES,
  WORKSHOP_MODES,
  WORKSHOP_OWNERSHIP_TYPES,
  WORKSHOP_APPROVAL_STATUSES,
  WORKSHOP_LIFECYCLE_STATUSES,
  TRAINER_TYPES,
  TARGETING_MODES
} from '../models/workshop.model.js';
import { REGISTRATION_STATUSES } from '../models/workshop_registration.model.js';
import { ATTENDANCE_STATUSES } from '../models/workshop_attendance.model.js';
import { CERTIFICATE_STATUSES } from '../models/workshop_certificate.model.js';
import { AUDIT_ENTITY_TYPES } from '../models/workshop_audit_log.model.js';

// ==========================================
// Reusable Base Validation Helpers
// ==========================================

export const objectId = z
  .string({ required_error: 'ObjectId is required.' })
  .trim()
  .regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId format.');

export const emptyParams = z.object({}).strict().default({});
export const emptyQuery = z.object({}).strict().default({});
export const emptyBody = z.object({}).strict().default({});

/**
 * Strict boolean query parameter parser.
 * Rejects any value that is not exactly 'true' or 'false' (e.g. '1', 'yes', 'invalid').
 * Never silently defaults invalid inputs to undefined.
 */
export const strictBooleanQuery = z
  .enum(['true', 'false'], {
    errorMap: () => ({ message: "Boolean query parameter must be 'true' or 'false'." })
  })
  .transform((val) => val === 'true');

/**
 * Strict integer query parameter parser.
 * Rejects negative numbers, non-numeric strings, or out-of-bound values.
 * Never silently converts 'abc' or '' to numbers.
 */
export const strictIntegerQuery = ({ min = 1, max = 10000, defaultValue = undefined } = {}) => {
  const base = z
    .string()
    .trim()
    .regex(/^(0|[1-9]\d*)$/, 'Must be a valid non-negative integer.')
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= min && val <= max, {
      message: `Must be an integer between ${min} and ${max}.`
    });

  return defaultValue !== undefined ? base.default(String(defaultValue)) : base.optional();
};

export const paginationQuery = z.object({
  page: strictIntegerQuery({ min: 1, max: 10000, defaultValue: 1 }),
  limit: strictIntegerQuery({ min: 1, max: 100, defaultValue: 20 })
});

// ==========================================
// Nested Workshop Subdocument Schemas
// ==========================================

export const trainerInputSchema = z
  .object({
    trainerType: z.enum(TRAINER_TYPES, {
      errorMap: () => ({ message: `trainerType must be one of: ${TRAINER_TYPES.join(', ')}` })
    }),
    name: z.string().trim().min(1, 'Trainer name is required.').max(100),
    designation: z.string().trim().max(100).optional(),
    organization: z.string().trim().max(100).optional(),
    userId: objectId.optional(),
    companyId: objectId.optional()
  })
  .strict()
  .superRefine((trainer, ctx) => {
    if (trainer.trainerType === 'COMPANY') {
      if (!trainer.companyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'companyId is required when trainerType is COMPANY.',
          path: ['companyId']
        });
      }
      if (trainer.userId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'userId must be absent when trainerType is COMPANY.',
          path: ['userId']
        });
      }
    } else if (
      trainer.trainerType === 'PLACEMENT_COORDINATOR' ||
      trainer.trainerType === 'PLACEMENT_HEAD'
    ) {
      if (!trainer.userId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `userId is required when trainerType is ${trainer.trainerType}.`,
          path: ['userId']
        });
      }
      if (trainer.companyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `companyId must be absent when trainerType is ${trainer.trainerType}.`,
          path: ['companyId']
        });
      }
    } else if (trainer.trainerType === 'EXTERNAL') {
      if (trainer.userId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'userId must be absent when trainerType is EXTERNAL.',
          path: ['userId']
        });
      }
      if (trainer.companyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'companyId must be absent when trainerType is EXTERNAL.',
          path: ['companyId']
        });
      }
    }
  });

export const courseSemesterRuleInputSchema = z
  .object({
    courseId: objectId,
    semesters: z
      .array(z.number().int().min(1).max(12), {
        required_error: 'semesters must be specified for each course rule.'
      })
      .min(1, 'semesters array must be non-empty.')
  })
  .strict();

export const departmentRuleInputSchema = z
  .object({
    departmentId: objectId,
    targetingMode: z.enum(TARGETING_MODES, {
      errorMap: () => ({ message: `targetingMode must be one of: ${TARGETING_MODES.join(', ')}` })
    }),
    semesters: z.array(z.number().int().min(1).max(12)).default([]),
    courseIds: z.array(objectId).default([]),
    courseSemesterRules: z.array(courseSemesterRuleInputSchema).default([])
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.targetingMode === 'ALL_COURSES_ALL_SEMESTERS') {
      if (rule.semesters && rule.semesters.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'semesters must be empty when targetingMode is ALL_COURSES_ALL_SEMESTERS.',
          path: ['semesters']
        });
      }
      if (rule.courseIds && rule.courseIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseIds must be empty when targetingMode is ALL_COURSES_ALL_SEMESTERS.',
          path: ['courseIds']
        });
      }
      if (rule.courseSemesterRules && rule.courseSemesterRules.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseSemesterRules must be empty when targetingMode is ALL_COURSES_ALL_SEMESTERS.',
          path: ['courseSemesterRules']
        });
      }
    } else if (rule.targetingMode === 'ALL_COURSES_SELECTED_SEMESTERS') {
      if (!rule.semesters || rule.semesters.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'semesters must be a non-empty array when targetingMode is ALL_COURSES_SELECTED_SEMESTERS.',
          path: ['semesters']
        });
      }
      if (rule.courseIds && rule.courseIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseIds must be empty when targetingMode is ALL_COURSES_SELECTED_SEMESTERS.',
          path: ['courseIds']
        });
      }
      if (rule.courseSemesterRules && rule.courseSemesterRules.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseSemesterRules must be empty when targetingMode is ALL_COURSES_SELECTED_SEMESTERS.',
          path: ['courseSemesterRules']
        });
      }
    } else if (rule.targetingMode === 'SELECTED_COURSES_ALL_SEMESTERS') {
      if (!rule.courseIds || rule.courseIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseIds must be a non-empty array when targetingMode is SELECTED_COURSES_ALL_SEMESTERS.',
          path: ['courseIds']
        });
      }
      if (rule.semesters && rule.semesters.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'semesters must be empty when targetingMode is SELECTED_COURSES_ALL_SEMESTERS.',
          path: ['semesters']
        });
      }
      if (rule.courseSemesterRules && rule.courseSemesterRules.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseSemesterRules must be empty when targetingMode is SELECTED_COURSES_ALL_SEMESTERS.',
          path: ['courseSemesterRules']
        });
      }
    } else if (rule.targetingMode === 'CUSTOM_COURSE_SEMESTER_RULES') {
      if (!rule.courseSemesterRules || rule.courseSemesterRules.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseSemesterRules must be a non-empty array when targetingMode is CUSTOM_COURSE_SEMESTER_RULES.',
          path: ['courseSemesterRules']
        });
      }
      if (rule.semesters && rule.semesters.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'semesters must be empty when targetingMode is CUSTOM_COURSE_SEMESTER_RULES.',
          path: ['semesters']
        });
      }
      if (rule.courseIds && rule.courseIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'courseIds must be empty when targetingMode is CUSTOM_COURSE_SEMESTER_RULES.',
          path: ['courseIds']
        });
      }
    }
  });

export const targetAudienceInputSchema = z
  .object({
    isAllDepartments: z.boolean().default(false),
    departmentRules: z.array(departmentRuleInputSchema).default([])
  })
  .strict();

export const sessionInputSchema = z
  .object({
    sessionId: z.string().trim().min(1, 'sessionId is required.').max(50),
    sessionNumber: z.number().int().min(1, 'sessionNumber must be an integer >= 1.'),
    title: z.string().trim().min(1, 'Session title is required.').max(200),
    description: z.string().trim().max(2000).optional(),
    startAt: z.coerce.date({ required_error: 'Session startAt is required.' }),
    endAt: z.coerce.date({ required_error: 'Session endAt is required.' }),
    trainerIds: z.array(z.string().trim()).default([]),
    venue: z.string().trim().max(200).optional(),
    meetingLink: z.string().trim().url('meetingLink must be a valid URL.').max(1000).optional(),
    isAttendanceRequired: z.boolean().default(true)
  })
  .strict()
  .refine((session) => session.endAt > session.startAt, {
    message: 'Session endAt must be after session startAt.',
    path: ['endAt']
  });

// ==========================================
// 1. Workshop Creation & Update Schemas
// ==========================================

export const workshopCreateSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(200),
      description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(5000),
      category: z.enum(WORKSHOP_CATEGORIES, {
        errorMap: () => ({ message: `category must be one of: ${WORKSHOP_CATEGORIES.join(', ')}` })
      }),
      mode: z.enum(WORKSHOP_MODES, {
        errorMap: () => ({ message: `mode must be one of: ${WORKSHOP_MODES.join(', ')}` })
      }),
      bannerUrl: z.string().trim().url('bannerUrl must be a valid URL.').max(1000).optional(),
      ownershipType: z.enum(WORKSHOP_OWNERSHIP_TYPES).default('DEPARTMENT'),
      departmentId: objectId.optional(),
      coordinatorId: objectId.optional(),
      maxParticipants: z.coerce
        .number()
        .int('maxParticipants must be an integer.')
        .min(1, 'maxParticipants must be at least 1.')
        .max(10000, 'maxParticipants cannot exceed 10000.'),
      startAt: z.coerce.date({ required_error: 'Workshop startAt is required.' }),
      endAt: z.coerce.date({ required_error: 'Workshop endAt is required.' }),
      registrationOpensAt: z.coerce.date().optional(),
      registrationDeadline: z.coerce.date({ required_error: 'Workshop registrationDeadline is required.' }),
      venue: z.string().trim().max(200).optional(),
      meetingLink: z.string().trim().url('meetingLink must be a valid URL.').max(1000).optional(),
      trainers: z.array(trainerInputSchema).default([]),
      targetAudience: targetAudienceInputSchema.default({ isAllDepartments: false, departmentRules: [] }),
      sessions: z.array(sessionInputSchema).min(1, 'Every workshop must have at least one session.')
    })
    .strict()
    .superRefine((data, ctx) => {
      // 1. Schedule date ordering
      if (data.startAt && data.endAt && data.endAt <= data.startAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Workshop endAt must be after startAt.',
          path: ['endAt']
        });
      }

      // 2. Registration deadline ordering
      if (data.registrationOpensAt && data.registrationDeadline && data.registrationDeadline <= data.registrationOpensAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'registrationDeadline must be after registrationOpensAt.',
          path: ['registrationDeadline']
        });
      }

      // 3. Registration cannot close after workshop begins
      if (data.startAt && data.registrationDeadline && data.registrationDeadline > data.startAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'registrationDeadline cannot be after workshop startAt.',
          path: ['registrationDeadline']
        });
      }

      // 4. Mode-specific venue/meetingLink requirement
      if (data.mode === 'OFFLINE' && (!data.venue || data.venue.trim().length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'venue is required when mode is OFFLINE.',
          path: ['venue']
        });
      }
      if (data.mode === 'ONLINE' && (!data.meetingLink || data.meetingLink.trim().length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'meetingLink is required when mode is ONLINE.',
          path: ['meetingLink']
        });
      }
      if (data.mode === 'HYBRID') {
        if (!data.venue || data.venue.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'venue is required when mode is HYBRID.',
            path: ['venue']
          });
        }
        if (!data.meetingLink || data.meetingLink.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'meetingLink is required when mode is HYBRID.',
            path: ['meetingLink']
          });
        }
      }

      // 5. Ownership consistency
      if (data.ownershipType === 'DEPARTMENT' && !data.departmentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'departmentId is required when ownershipType is DEPARTMENT.',
          path: ['departmentId']
        });
      }
      if (data.ownershipType === 'CENTRAL_PLACEMENT_CELL' && data.departmentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'departmentId must be absent when ownershipType is CENTRAL_PLACEMENT_CELL.',
          path: ['departmentId']
        });
      }

      // 6. Session consistency & containment
      if (Array.isArray(data.sessions) && data.sessions.length > 0) {
        const sessionIds = new Set();
        const sessionNumbers = new Set();

        for (let i = 0; i < data.sessions.length; i++) {
          const s = data.sessions[i];
          if (sessionIds.has(s.sessionId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate sessionId "${s.sessionId}" within sessions array.`,
              path: ['sessions', i, 'sessionId']
            });
          }
          sessionIds.add(s.sessionId);

          if (sessionNumbers.has(s.sessionNumber)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate sessionNumber "${s.sessionNumber}" within sessions array.`,
              path: ['sessions', i, 'sessionNumber']
            });
          }
          sessionNumbers.add(s.sessionNumber);

          // Session schedule bounds containment
          if (data.startAt && s.startAt && s.startAt < data.startAt) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Session "${s.title}" startAt cannot be before workshop startAt.`,
              path: ['sessions', i, 'startAt']
            });
          }
          if (data.endAt && s.endAt && s.endAt > data.endAt) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Session "${s.title}" endAt cannot be after workshop endAt.`,
              path: ['sessions', i, 'endAt']
            });
          }
        }
      }
    }),
  params: emptyParams,
  query: emptyQuery
});

/**
 * Partial update schema.
 * Rejects server-controlled fields via .strict().
 * Validates format of provided fields without requiring omitted create-time fields.
 * Any cross-field check that requires missing fields from the existing document
 * is strictly delegated to the service layer after document merge.
 */
export const workshopUpdateSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(200).optional(),
      description: z.string().trim().min(10).max(5000).optional(),
      category: z.enum(WORKSHOP_CATEGORIES).optional(),
      mode: z.enum(WORKSHOP_MODES).optional(),
      bannerUrl: z.string().trim().url().max(1000).optional().nullable(),
      ownershipType: z.enum(WORKSHOP_OWNERSHIP_TYPES).optional(),
      departmentId: objectId.optional().nullable(),
      coordinatorId: objectId.optional().nullable(),
      maxParticipants: z.coerce.number().int().min(1).max(10000).optional(),
      startAt: z.coerce.date().optional(),
      endAt: z.coerce.date().optional(),
      registrationOpensAt: z.coerce.date().optional().nullable(),
      registrationDeadline: z.coerce.date().optional(),
      venue: z.string().trim().max(200).optional().nullable(),
      meetingLink: z.string().trim().url().max(1000).optional().nullable(),
      trainers: z.array(trainerInputSchema).optional(),
      targetAudience: targetAudienceInputSchema.optional(),
      sessions: z.array(sessionInputSchema).min(1).optional()
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update.'
    })
    .superRefine((data, ctx) => {
      // Intra-payload cross-field validation ONLY when both fields are present
      if (data.startAt && data.endAt && data.endAt <= data.startAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Workshop endAt must be after startAt.',
          path: ['endAt']
        });
      }
      if (data.registrationOpensAt && data.registrationDeadline && data.registrationDeadline <= data.registrationOpensAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'registrationDeadline must be after registrationOpensAt.',
          path: ['registrationDeadline']
        });
      }
      if (data.startAt && data.registrationDeadline && data.registrationDeadline > data.startAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'registrationDeadline cannot be after workshop startAt.',
          path: ['registrationDeadline']
        });
      }
      if (data.ownershipType === 'CENTRAL_PLACEMENT_CELL' && data.departmentId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'departmentId must be absent when ownershipType is CENTRAL_PLACEMENT_CELL.',
          path: ['departmentId']
        });
      }
      if (Array.isArray(data.sessions)) {
        const sessionIds = new Set();
        const sessionNumbers = new Set();
        for (let i = 0; i < data.sessions.length; i++) {
          const s = data.sessions[i];
          if (sessionIds.has(s.sessionId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate sessionId "${s.sessionId}" in updated sessions.`,
              path: ['sessions', i, 'sessionId']
            });
          }
          sessionIds.add(s.sessionId);

          if (sessionNumbers.has(s.sessionNumber)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate sessionNumber "${s.sessionNumber}" in updated sessions.`,
              path: ['sessions', i, 'sessionNumber']
            });
          }
          sessionNumbers.add(s.sessionNumber);
        }
      }
    }),
  params: z.object({ id: objectId }).strict(),
  query: emptyQuery
});

// ==========================================
// 2. Workshop Query / Listing Schema
// ==========================================

export const workshopListQuerySchema = z.object({
  body: emptyBody,
  params: emptyParams,
  query: z
    .object({
      page: strictIntegerQuery({ min: 1, max: 10000, defaultValue: 1 }),
      limit: strictIntegerQuery({ min: 1, max: 100, defaultValue: 20 }),
      search: z.string().trim().max(100).optional(),
      category: z.enum(WORKSHOP_CATEGORIES).optional(),
      mode: z.enum(WORKSHOP_MODES).optional(),
      ownershipType: z.enum(WORKSHOP_OWNERSHIP_TYPES).optional(),
      departmentId: objectId.optional(),
      approvalStatus: z.enum(WORKSHOP_APPROVAL_STATUSES).optional(),
      lifecycleStatus: z.enum(WORKSHOP_LIFECYCLE_STATUSES).optional(),
      isPublished: strictBooleanQuery.optional(),
      startDateFrom: z.coerce.date().optional(),
      startDateTo: z.coerce.date().optional(),
      myRegistrationsOnly: strictBooleanQuery.optional()
    })
    .strict()
});

// ==========================================
// 3. Approval, Rejection & Lifecycle Schemas
// ==========================================

export const workshopApproveSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z
    .object({
      comment: z.string().trim().max(1000).optional()
    })
    .strict(),
  query: emptyQuery
});

export const workshopRejectSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z
    .object({
      reason: z
        .string({ required_error: 'Rejection reason is required.' })
        .trim()
        .min(5, 'Rejection reason must be at least 5 characters.')
        .max(1000, 'Rejection reason cannot exceed 1000 characters.')
    })
    .strict(),
  query: emptyQuery
});

export const workshopPublishSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: emptyBody,
  query: emptyQuery
});

export const workshopCancelSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z
    .object({
      reason: z
        .string({ required_error: 'Cancellation reason is required.' })
        .trim()
        .min(5, 'Cancellation reason must be at least 5 characters.')
        .max(1000, 'Cancellation reason cannot exceed 1000 characters.')
    })
    .strict(),
  query: emptyQuery
});

// ==========================================
// 4. Registration Schemas
// ==========================================

export const workshopRegisterSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: emptyBody,
  query: emptyQuery
});

export const workshopCancelRegistrationSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z
    .object({
      reason: z.string().trim().max(500).optional()
    })
    .strict(),
  query: emptyQuery
});

// ==========================================
// 5. Attendance Schemas
// ==========================================

export const attendeeItemSchema = z
  .object({
    registrationId: objectId,
    studentId: objectId,
    attendanceStatus: z.enum(ATTENDANCE_STATUSES, {
      errorMap: () => ({ message: `attendanceStatus must be one of: ${ATTENDANCE_STATUSES.join(', ')}` })
    }),
    remarks: z.string().trim().max(250).optional()
  })
  .strict();

export const workshopAttendanceSubmitSchema = z.object({
  params: z
    .object({
      id: objectId,
      sessionId: z.string().trim().min(1, 'sessionId is required.')
    })
    .strict(),
  body: z
    .object({
      attendees: z.array(attendeeItemSchema).min(1, 'Attendees array cannot be empty.'),
      correctionReason: z.string().trim().min(5, 'Correction reason must be at least 5 characters.').max(500).optional()
    })
    .strict()
    .superRefine((data, ctx) => {
      const studentIds = new Set();
      const registrationIds = new Set();

      for (let i = 0; i < data.attendees.length; i++) {
        const item = data.attendees[i];
        if (studentIds.has(item.studentId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate studentId "${item.studentId}" in attendance submission.`,
            path: ['attendees', i, 'studentId']
          });
        }
        studentIds.add(item.studentId);

        if (registrationIds.has(item.registrationId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate registrationId "${item.registrationId}" in attendance submission.`,
            path: ['attendees', i, 'registrationId']
          });
        }
        registrationIds.add(item.registrationId);
      }
    }),
  query: emptyQuery
});

// ==========================================
// 6. Certificate Issuance & Revocation Schemas
// ==========================================

export const workshopCertificateIssueSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z
    .object({
      registrationIds: z.array(objectId).min(1, 'registrationIds must be a non-empty array if specified.').optional()
    })
    .strict(),
  query: emptyQuery
});

export const workshopCertificateRevokeSchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: z
    .object({
      reason: z
        .string({ required_error: 'Revocation reason is required.' })
        .trim()
        .min(5, 'Revocation reason must be at least 5 characters.')
        .max(1000)
    })
    .strict(),
  query: emptyQuery
});

// ==========================================
// 7. Roster, Attendance, Certificate & Audit Query Schemas
// ==========================================

export const workshopRosterQuerySchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: emptyBody,
  query: z
    .object({
      page: strictIntegerQuery({ min: 1, max: 10000, defaultValue: 1 }),
      limit: strictIntegerQuery({ min: 1, max: 100, defaultValue: 20 }),
      status: z.enum(REGISTRATION_STATUSES).optional(),
      search: z.string().trim().max(100).optional()
    })
    .strict()
});

export const workshopAttendanceQuerySchema = z.object({
  params: z
    .object({
      id: objectId,
      sessionId: z.string().trim().min(1)
    })
    .strict(),
  body: emptyBody,
  query: z
    .object({
      page: strictIntegerQuery({ min: 1, max: 10000, defaultValue: 1 }),
      limit: strictIntegerQuery({ min: 1, max: 100, defaultValue: 20 }),
      status: z.enum(ATTENDANCE_STATUSES).optional()
    })
    .strict()
});

export const workshopCertificateQuerySchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: emptyBody,
  query: z
    .object({
      page: strictIntegerQuery({ min: 1, max: 10000, defaultValue: 1 }),
      limit: strictIntegerQuery({ min: 1, max: 100, defaultValue: 20 }),
      status: z.enum(CERTIFICATE_STATUSES).optional()
    })
    .strict()
});

export const workshopAuditLogQuerySchema = z.object({
  params: z.object({ id: objectId }).strict(),
  body: emptyBody,
  query: z
    .object({
      page: strictIntegerQuery({ min: 1, max: 10000, defaultValue: 1 }),
      limit: strictIntegerQuery({ min: 1, max: 100, defaultValue: 20 }),
      action: z.string().trim().max(100).optional(),
      entityType: z.enum(AUDIT_ENTITY_TYPES).optional()
    })
    .strict()
});
