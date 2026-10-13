import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';

export async function listPlacementOfficers({ page = 1, limit = 20, search }) {
  const query = {};
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [
      { employeeId: regex },
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { mobileNumber: regex }
    ];
  }
  const [items, total] = await Promise.all([
    PlacementOfficer.find(query).populate('departmentId', 'name code').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PlacementOfficer.countDocuments(query)
  ]);

  return { items, page, limit, total };
}

export async function getPlacementOfficerById(id) {
  const officer = await PlacementOfficer.findById(id).populate('departmentId', 'name code').lean();
  if (!officer) throw new AppError(404, 'PLACEMENT_OFFICER_NOT_FOUND', 'Placement Officer profile not found.');
  return officer;
}

export async function createPlacementOfficer(input) {
  const email = input.email.toLowerCase().trim();
  const employeeId = input.employeeId.trim();
  const designation = (input.designation || '').trim();
  const assignedRole = input.role || ROLE_IDS.PLACEMENT_COORDINATOR;

  const allowedRoles = [ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR];
  if (!allowedRoles.includes(assignedRole)) {
    throw new AppError(400, 'INVALID_ROLE', `Role must be one of: ${allowedRoles.join(', ')}`);
  }

  const emailRegex = new RegExp(`^${email.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
  const empRegex = new RegExp(`^${employeeId.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

  const existingEmail = (await User.exists({ email: emailRegex })) || (await PlacementOfficer.exists({ email: emailRegex }));
  if (existingEmail) throw new AppError(409, 'EMAIL_EXISTS', 'A user or placement officer with this email already exists.');

  const existingEmp = (await User.exists({ employeeId: empRegex })) || (await PlacementOfficer.exists({ employeeId: empRegex }));
  if (existingEmp) throw new AppError(409, 'EMPLOYEE_ID_EXISTS', 'A placement officer with this Employee ID already exists.');

  const rawPassword = input.password || process.env.DEFAULT_PLACEMENT_PASSWORD || 'Placement@123456';
  const passwordHash = await hashPassword(rawPassword);

  let session = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (_err) {
    if (session) {
      try { session.endSession(); } catch (_) {}
    }
    session = null;
  }

  const createDocs = async (useSession) => {
    const opts = useSession ? { session: useSession } : {};
    let createdUser = null;
    let createdOfficer = null;

    try {
      const userDocs = await User.create(
        [
          {
            email,
            passwordHash,
            userType: 'PLACEMENT',
            roleId: assignedRole,
            employeeId,
            accountStatus: 'ACTIVE'
          }
        ],
        opts
      );
      createdUser = userDocs[0];

      const officerDocs = await PlacementOfficer.create(
        [
          {
            employeeId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email,
            mobileNumber: input.mobileNumber ? input.mobileNumber.trim() : undefined,
            designation: designation || (assignedRole === ROLE_IDS.PLACEMENT_HEAD ? 'Placement Head' : 'Placement Officer'),
            role: assignedRole,
            departmentId: assignedRole === ROLE_IDS.PLACEMENT_COORDINATOR && input.departmentId ? input.departmentId : undefined,
            department: assignedRole === ROLE_IDS.PLACEMENT_COORDINATOR && input.department ? input.department.trim() : undefined,
            userId: createdUser._id
          }
        ],
        opts
      );
      createdOfficer = officerDocs[0];

      return { user: createdUser, officer: createdOfficer };
    } catch (createErr) {
      if (!useSession) {
        if (createdOfficer?._id) {
          try { await PlacementOfficer.findByIdAndDelete(createdOfficer._id); } catch (_) {}
        }
        if (createdUser?._id) {
          try { await User.findByIdAndDelete(createdUser._id); } catch (_) {}
        }
      }
      throw createErr;
    }
  };

  try {
    let resultDocs;
    if (session) {
      try {
        resultDocs = await createDocs(session);
        await session.commitTransaction();
        session.endSession();
        session = null;
      } catch (txErr) {
        if (session) {
          try { await session.abortTransaction(); } catch (_) {}
          try { session.endSession(); } catch (_) {}
          session = null;
        }
        if (txErr.message?.includes('Transaction numbers') || txErr.code === 20 || txErr.codeName === 'IllegalOperation') {
          resultDocs = await createDocs(null);
        } else {
          throw txErr;
        }
      }
    } else {
      resultDocs = await createDocs(null);
    }

    const result = resultDocs.officer.toObject();
    if (!input.password) {
      result.temporaryPassword = rawPassword;
    }
    return result;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'DUPLICATE_ENTRY', 'A placement officer with this Email or Employee ID already exists.');
    }
    throw error;
  }
}

export async function updatePlacementOfficer(id, input) {
  const officer = await PlacementOfficer.findById(id);
  if (!officer) throw new AppError(404, 'PLACEMENT_OFFICER_NOT_FOUND', 'Placement Officer profile not found.');

  if (input.email && input.email.toLowerCase().trim() !== officer.email) {
    const newEmail = input.email.toLowerCase().trim();
    const existing = (await User.exists({ email: newEmail, _id: { $ne: officer.userId } })) ||
                     (await PlacementOfficer.exists({ email: newEmail, _id: { $ne: officer._id } }));
    if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'A placement officer with this email already exists.');
    officer.email = newEmail;
    if (officer.userId) {
      await User.findByIdAndUpdate(officer.userId, { email: newEmail });
    }
  }

  if (input.employeeId && input.employeeId.trim() !== officer.employeeId) {
    const newEmpId = input.employeeId.trim();
    const existing = (await User.exists({ employeeId: newEmpId, _id: { $ne: officer.userId } })) ||
                     (await PlacementOfficer.exists({ employeeId: newEmpId, _id: { $ne: officer._id } }));
    if (existing) throw new AppError(409, 'EMPLOYEE_ID_EXISTS', 'A placement officer with this Employee ID already exists.');
    officer.employeeId = newEmpId;
    if (officer.userId) {
      await User.findByIdAndUpdate(officer.userId, { employeeId: newEmpId });
    }
  }

  if (input.firstName !== undefined) officer.firstName = input.firstName.trim();
  if (input.lastName !== undefined) officer.lastName = input.lastName.trim();
  if (input.mobileNumber !== undefined) officer.mobileNumber = input.mobileNumber ? input.mobileNumber.trim() : undefined;
  if (input.designation !== undefined) officer.designation = input.designation.trim();
  if (input.role !== undefined) {
    const allowedRoles = [ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR];
    if (!allowedRoles.includes(input.role)) {
      throw new AppError(400, 'INVALID_ROLE', `Role must be one of: ${allowedRoles.join(', ')}`);
    }
    officer.role = input.role;
    if (officer.userId) {
      await User.findByIdAndUpdate(officer.userId, { roleId: input.role });
    }
  }

  if (input.departmentId !== undefined) {
    officer.departmentId = officer.role === ROLE_IDS.PLACEMENT_COORDINATOR && input.departmentId ? input.departmentId : undefined;
  }
  if (input.department !== undefined) {
    officer.department = officer.role === ROLE_IDS.PLACEMENT_COORDINATOR && input.department ? input.department.trim() : undefined;
  }

  await officer.save();
  return officer.toObject();
}

export async function deletePlacementOfficer(id) {
  const officer = await PlacementOfficer.findById(id);
  if (!officer) throw new AppError(404, 'PLACEMENT_OFFICER_NOT_FOUND', 'Placement Officer profile not found.');

  const userOr = [];
  if (officer.userId) userOr.push({ _id: officer.userId });
  if (officer.employeeId) userOr.push({ employeeId: officer.employeeId.trim() });
  if (officer.email) userOr.push({ email: officer.email.toLowerCase().trim() });

  if (userOr.length > 0) {
    const linkedUsers = await User.find({ $or: userOr }).lean();
    if (linkedUsers.some((u) => u.roleId === ROLE_IDS.SUPER_ADMIN)) {
      throw new AppError(403, 'CANNOT_DELETE_SUPER_ADMIN', 'Cannot delete a Super Admin user account.');
    }
    await User.deleteMany({ $or: userOr });
  }
  await PlacementOfficer.findByIdAndDelete(id);
  return { message: 'Placement Officer and linked user account deleted successfully.' };
}
