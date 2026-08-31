import crypto from 'node:crypto';
import { ROLE_IDS } from '../utils/access-constants.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';

export function toSafeUser(user) {
  const object = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    _id: String(object._id),
    universityId: object.universityId,
    employeeId: object.employeeId,
    companyId: object.companyId ? String(object.companyId) : undefined,
    email: object.email,
    userType: object.userType,
    roleId: object.roleId,
    accountStatus: object.accountStatus,
    isEmailVerified: object.isEmailVerified,
    lastLoginAt: object.lastLoginAt,
    failedLoginAttempts: object.failedLoginAttempts,
    lockedUntil: object.lockedUntil,
    createdAt: object.createdAt,
    updatedAt: object.updatedAt
  };
}

export async function getUserOrThrow(id) {
  const user = await User.findById(id);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
  return user;
}

export async function listUsers({ page = 1, limit = 20, userType, accountStatus, roleId }) {
  const query = {};
  if (userType) query.userType = userType;
  if (accountStatus) query.accountStatus = accountStatus;
  if (roleId) query.roleId = roleId;
  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(query)
  ]);
  return { items: users.map(toSafeUser), page, limit, total };
}

async function guardFinalActiveSuperAdmin(target) {
  if (target.roleId !== ROLE_IDS.SUPER_ADMIN || target.accountStatus !== 'ACTIVE') return;
  const replacementExists = await User.exists({
    _id: { $ne: target._id },
    roleId: ROLE_IDS.SUPER_ADMIN,
    accountStatus: 'ACTIVE'
  });
  if (!replacementExists) {
    throw new AppError(409, 'LAST_SUPER_ADMIN', 'At least one active Super Admin account must remain.');
  }
}

export async function invalidateUserSessions(userId) {
  const now = new Date();
  await UserSession.updateMany({ userId, isActive: true }, { isActive: false, logoutAt: now });
}

export async function createUser(input) {
  const role = await Role.findOne({ _id: input.roleId, isActive: true }).lean();
  if (!role) throw new AppError(400, 'INVALID_ROLE', 'The assigned role does not exist or is inactive.');

  const existingEmail = await User.exists({ email: input.email.toLowerCase() });
  if (existingEmail) throw new AppError(409, 'EMAIL_EXISTS', 'A user with this email already exists.');

  if (input.universityId) {
    const existingUni = await User.exists({ universityId: input.universityId });
    if (existingUni) throw new AppError(409, 'UNIVERSITY_ID_EXISTS', 'A user with this University ID already exists.');
  }

  if (input.employeeId) {
    const existingEmp = await User.exists({ employeeId: input.employeeId });
    if (existingEmp) throw new AppError(409, 'EMPLOYEE_ID_EXISTS', 'A user with this Employee ID already exists.');
  }

  const rawPassword = input.password || `Campus@${crypto.randomBytes(4).toString('hex')}!`;
  const passwordHash = await hashPassword(rawPassword);

  const created = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    userType: input.userType,
    roleId: input.roleId,
    universityId: input.universityId,
    employeeId: input.employeeId,
    companyId: input.companyId,
    accountStatus: input.accountStatus || 'ACTIVE',
    isEmailVerified: input.isEmailVerified !== undefined ? input.isEmailVerified : true
  });

  const safe = toSafeUser(created);
  if (!input.password) {
    safe.temporaryPassword = rawPassword;
  }
  return safe;
}

export async function updateUser(id, input) {
  const user = await getUserOrThrow(id);

  if (input.roleId && input.roleId !== user.roleId) {
    const role = await Role.findOne({ _id: input.roleId, isActive: true }).lean();
    if (!role) throw new AppError(400, 'INVALID_ROLE', 'The assigned role does not exist or is inactive.');
    if (user.roleId === ROLE_IDS.SUPER_ADMIN) {
      await guardFinalActiveSuperAdmin(user);
    }
    user.roleId = input.roleId;
  }

  if (input.email && input.email.toLowerCase() !== user.email) {
    const existing = await User.exists({ email: input.email.toLowerCase(), _id: { $ne: user._id } });
    if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'A user with this email already exists.');
    user.email = input.email.toLowerCase();
  }

  if (input.universityId !== undefined) user.universityId = input.universityId;
  if (input.employeeId !== undefined) user.employeeId = input.employeeId;
  if (input.companyId !== undefined) user.companyId = input.companyId;
  if (input.userType !== undefined) user.userType = input.userType;
  if (input.isEmailVerified !== undefined) user.isEmailVerified = input.isEmailVerified;

  if (input.accountStatus !== undefined && input.accountStatus !== user.accountStatus) {
    if (input.accountStatus !== 'ACTIVE') {
      await guardFinalActiveSuperAdmin(user);
      await invalidateUserSessions(user._id);
    }
    user.accountStatus = input.accountStatus;
  }

  if (input.password) {
    user.passwordHash = await hashPassword(input.password);
    await invalidateUserSessions(user._id);
  }

  await user.save();
  return toSafeUser(user);
}

export async function deleteUser(id, actorId) {
  if (actorId && String(id) === String(actorId)) {
    throw new AppError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own currently logged-in account.');
  }
  const user = await getUserOrThrow(id);
  await guardFinalActiveSuperAdmin(user);
  await invalidateUserSessions(user._id);
  await User.findByIdAndDelete(id);
  return { message: 'User deleted successfully.' };
}

export async function setUserStatus(id, accountStatus) {
  const user = await getUserOrThrow(id);
  if (accountStatus === 'INACTIVE') await guardFinalActiveSuperAdmin(user);
  user.accountStatus = accountStatus;
  if (accountStatus === 'ACTIVE') {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
  }
  await user.save();
  if (accountStatus === 'INACTIVE') await invalidateUserSessions(user._id);
  return toSafeUser(user);
}

export async function lockUser(id, lockMinutes) {
  const user = await getUserOrThrow(id);
  await guardFinalActiveSuperAdmin(user);
  user.accountStatus = 'LOCKED';
  user.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
  await user.save();
  await invalidateUserSessions(user._id);
  return toSafeUser(user);
}

export async function unlockUser(id) {
  const user = await getUserOrThrow(id);
  user.accountStatus = 'ACTIVE';
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();
  return toSafeUser(user);
}

export async function assignUserRole(id, roleId, _actorRoleId) {
  const role = await Role.findOne({ _id: roleId, isActive: true }).lean();
  if (!role) throw new AppError(400, 'INVALID_ROLE', 'The requested role does not exist or is inactive.');
  const user = await getUserOrThrow(id);
  if (user.roleId === ROLE_IDS.SUPER_ADMIN && roleId !== ROLE_IDS.SUPER_ADMIN) {
    await guardFinalActiveSuperAdmin(user);
  }
  user.roleId = roleId;
  await user.save();
  await invalidateUserSessions(user._id);
  return toSafeUser(user);
}
