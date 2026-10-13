import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';
import { COMPANY_EDITABLE_FIELDS, PROTECTED_COMPANY_FIELDS } from '../utils/profile-permissions.js';
import { getNextCandidateCompanyId, executeWithCompanyIdRetry } from '../utils/company-id.js';
import { toSafeUser, invalidateUserSessions } from './user.service.js';

export async function listCompanies({ page = 1, limit = 20, search }) {
  const query = {};
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [
      { companyId: regex },
      { companyName: regex },
      { industryType: regex },
      { hrRecruiterName: regex },
      { email: regex }
    ];
  }
  const [items, total] = await Promise.all([
    Company.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Company.countDocuments(query)
  ]);
  return { items, page, limit, total };
}

export async function getCompanyById(id) {
  const company = await Company.findById(id).lean();
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');
  return company;
}

export async function findCompanyByUserId(userId) {
  let company = await Company.findOne({ $or: [{ primaryRecruiterId: userId }, { userId }] });
  if (!company) {
    const user = await User.findById(userId);
    if (user && user.companyId) {
      company = await Company.findById(user.companyId);
    }
  }
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found for this account.');
  return company;
}

export async function getCompanyByUserId(userId) {
  const company = await findCompanyByUserId(userId);
  return company.toObject ? company.toObject() : company;
}

export async function updateMyCompanyProfile(userId, input = {}) {
  const prohibitedInPayload = Object.keys(input).filter((key) => PROTECTED_COMPANY_FIELDS.includes(key));
  if (prohibitedInPayload.length > 0) {
    throw new AppError(
      400,
      'PROTECTED_FIELD_READONLY',
      `Field '${prohibitedInPayload[0]}' is a protected account field and cannot be updated.`
    );
  }

  const company = await findCompanyByUserId(userId);

  if (input.companyName !== undefined) company.companyName = input.companyName.trim();
  if (input.industryType !== undefined) company.industryType = input.industryType.trim();
  if (input.hrRecruiterName !== undefined) company.hrRecruiterName = input.hrRecruiterName.trim();
  if (input.description !== undefined) company.description = input.description.trim();
  if (input.website !== undefined) company.website = input.website.trim();
  if (input.yearEstablished !== undefined) company.yearEstablished = Number(input.yearEstablished);
  if (input.designation !== undefined) company.designation = input.designation.trim();
  if (input.mobileNumber !== undefined) company.mobileNumber = input.mobileNumber.trim();
  if (input.officeAddress !== undefined) company.officeAddress = input.officeAddress.trim();
  if (input.email !== undefined) company.email = input.email.toLowerCase().trim();

  await company.save();
  return company.toObject();
}

export async function createCompany(input) {
  const email = input.email.toLowerCase().trim();
  const companyName = input.companyName.trim();

  const emailRegex = new RegExp(`^${email.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
  const nameRegex = new RegExp(`^${companyName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

  const [existingEmailUser, existingEmailCompany, existingName] = await Promise.all([
    User.exists({ email: emailRegex }),
    Company.exists({ email: emailRegex }),
    Company.exists({ companyName: nameRegex })
  ]);

  const hasDuplicateEmail = Boolean(existingEmailUser || existingEmailCompany);
  const hasDuplicateName = Boolean(existingName);

  if (hasDuplicateEmail || hasDuplicateName) {
    const fieldErrors = {};
    if (hasDuplicateEmail) {
      fieldErrors.email = 'A recruiter user or company with this email already exists.';
    }
    if (hasDuplicateName) {
      fieldErrors.companyName = 'A company with this name already exists.';
    }

    if (hasDuplicateEmail && hasDuplicateName) {
      throw new AppError(
        409,
        'DUPLICATE_ENTRY',
        'Both this Email and Company Name are already registered in the system.',
        fieldErrors
      );
    } else if (hasDuplicateEmail) {
      throw new AppError(
        409,
        'EMAIL_EXISTS',
        fieldErrors.email,
        fieldErrors
      );
    } else {
      throw new AppError(
        409,
        'COMPANY_NAME_EXISTS',
        fieldErrors.companyName,
        fieldErrors
      );
    }
  }

  const rawPassword = input.password || process.env.DEFAULT_COMPANY_PASSWORD || 'Company@123456';
  const passwordHash = await hashPassword(rawPassword);

  const executeCreate = async () => {
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
      let createdCompany = null;
      let createdUser = null;

      try {
        const nextCompanyId = await getNextCandidateCompanyId(useSession);
        const companyDocs = await Company.create(
          [
            {
              companyId: nextCompanyId,
              companyName,
              industryType: input.industryType.trim(),
              hrRecruiterName: input.hrRecruiterName.trim(),
              email,
              description: input.description ? input.description.trim() : '',
              website: input.website ? input.website.trim() : '',
              yearEstablished: Number(input.yearEstablished),
              designation: input.designation ? input.designation.trim() : '',
              mobileNumber: input.mobileNumber ? input.mobileNumber.trim() : '',
              officeAddress: input.officeAddress ? input.officeAddress.trim() : ''
            }
          ],
          opts
        );
        createdCompany = companyDocs[0];

        const userDocs = await User.create(
          [
            {
              email,
              passwordHash,
              userType: 'COMPANY',
              roleId: ROLE_IDS.COMPANY,
              companyId: createdCompany._id,
              accountStatus: 'ACTIVE'
            }
          ],
          opts
        );
        createdUser = userDocs[0];

        createdCompany.userId = createdUser._id;
        createdCompany.primaryRecruiterId = createdUser._id;
        await createdCompany.save(opts);
        return createdCompany;
      } catch (createErr) {
        if (!useSession) {
          if (createdUser?._id) {
            try { await User.findByIdAndDelete(createdUser._id); } catch (_) {}
          }
          if (createdCompany?._id) {
            try { await Company.findByIdAndDelete(createdCompany._id); } catch (_) {}
          }
        }
        throw createErr;
      }
    };

    try {
      let company;
      if (session) {
        try {
          company = await createDocs(session);
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
            company = await createDocs(null);
          } else {
            throw txErr;
          }
        }
      } else {
        company = await createDocs(null);
      }

      const result = company.toObject();
      if (!input.password) {
        result.temporaryPassword = rawPassword;
      }
      return result;
    } catch (error) {
      if (error.code === 11000) {
        if (error.keyPattern?.companyId || (typeof error.message === 'string' && error.message.includes('companyId'))) {
          throw error;
        }
        throw new AppError(409, 'DUPLICATE_ENTRY', 'A company or user profile with this Email or Company Name already exists.');
      }
      throw error;
    }
  };

  return executeWithCompanyIdRetry(executeCreate);
}

export async function updateCompany(id, input) {
  const company = await Company.findById(id);
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');

  if (input.email && input.email.toLowerCase().trim() !== company.email) {
    const newEmail = input.email.toLowerCase().trim();
    const existing = (await User.exists({ email: newEmail, companyId: { $ne: company._id } })) ||
                     (await Company.exists({ email: newEmail, _id: { $ne: company._id } }));
    if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'A company with this email already exists.');
    company.email = newEmail;
    if (company.userId) {
      await User.findByIdAndUpdate(company.userId, { email: newEmail });
    }
  }

  if (input.companyName && input.companyName.trim() !== company.companyName) {
    const newName = input.companyName.trim();
    const existing = await Company.exists({
      companyName: new RegExp(`^${newName}$`, 'i'),
      _id: { $ne: company._id }
    });
    if (existing) throw new AppError(409, 'COMPANY_NAME_EXISTS', 'A company with this name already exists.');
    company.companyName = newName;
  }

  if (input.industryType !== undefined) company.industryType = input.industryType.trim();
  if (input.hrRecruiterName !== undefined) company.hrRecruiterName = input.hrRecruiterName.trim();
  if (input.description !== undefined) company.description = input.description.trim();
  if (input.website !== undefined) company.website = input.website.trim();
  if (input.yearEstablished !== undefined) company.yearEstablished = Number(input.yearEstablished);
  if (input.designation !== undefined) company.designation = input.designation.trim();
  if (input.mobileNumber !== undefined) company.mobileNumber = input.mobileNumber.trim();
  if (input.officeAddress !== undefined) company.officeAddress = input.officeAddress.trim();

  await company.save();
  return company.toObject();
}

export async function deleteCompany(id) {
  const company = await Company.findById(id);
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');

  const userOr = [];
  if (company.primaryRecruiterId) userOr.push({ _id: company.primaryRecruiterId });
  if (company.userId) userOr.push({ _id: company.userId });
  if (company._id) userOr.push({ companyId: company._id });
  if (company.email) userOr.push({ email: company.email.toLowerCase().trim() });

  if (userOr.length > 0) {
    await User.deleteMany({ $or: userOr });
  }
  await Company.findByIdAndDelete(id);
  return { message: 'Company and linked recruiter user account deleted successfully.' };
}

export async function listCompanyRecruiters(companyId) {
  const company = await Company.findById(companyId).lean();
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');

  const effectivePrimaryId = company.primaryRecruiterId || company.userId;

  const orConditions = [{ companyId: company._id }];
  if (effectivePrimaryId) {
    orConditions.push({ _id: effectivePrimaryId });
  }

  const recruiters = await User.find({ $or: orConditions })
    .sort({ createdAt: 1 })
    .lean();

  const items = recruiters.map((u) => {
    const isPrimary = effectivePrimaryId ? String(u._id) === String(effectivePrimaryId) : false;
    const recruiterName = isPrimary ? company.hrRecruiterName : (u.name || u.email.split('@')[0].replace(/[._-]/g, ' '));
    return {
      ...toSafeUser(u),
      name: recruiterName,
      hrRecruiterName: recruiterName,
      designation: isPrimary ? company.designation : (u.designation || ''),
      mobileNumber: isPrimary ? company.mobileNumber : (u.mobileNumber || ''),
      isPrimary
    };
  });

  return {
    companyId: String(company._id),
    businessCompanyId: company.companyId || null,
    companyName: company.companyName,
    primaryRecruiterId: effectivePrimaryId ? String(effectivePrimaryId) : null,
    total: items.length,
    items
  };
}

export async function createCompanyRecruiter(companyId, input) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');

  if (input.roleId && input.roleId !== ROLE_IDS.COMPANY) {
    throw new AppError(400, 'INVALID_ROLE', 'Recruiter account must have ROLE_COMPANY role.');
  }

  const email = input.email.toLowerCase().trim();
  const emailRegex = new RegExp(`^${email.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

  const existingEmail = (await User.exists({ email: emailRegex })) || (await Company.exists({ email: emailRegex }));
  if (existingEmail) {
    throw new AppError(409, 'EMAIL_EXISTS', 'A user or recruiter with this email already exists.');
  }

  const defaultPass = process.env.DEFAULT_COMPANY_PASSWORD || 'Company@123456';
  const rawPassword = (input.password && input.password.trim()) || defaultPass;
  const passwordHash = await hashPassword(rawPassword);

  const recruiterName = (input.hrRecruiterName || input.name || '').trim();
  const designation = (input.designation || '').trim();
  const mobileNumber = (input.mobileNumber || '').trim();

  const newUser = await User.create({
    email,
    passwordHash,
    userType: 'COMPANY',
    roleId: ROLE_IDS.COMPANY,
    companyId: company._id,
    accountStatus: input.accountStatus || 'ACTIVE'
  });

  let isPrimary = false;
  if (!company.primaryRecruiterId && !company.userId) {
    company.primaryRecruiterId = newUser._id;
    company.userId = newUser._id;
    if (recruiterName) company.hrRecruiterName = recruiterName;
    if (designation) company.designation = designation;
    if (mobileNumber) company.mobileNumber = mobileNumber;
    company.email = email;
    await company.save();
    isPrimary = true;
  }

  const safe = toSafeUser(newUser);
  safe.name = recruiterName || (isPrimary ? company.hrRecruiterName : email.split('@')[0].replace(/[._-]/g, ' '));
  safe.hrRecruiterName = safe.name;
  safe.designation = designation || company.designation;
  safe.mobileNumber = mobileNumber || company.mobileNumber;
  safe.isPrimary = isPrimary;
  if (!input.password) {
    safe.temporaryPassword = rawPassword;
  }
  return safe;
}

export async function updateCompanyRecruiter(companyId, recruiterId, input) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');

  const user = await User.findById(recruiterId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Recruiter user account not found.');

  if (user.userType !== 'COMPANY' || (user.roleId && user.roleId !== ROLE_IDS.COMPANY)) {
    throw new AppError(400, 'INVALID_RECRUITER_ROLE', 'The specified account is not a company recruiter.');
  }

  if (input.roleId && input.roleId !== ROLE_IDS.COMPANY) {
    throw new AppError(400, 'INVALID_ROLE', 'Recruiter account must have ROLE_COMPANY role.');
  }

  const effectivePrimaryId = company.primaryRecruiterId || company.userId;
  const belongsToCompany =
    (user.companyId && String(user.companyId) === String(company._id)) ||
    (effectivePrimaryId && String(effectivePrimaryId) === String(user._id));

  if (!belongsToCompany) {
    throw new AppError(403, 'RECRUITER_MISMATCH', 'Recruiter account does not belong to the specified company.');
  }

  const isPrimary = Boolean(effectivePrimaryId && String(effectivePrimaryId) === String(user._id));

  // If designating as primary, recruiter must be active
  const targetStatus = input.accountStatus || user.accountStatus;
  if (input.isPrimary === true && targetStatus !== 'ACTIVE') {
    throw new AppError(
      400,
      'INELIGIBLE_PRIMARY_RECRUITER',
      'Cannot designate an inactive recruiter as primary. Activate the recruiter first.'
    );
  }

  if (input.email) {
    const newEmail = input.email.toLowerCase().trim();
    if (newEmail !== user.email) {
      const emailRegex = new RegExp(`^${newEmail.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
      const existingEmail =
        (await User.exists({ email: emailRegex, _id: { $ne: user._id } })) ||
        (await Company.exists({ email: emailRegex, _id: { $ne: company._id } }));
      if (existingEmail) {
        throw new AppError(409, 'EMAIL_EXISTS', 'A user or company with this email already exists.');
      }
      user.email = newEmail;
      if (isPrimary && company.email !== newEmail) {
        company.email = newEmail;
        await company.save();
      }
    }
  }

  const willBePrimary = input.isPrimary === true || (isPrimary && input.isPrimary !== false);
  if (willBePrimary) {
    let companyChanged = false;
    if (input.isPrimary === true && !isPrimary) {
      company.primaryRecruiterId = user._id;
      company.userId = user._id;
      companyChanged = true;
    }
    if (input.hrRecruiterName !== undefined || input.name !== undefined) {
      const val = (input.hrRecruiterName || input.name || '').trim();
      if (val) {
        company.hrRecruiterName = val;
        companyChanged = true;
      }
    }
    if (input.designation !== undefined) {
      company.designation = input.designation.trim();
      companyChanged = true;
    }
    if (input.mobileNumber !== undefined) {
      company.mobileNumber = input.mobileNumber.trim();
      companyChanged = true;
    }
    if (companyChanged) {
      await company.save();
    }
  }

  // Deactivation safety: when deactivating primary recruiter, reassign to another active recruiter or block
  if (input.accountStatus) {
    if (isPrimary && input.accountStatus !== 'ACTIVE' && user.accountStatus === 'ACTIVE') {
      const eligibleActive = await User.findOne({
        _id: { $ne: user._id },
        companyId: company._id,
        userType: 'COMPANY',
        accountStatus: 'ACTIVE'
      });

      if (!eligibleActive) {
        throw new AppError(
          400,
          'CANNOT_DEACTIVATE_PRIMARY_RECRUITER',
          'Cannot deactivate the primary recruiter because no other active recruiter is available. Please activate another recruiter or add a new active recruiter and designate them as primary first.'
        );
      }

      company.primaryRecruiterId = eligibleActive._id;
      company.userId = eligibleActive._id;
      if (company.email === user.email && eligibleActive.email) {
        company.email = eligibleActive.email;
      }
      await company.save();
    }

    user.accountStatus = input.accountStatus;
    if (input.accountStatus !== 'ACTIVE') {
      await invalidateUserSessions(user._id);
    }
  }

  if (input.password && input.password.trim()) {
    user.passwordHash = await hashPassword(input.password.trim());
    await invalidateUserSessions(user._id);
  }

  await user.save();
  const safe = toSafeUser(user);
  const updatedPrimaryId = company.primaryRecruiterId || company.userId;
  const updatedIsPrimary = updatedPrimaryId ? String(updatedPrimaryId) === String(user._id) : false;
  const safeName = updatedIsPrimary
    ? company.hrRecruiterName
    : (input.hrRecruiterName || input.name || user.name || user.email.split('@')[0].replace(/[._-]/g, ' '));
  safe.name = safeName;
  safe.hrRecruiterName = safeName;
  safe.designation = updatedIsPrimary
    ? company.designation
    : (input.designation !== undefined ? input.designation.trim() : (user.designation || ''));
  safe.mobileNumber = updatedIsPrimary
    ? company.mobileNumber
    : (input.mobileNumber !== undefined ? input.mobileNumber.trim() : (user.mobileNumber || ''));
  safe.isPrimary = updatedIsPrimary;
  return safe;
}

export async function deleteCompanyRecruiter(companyId, recruiterId, actorId) {
  if (actorId && String(recruiterId) === String(actorId)) {
    throw new AppError(400, 'CANNOT_DELETE_SELF', 'You cannot delete your own currently logged-in account.');
  }

  const company = await Company.findById(companyId);
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company profile not found.');

  const user = await User.findById(recruiterId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Recruiter user account not found.');

  if (user.userType !== 'COMPANY' || (user.roleId && user.roleId !== ROLE_IDS.COMPANY)) {
    throw new AppError(400, 'INVALID_RECRUITER_ROLE', 'The specified account is not a company recruiter.');
  }

  const effectivePrimaryId = company.primaryRecruiterId || company.userId;
  const belongsToCompany =
    (user.companyId && String(user.companyId) === String(company._id)) ||
    (effectivePrimaryId && String(effectivePrimaryId) === String(user._id));

  if (!belongsToCompany) {
    throw new AppError(403, 'RECRUITER_MISMATCH', 'Recruiter account does not belong to the specified company.');
  }

  const otherRecruiters = await User.find({
    _id: { $ne: user._id },
    $or: [{ companyId: company._id }, { _id: effectivePrimaryId }]
  }).select('_id email accountStatus');

  if (otherRecruiters.length === 0) {
    throw new AppError(
      400,
      'CANNOT_DELETE_LAST_RECRUITER',
      'Cannot delete the only recruiter for this company. A company profile must retain at least one recruiter account.'
    );
  }

  if (effectivePrimaryId && String(effectivePrimaryId) === String(user._id)) {
    const eligibleActive = otherRecruiters.find((r) => r.accountStatus === 'ACTIVE') || otherRecruiters[0];
    company.primaryRecruiterId = eligibleActive._id;
    company.userId = eligibleActive._id;
    if (company.email === user.email && eligibleActive.email) {
      company.email = eligibleActive.email;
    }
    await company.save();
  }

  await invalidateUserSessions(user._id);
  await User.findByIdAndDelete(user._id);

  const updatedPrimaryId = company.primaryRecruiterId || company.userId;
  return {
    message: 'Recruiter account deleted successfully.',
    reassignedPrimaryId: updatedPrimaryId ? String(updatedPrimaryId) : null
  };
}
