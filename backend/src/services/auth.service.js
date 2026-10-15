import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Permission } from '../models/permission.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { Department } from '../models/department.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { logActivity } from '../utils/logger.js';
import { assertStrongPassword, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../utils/password.js';
import { createRawSessionToken, hashSessionToken, passwordHashVersion } from '../utils/session-token.js';
import { toSafeUser } from './user.service.js';

async function enrichSafeUser(safeUser, user) {
  if (user.roleId === ROLE_IDS.PLACEMENT_COORDINATOR || user.userType === 'PLACEMENT') {
    const officer = await PlacementOfficer.findOne({ userId: user._id || safeUser._id }).lean();
    if (officer) {
      if (!safeUser.employeeId) safeUser.employeeId = officer.employeeId;
      safeUser.department = officer.department;
      safeUser.departmentId = officer.departmentId ? String(officer.departmentId) : undefined;
      if (officer.departmentId) {
        const dept = await Department.findById(officer.departmentId).lean();
        if (dept) {
          safeUser.departmentName = dept.name;
          safeUser.departmentCode = dept.code;
        }
      } else if (officer.department) {
        const dept = await Department.findOne({
          $or: [
            { name: new RegExp(`^${officer.department.trim()}$`, 'i') },
            { code: new RegExp(`^${officer.department.trim()}$`, 'i') }
          ]
        }).lean();
        if (dept) {
          safeUser.departmentId = String(dept._id);
          safeUser.departmentName = dept.name;
          safeUser.departmentCode = dept.code;
        }
      }
    }
  }
  return safeUser;
}

async function ensureRoleIsActive(roleId) {
  const role = await Role.exists({ _id: roleId, isActive: true });
  if (!role) throw new AppError(403, 'ROLE_INACTIVE', 'Account is not currently authorized.');
}

async function unlockIfLockHasExpired(user) {
  if (user.accountStatus === 'LOCKED' && user.lockedUntil && user.lockedUntil <= new Date()) {
    user.accountStatus = 'ACTIVE';
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
  }
}

async function assertAccountCanAuthenticate(user) {
  await unlockIfLockHasExpired(user);
  if (user.accountStatus === 'LOCKED') {
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Account is temporarily locked.');
  }
  if (user.accountStatus !== 'ACTIVE') {
    throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'Account is not currently available.');
  }
  await ensureRoleIsActive(user.roleId);
}

async function recordFailedLogin(user) {
  user.failedLoginAttempts += 1;
  if (user.failedLoginAttempts >= env.maxFailedLoginAttempts) {
    user.accountStatus = 'LOCKED';
    user.lockedUntil = new Date(Date.now() + env.accountLockMinutes * 60_000);
  }
  await user.save();
}

export async function login({ email: loginId, password, ipAddress, userAgent }) {
  const queryVal = (loginId || '').trim();
  const escapedQuery = queryVal.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const identifierRegex = new RegExp(`^${escapedQuery}$`, 'i');

  const user = await User.findOne({
    $or: [
      { email: identifierRegex },
      { universityId: identifierRegex },
      { employeeId: identifierRegex }
    ]
  }).select('+passwordHash');
  const passwordMatches = await verifyPassword(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    if (user) await recordFailedLogin(user);
    logActivity('auth.login.failed', { reason: 'invalid_credentials' });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email, user ID, or password.');
  }
  await assertAccountCanAuthenticate(user);
  user.failedLoginAttempts = 0;
  user.lastLoginAt = new Date();
  await user.save();

  const sessionToken = createRawSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.sessionTtlHours * 60 * 60 * 1000);
  await UserSession.create({
    userId: user._id,
    sessionTokenHash: hashSessionToken(sessionToken),
    loginAt: now,
    lastActivityAt: now,
    expiresAt,
    ipAddress: ipAddress?.slice(0, 128),
    userAgent: userAgent?.slice(0, 512),
    isActive: true
  });
  logActivity('auth.login.succeeded', { userId: String(user._id) });
  const safeUser = await enrichSafeUser(toSafeUser(user), user);
  return { user: safeUser, sessionToken, expiresAt };
}

export async function authenticateSession(rawToken) {
  if (!rawToken || rawToken.length > 512) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }
  const now = new Date();
  const session = await UserSession.findOne({
    sessionTokenHash: hashSessionToken(rawToken),
    isActive: true,
    expiresAt: { $gt: now }
  });
  if (!session) throw new AppError(401, 'SESSION_INVALID', 'Session is invalid or expired.');

  const user = await User.findById(session.userId).select('+passwordHash');
  if (!user) {
    await UserSession.updateOne({ _id: session._id }, { isActive: false, logoutAt: now });
    throw new AppError(401, 'SESSION_INVALID', 'Session is invalid or expired.');
  }
  await assertAccountCanAuthenticate(user);
  await UserSession.updateOne({ _id: session._id, isActive: true }, { lastActivityAt: now });
  return { userId: user._id, sessionId: session._id, roleId: user.roleId, userType: user.userType };
}

export async function logout(sessionId) {
  await UserSession.updateOne({ _id: sessionId, isActive: true }, { isActive: false, logoutAt: new Date() });
  logActivity('auth.logout');
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  const role = await Role.findById(user.roleId).lean();
  if (!role || !role.isActive) throw new AppError(403, 'ROLE_INACTIVE', 'Account is not currently authorized.');

  const activePermissions = await Permission.find({
    _id: { $in: role.permissionIds },
    isActive: true
  }).lean();
  const activePermissionIds = activePermissions.map((p) => p._id);

  const safeUser = await enrichSafeUser(toSafeUser(user), user);

  return {
    user: safeUser,
    role: { id: role._id, name: role.name, description: role.description },
    permissions: activePermissions,
    permissionIds: activePermissionIds
  };
}

export async function changePassword({ userId, currentSessionId, currentPassword, newPassword }) {
  assertStrongPassword(newPassword);
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }
  user.passwordHash = await hashPassword(newPassword);
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();
  const now = new Date();
  await UserSession.updateMany(
    { userId: user._id, _id: { $ne: currentSessionId }, isActive: true },
    { isActive: false, logoutAt: now }
  );
  logActivity('auth.password.changed', { userId: String(user._id) });
}

export async function createPasswordResetToken(email) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.accountStatus !== 'ACTIVE') return undefined;
  const token = jwt.sign(
    { purpose: 'password-reset', passwordVersion: passwordHashVersion(user.passwordHash) },
    env.passwordResetSecret,
    { subject: String(user._id), expiresIn: '15m', algorithm: 'HS256' }
  );
  logActivity('auth.password_reset.requested', { userId: String(user._id) });
  return token;
}

export async function resetPassword(token, newPassword) {
  assertStrongPassword(newPassword);
  let payload;
  try {
    payload = jwt.verify(token, env.passwordResetSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Password reset token is invalid or expired.');
  }
  if (typeof payload === 'string' || payload.purpose !== 'password-reset' || !payload.sub || typeof payload.passwordVersion !== 'string') {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Password reset token is invalid or expired.');
  }
  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user || user.accountStatus !== 'ACTIVE' || passwordHashVersion(user.passwordHash) !== payload.passwordVersion) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'Password reset token is invalid or expired.');
  }
  user.passwordHash = await hashPassword(newPassword);
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();
  const now = new Date();
  await UserSession.updateMany({ userId: user._id, isActive: true }, { isActive: false, logoutAt: now });
  logActivity('auth.password.reset', { userId: String(user._id) });
}
