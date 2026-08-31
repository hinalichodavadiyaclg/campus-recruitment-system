import { ROLE_IDS } from '../utils/access-constants.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';
import { AppError } from '../utils/app-error.js';

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

export async function listUsers({ page, limit, userType, accountStatus, roleId }) {
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

async function invalidateUserSessions(userId) {
  const now = new Date();
  await UserSession.updateMany({ userId, isActive: true }, { isActive: false, logoutAt: now });
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

export async function assignUserRole(id, roleId, actorRoleId) {
  const role = await Role.findOne({ _id: roleId, isActive: true }).lean();
  if (!role) throw new AppError(400, 'INVALID_ROLE', 'The requested role does not exist or is inactive.');
  if (roleId === ROLE_IDS.SUPER_ADMIN && actorRoleId !== ROLE_IDS.SUPER_ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'Only a Super Admin can assign the Super Admin role.');
  }
  const user = await getUserOrThrow(id);
  if (user.roleId === ROLE_IDS.SUPER_ADMIN && roleId !== ROLE_IDS.SUPER_ADMIN) {
    await guardFinalActiveSuperAdmin(user);
  }
  user.roleId = roleId;
  await user.save();
  await invalidateUserSessions(user._id);
  return toSafeUser(user);
}
