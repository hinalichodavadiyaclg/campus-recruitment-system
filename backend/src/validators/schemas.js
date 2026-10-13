import { z } from 'zod';

const strongPassword = z
  .string()
  .min(12)
  .max(256)
  .regex(/[a-z]/, 'Must include a lowercase letter.')
  .regex(/[A-Z]/, 'Must include an uppercase letter.')
  .regex(/\d/, 'Must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Must include a symbol.');

const optionalPassword = z
  .string()
  .max(256)
  .optional()
  .transform((val) => (val && val.trim() ? val.trim() : undefined))
  .refine(
    (val) =>
      !val ||
      (val.length >= 12 && /[a-z]/.test(val) && /[A-Z]/.test(val) && /\d/.test(val) && /[^A-Za-z0-9]/.test(val)),
    { message: 'Password must be at least 12 characters with symbol, uppercase, lowercase, and number.' }
  );

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const accessId = z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
export const isValid10DigitMobile = (value) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  let clean = trimmed;
  if (clean.startsWith('+91')) {
    clean = clean.slice(3).trim();
  } else if (clean.startsWith('91') && clean.replace(/\D/g, '').length === 12) {
    clean = clean.slice(2).trim();
  } else if (clean.startsWith('0') && clean.replace(/\D/g, '').length === 11) {
    clean = clean.slice(1).trim();
  }
  const digits = clean.replace(/[\s\-()]/g, '');
  return /^\d{10}$/.test(digits);
};

const mobileNumber = z
  .string()
  .trim()
  .refine(isValid10DigitMobile, {
    message: 'Mobile number must be exactly 10 digits (e.g. 9876543210 or +91 9876543210).'
  });

const optionalMobileNumber = z
  .string()
  .trim()
  .optional()
  .refine(
    (val) => {
      if (!val || val === '') return true;
      return isValid10DigitMobile(val);
    },
    { message: 'Mobile number must be exactly 10 digits (e.g. 9876543210 or +91 9876543210).' }
  );

const emptyParams = z.object({}).default({});
const emptyQuery = z.object({}).default({});
const emptyBody = z.object({}).default({});

const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(256)
  }),
  params: emptyParams,
  query: emptyQuery
});

export const changePasswordSchema = z.object({
  body: z.object({ currentPassword: z.string().min(1).max(256), newPassword: strongPassword }),
  params: emptyParams,
  query: emptyQuery
});

export const forgotPasswordSchema = z.object({ body: z.object({ email }), params: emptyParams, query: emptyQuery });
export const resetPasswordSchema = z.object({
  body: z.object({ token: z.string().min(20).max(4096), newPassword: strongPassword }),
  params: emptyParams,
  query: emptyQuery
});

export const roleCreateSchema = z.object({
  body: z.object({
    id: accessId,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(5).max(500),
    permissionIds: z.array(accessId).max(200).default([])
  }),
  params: emptyParams,
  query: emptyQuery
});

export const roleUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      description: z.string().trim().min(5).max(500).optional(),
      permissionIds: z.array(accessId).max(200).optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
  params: z.object({ id: accessId }),
  query: emptyQuery
});

export const rolePermissionsSchema = z.object({
  body: z.object({
    permissionIds: z.array(accessId).max(200).default([])
  }),
  params: z.object({ id: accessId }),
  query: emptyQuery
});

export const roleStatusSchema = z.object({
  body: z.object({ isActive: z.boolean() }),
  params: z.object({ id: accessId }),
  query: emptyQuery
});

export const permissionCreateSchema = z.object({
  body: z.object({
    id: accessId,
    name: z.string().trim().min(2).max(100),
    module: z.string().trim().min(2).max(100),
    action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE']),
    description: z.string().trim().min(5).max(500)
  }),
  params: emptyParams,
  query: emptyQuery
});

export const permissionUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      module: z.string().trim().min(2).max(100).optional(),
      action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE', 'MANAGE']).optional(),
      description: z.string().trim().min(5).max(500).optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
  params: z.object({ id: accessId }),
  query: emptyQuery
});

export const permissionStatusSchema = z.object({
  body: z.object({ isActive: z.boolean() }),
  params: z.object({ id: accessId }),
  query: emptyQuery
});

export const resourceIdParamsSchema = z.object({ body: emptyBody, params: z.object({ id: accessId }), query: emptyQuery });
export const userIdParamsSchema = z.object({ body: emptyBody, params: z.object({ id: objectId }), query: emptyQuery });

export const userCreateSchema = z.object({
  body: z.object({
    email,
    password: optionalPassword,
    userType: z.enum(['STUDENT', 'COMPANY', 'PLACEMENT']),
    roleId: accessId,
    universityId: z.string().trim().min(1).max(50).optional(),
    employeeId: z.string().trim().min(1).max(50).optional(),
    companyId: objectId.optional(),
    accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).default('ACTIVE')
  }),
  params: emptyParams,
  query: emptyQuery
});

export const userUpdateSchema = z.object({
  body: z
    .object({
      email: email.optional(),
      password: optionalPassword,
      userType: z.enum(['STUDENT', 'COMPANY', 'PLACEMENT']).optional(),
      roleId: accessId.optional(),
      universityId: z.string().trim().min(1).max(50).optional(),
      employeeId: z.string().trim().min(1).max(50).optional(),
      companyId: objectId.optional(),
      accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const usersListSchema = z.object({
  body: emptyBody,
  params: emptyParams,
  query: pagination.extend({
    userType: z.enum(['STUDENT', 'COMPANY', 'PLACEMENT']).optional(),
    accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(),
    roleId: accessId.optional()
  })
});

const dateInput = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a valid date.');
export const sessionsListSchema = z.object({
  body: emptyBody,
  params: emptyParams,
  query: pagination.extend({
    userId: objectId.optional(),
    userType: z.enum(['STUDENT', 'COMPANY', 'PLACEMENT']).optional(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'LOGGED_OUT']).optional(),
    dateFrom: dateInput.optional(),
    dateTo: dateInput.optional()
  })
});

export const userStatusSchema = z.object({
  body: z.object({ accountStatus: z.enum(['ACTIVE', 'INACTIVE']) }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const userLockSchema = z.object({
  body: z.object({ lockMinutes: z.coerce.number().int().min(1).max(525_600).optional() }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const userRoleSchema = z.object({
  body: z.object({ roleId: accessId }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const importParamsSchema = z.object({
  body: emptyBody,
  params: z.object({ type: z.enum(['student', 'company', 'placement']) }),
  query: emptyQuery
});

export const importValidateSchema = z.object({
  body: z.object({
    rows: z.array(z.record(z.any())).min(1).max(10_000)
  }),
  params: z.object({ type: z.enum(['student', 'company', 'placement']) }),
  query: emptyQuery
});

export const importConfirmSchema = z.object({
  body: z.object({
    rows: z.array(z.record(z.any())).min(1).max(10_000)
  }),
  params: z.object({ type: z.enum(['student', 'company', 'placement']) }),
  query: emptyQuery
});

export const studentCreateSchema = z.object({
  body: z.object({
    universityId: z.string().trim().min(1).max(100),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email,
    mobileNumber,
    address: z.string().trim().max(500).optional().default(''),
    branch: z.string().trim().min(1).max(100),
    department: z.string().trim().min(1).max(100),
    departmentId: objectId.optional(),
    courseId: objectId.optional(),
    headline: z.string().trim().max(200).optional(),
    semester: z.coerce.number().int().min(1).max(12),
    cgpa: z.coerce.number().min(0).max(10),
    backlogs: z.coerce.number().int().min(0).optional().default(0),
    passingYear: z.coerce.number().int().min(1990).max(2100).optional(),
    password: optionalPassword
  }),
  params: emptyParams,
  query: emptyQuery
});

export const studentUpdateSchema = z.object({
  body: z.object({
    universityId: z.string().trim().min(1).max(100).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
    mobileNumber: optionalMobileNumber,
    address: z.string().trim().max(500).optional(),
    branch: z.string().trim().min(1).max(100).optional(),
    department: z.string().trim().min(1).max(100).optional(),
    departmentId: objectId.optional(),
    courseId: objectId.optional(),
    headline: z.string().trim().max(200).optional(),
    semester: z.coerce.number().int().min(1).max(12).optional(),
    cgpa: z.coerce.number().min(0).max(10).optional(),
    backlogs: z.coerce.number().int().min(0).optional(),
    passingYear: z.coerce.number().int().min(1990).max(2100).optional()
  }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const companyCreateSchema = z.object({
  body: z.object({
    companyName: z.string().trim().min(1).max(200),
    industryType: z.string().trim().min(1).max(100),
    hrRecruiterName: z.string().trim().min(1).max(100),
    email,
    yearEstablished: z.coerce.number().int().min(1800).max(2100),
    description: z.string().trim().max(1000).optional().default(''),
    website: z.string().trim().max(300).optional().default(''),
    designation: z.string().trim().max(100).optional().default(''),
    mobileNumber: optionalMobileNumber.default(''),
    officeAddress: z.string().trim().max(500).optional().default(''),
    password: optionalPassword
  }),
  params: emptyParams,
  query: emptyQuery
});

export const companyUpdateSchema = z.object({
  body: z.object({
    companyName: z.string().trim().min(1).max(200).optional(),
    industryType: z.string().trim().min(1).max(100).optional(),
    hrRecruiterName: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
    description: z.string().trim().max(1000).optional(),
    website: z.string().trim().max(300).optional(),
    yearEstablished: z.coerce.number().int().min(1800).max(2100).optional(),
    designation: z.string().trim().max(100).optional(),
    mobileNumber: optionalMobileNumber,
    officeAddress: z.string().trim().max(500).optional()
  }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const companyRecruiterParamsSchema = z.object({
  body: emptyBody,
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const companyRecruiterDetailParamsSchema = z.object({
  body: emptyBody,
  params: z.object({ id: objectId, recruiterId: objectId }),
  query: emptyQuery
});

export const companyRecruiterCreateSchema = z.object({
  body: z.object({
    hrRecruiterName: z.string().trim().min(1).max(100).optional(),
    designation: z.string().trim().min(1).max(100).optional(),
    email,
    mobileNumber: z.string().trim().max(50).optional(),
    password: optionalPassword,
    roleId: z.string().optional(),
    accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED']).default('ACTIVE')
  }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const companyRecruiterUpdateSchema = z.object({
  body: z
    .object({
      hrRecruiterName: z.string().trim().min(1).max(100).optional(),
      designation: z.string().trim().min(1).max(100).optional(),
      email: email.optional(),
      mobileNumber: z.string().trim().max(50).optional(),
      password: optionalPassword,
      roleId: z.string().optional(),
      accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED']).optional(),
      isPrimary: z.boolean().optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
  params: z.object({ id: objectId, recruiterId: objectId }),
  query: emptyQuery
});

export const placementOfficerCreateSchema = z.object({
  body: z.object({
    employeeId: z.string().trim().min(1).max(100),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email,
    mobileNumber: z.string().trim().max(50).optional(),
    designation: z.string().trim().min(1).max(100),
    departmentId: objectId.optional().nullable(),
    department: z.string().trim().max(100).optional(),
    role: z.enum(['ROLE_PLACEMENT_HEAD', 'ROLE_PLACEMENT_COORDINATOR']).optional().default('ROLE_PLACEMENT_COORDINATOR'),
    password: optionalPassword
  }),
  params: emptyParams,
  query: emptyQuery
});

export const placementOfficerUpdateSchema = z.object({
  body: z.object({
    employeeId: z.string().trim().min(1).max(100).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
    mobileNumber: z.string().trim().max(50).optional(),
    designation: z.string().trim().min(1).max(100).optional(),
    departmentId: objectId.optional().nullable(),
    department: z.string().trim().max(100).optional(),
    role: z.enum(['ROLE_PLACEMENT_HEAD', 'ROLE_PLACEMENT_COORDINATOR']).optional()
  }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const departmentCreateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().min(1).max(20),
    description: z.string().trim().max(500).optional().default('')
  }),
  params: emptyParams,
  query: emptyQuery
});

export const departmentUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      code: z.string().trim().min(1).max(20).optional(),
      description: z.string().trim().max(500).optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const departmentStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean()
  }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const departmentsListSchema = z.object({
  body: emptyBody,
  params: emptyParams,
  query: pagination.extend({
    search: z.string().trim().optional(),
    isActive: z
      .string()
      .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined))
      .optional()
  })
});

const courseLevelEnum = z.enum(['UNDERGRADUATE', 'POSTGRADUATE', 'DIPLOMA', 'CERTIFICATE', 'DOCTORAL']);

export const courseCreateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().min(1).max(20),
    departmentId: objectId,
    level: courseLevelEnum,
    durationYears: z.coerce.number().min(0.5).max(10).optional(),
    description: z.string().trim().max(500).optional().default('')
  }),
  params: emptyParams,
  query: emptyQuery
});

export const courseUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      code: z.string().trim().min(1).max(20).optional(),
      departmentId: objectId.optional(),
      level: courseLevelEnum.optional(),
      durationYears: z.coerce.number().min(0.5).max(10).optional(),
      description: z.string().trim().max(500).optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const courseStatusSchema = z.object({
  body: z.object({
    isActive: z.boolean()
  }),
  params: z.object({ id: objectId }),
  query: emptyQuery
});

export const coursesListSchema = z.object({
  body: emptyBody,
  params: emptyParams,
  query: pagination.extend({
    search: z.string().trim().optional(),
    departmentId: objectId.optional(),
    level: courseLevelEnum.optional(),
    isActive: z
      .string()
      .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined))
      .optional()
  })
});



