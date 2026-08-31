import { z } from 'zod';

const strongPassword = z
  .string()
  .min(12)
  .max(256)
  .regex(/[a-z]/, 'Must include a lowercase letter.')
  .regex(/[A-Z]/, 'Must include an uppercase letter.')
  .regex(/\d/, 'Must include a number.')
  .regex(/[^A-Za-z0-9]/, 'Must include a symbol.');

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const accessId = z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/);
const emptyParams = z.object({}).default({});
const emptyQuery = z.object({}).default({});
const emptyBody = z.object({}).default({});

const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const loginSchema = z.object({
  body: z.object({ email, password: z.string().min(1).max(256) }),
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
    permissionIds: z.array(accessId).max(100).default([])
  }),
  params: emptyParams,
  query: emptyQuery
});

export const roleUpdateSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      description: z.string().trim().min(5).max(500).optional(),
      permissionIds: z.array(accessId).max(100).optional()
    })
    .refine((body) => Object.keys(body).length > 0, 'At least one field is required.'),
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
