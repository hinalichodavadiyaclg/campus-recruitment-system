import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from './access-constants.js';

/**
 * Checks if the authenticated user has a Company role or userType.
 *
 * @param {object} auth - Authenticated request context
 * @returns {boolean}
 */
export function isCompanyUser(auth) {
  if (!auth) return false;
  return auth.roleId === ROLE_IDS.COMPANY || auth.userType === 'COMPANY';
}

/**
 * Resolves the companyId for an authenticated user context.
 *
 * @param {object} auth - Authenticated request context
 * @returns {Promise<string|null>}
 */
export async function getCompanyIdForAuth(auth) {
  if (!auth) return null;
  if (auth.companyId) return String(auth.companyId);
  if (!auth.userId) return null;

  const user = await User.findById(auth.userId).select('companyId').lean();
  return user?.companyId ? String(user.companyId) : null;
}

/**
 * Checks whether a workshop belongs to the authenticated company user.
 * A workshop belongs to a company if:
 * 1. The workshop was created by this user (workshop.createdBy === auth.userId)
 * 2. The workshop root companyId matches the user's companyId
 * 3. Any trainer in workshop.trainers has trainerType === 'COMPANY' and matching companyId
 *
 * @param {object} workshop - Workshop Mongoose document or lean object
 * @param {object} auth - Authenticated request context
 * @returns {Promise<boolean>}
 */
export async function isCompanyOwnWorkshop(workshop, auth) {
  if (!auth || !auth.userId) return false;
  if (!isCompanyUser(auth)) return true; // Non-company roles handled by their own scoping

  // 1. Created by this company user
  if (workshop.createdBy && String(workshop.createdBy) === String(auth.userId)) {
    return true;
  }

  // 2. Resolve companyId for this user
  const companyId = await getCompanyIdForAuth(auth);
  if (!companyId) return false;

  // 3. Workshop root companyId match
  if (workshop.companyId && String(workshop.companyId) === String(companyId)) {
    return true;
  }

  // 4. Workshop trainers matching companyId
  if (Array.isArray(workshop.trainers)) {
    const hasCompanyTrainer = workshop.trainers.some(
      (t) => t.trainerType === 'COMPANY' && t.companyId && String(t.companyId) === String(companyId)
    );
    if (hasCompanyTrainer) return true;
  }

  return false;
}

/**
 * Builds the MongoDB query condition for company scoping in list queries.
 * Ensures Company users can only see their own company's workshops.
 *
 * @param {object} auth - Authenticated request context
 * @returns {Promise<{ $or: Array<object> }>}
 */
export async function getCompanyWorkshopQueryCondition(auth) {
  const conditions = [{ createdBy: auth.userId }];
  const companyId = await getCompanyIdForAuth(auth);

  if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
    const cObjectId = new mongoose.Types.ObjectId(companyId);
    conditions.push({ companyId: cObjectId });
    conditions.push({ 'trainers.companyId': cObjectId });
  }

  return { $or: conditions };
}
