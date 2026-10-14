import crypto from 'node:crypto';
import { ROLE_IDS } from '../utils/access-constants.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { UserSession } from '../models/user-session.model.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';

export function toSafeUser(user) {
  const object = typeof user.toObject === 'function' ? user.toObject() : user;
  const companyBusinessId = object.companyBusinessId ||
    (object.companyId && typeof object.companyId === 'object' && object.companyId.companyId
      ? object.companyId.companyId
      : undefined);

  return {
    _id: String(object._id),
    universityId: object.universityId,
    employeeId: object.employeeId,
    companyId: object.companyId ? (object.companyId._id ? String(object.companyId._id) : String(object.companyId)) : undefined,
    companyBusinessId,
    email: object.email,
    userType: object.userType,
    roleId: object.roleId,
    accountStatus: object.accountStatus,
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

import { Company } from '../models/company.model.js';
import { Student } from '../models/student.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';

export async function listUsers({ page = 1, limit = 20, userType, accountStatus, roleId }) {
  const query = {};
  if (userType) query.userType = userType;
  if (accountStatus) query.accountStatus = accountStatus;
  if (roleId) query.roleId = roleId;
  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(query)
  ]);
  const items = users.map(toSafeUser);

  const userIds = items.map((u) => u._id);
  const companyIds = items.map((u) => u.companyId).filter(Boolean);

  const [companies, students, placementOfficers] = await Promise.all([
    Company.find({ $or: [{ primaryRecruiterId: { $in: userIds } }, { userId: { $in: userIds } }, { _id: { $in: companyIds } }] }).lean(),
    Student.find({ userId: { $in: userIds } }).lean(),
    PlacementOfficer.find({ userId: { $in: userIds } }).lean()
  ]);

  const companyMap = new Map();
  companies.forEach((c) => {
    if (c.primaryRecruiterId) companyMap.set(String(c.primaryRecruiterId), c);
    if (c.userId) companyMap.set(String(c.userId), c);
    if (c._id) companyMap.set(String(c._id), c);
  });
  const studentMap = new Map(students.map((s) => [String(s.userId), s]));
  const officerMap = new Map(placementOfficers.map((p) => [String(p.userId), p]));

  for (const u of items) {
    if (u.userType === 'COMPANY') {
      const comp = companyMap.get(u._id) || (u.companyId ? companyMap.get(u.companyId) : null);
      if (comp) {
        u.companyName = comp.companyName;
        u.companyBusinessId = comp.companyId || null;
        u.profileName = comp.companyName;
        u.profile = comp;
      }
    } else if (u.userType === 'STUDENT') {
      const stu = studentMap.get(u._id);
      if (stu) {
        u.profileName = `${stu.firstName} ${stu.lastName}`;
        u.profile = stu;
      }
    } else if (u.userType === 'PLACEMENT') {
      const off = officerMap.get(u._id);
      if (off) {
        u.profileName = `${off.firstName} ${off.lastName}`;
        u.profile = off;
      } else if (u.roleId === ROLE_IDS.SUPER_ADMIN) {
        u.profileName = 'System Administrator';
      }
    }
  }

  return { items, page, limit, total };
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

  let defaultPass = process.env.DEFAULT_STUDENT_PASSWORD || 'Student@123456';
  if (input.userType === 'COMPANY') defaultPass = process.env.DEFAULT_COMPANY_PASSWORD || 'Company@123456';
  if (input.userType === 'PLACEMENT') defaultPass = process.env.DEFAULT_PLACEMENT_PASSWORD || 'Placement@123456';

  const rawPassword = (input.password && input.password.trim()) || defaultPass;
  const passwordHash = await hashPassword(rawPassword);

  const created = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    userType: input.userType,
    roleId: input.roleId,
    universityId: input.universityId,
    employeeId: input.employeeId,
    companyId: input.companyId,
    accountStatus: input.accountStatus || 'ACTIVE'
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

  // Cascade delete associated domain profiles (Student, Company, PlacementOfficer)
  const studentOr = [];
  if (user._id) studentOr.push({ userId: user._id });
  if (user.email) studentOr.push({ email: user.email.toLowerCase().trim() });
  if (user.universityId) studentOr.push({ universityId: user.universityId.trim() });
  if (studentOr.length > 0) {
    await Student.deleteMany({ $or: studentOr });
  }

  // Handle associated company profile if user is linked to a company
  const companyConditions = [];
  if (user.companyId) companyConditions.push({ _id: user.companyId });
  if (user._id) {
    companyConditions.push({ primaryRecruiterId: user._id });
    companyConditions.push({ userId: user._id });
  }
  if (companyConditions.length > 0) {
    const linkedCompanies = await Company.find({ $or: companyConditions });
    for (const company of linkedCompanies) {
      // Check if any other recruiter accounts still reference this company
      const otherRecruiters = await User.find({
        _id: { $ne: user._id },
        $or: [
          { companyId: company._id },
          { _id: company.primaryRecruiterId },
          { _id: company.userId }
        ]
      }).select('_id email');

      if (otherRecruiters.length > 0) {
        // Other recruiters still exist: NEVER delete the shared company profile!
        // If the deleted user was the primary recruiter, reassign company.primaryRecruiterId and userId to an active recruiter
        const effectivePrimaryId = company.primaryRecruiterId || company.userId;
        if (effectivePrimaryId && String(effectivePrimaryId) === String(user._id)) {
          company.primaryRecruiterId = otherRecruiters[0]._id;
          company.userId = otherRecruiters[0]._id;
          await company.save();
        }
      } else {
        // No other recruiter accounts reference this company.
        // Safe to delete the company profile under existing business rules.
        await Company.findByIdAndDelete(company._id);
      }
    }
  }

  const officerOr = [];
  if (user._id) officerOr.push({ userId: user._id });
  if (user.employeeId) officerOr.push({ employeeId: user.employeeId.trim() });
  if (user.email) officerOr.push({ email: user.email.toLowerCase().trim() });
  if (officerOr.length > 0) {
    await PlacementOfficer.deleteMany({ $or: officerOr });
  }

  await User.findByIdAndDelete(id);
  return { message: 'User account and linked domain profile deleted successfully.' };
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
