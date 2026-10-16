import mongoose from 'mongoose';
import { Workshop } from '../models/workshop.model.js';
import { WorkshopRegistration } from '../models/workshop_registration.model.js';
import { Student } from '../models/student.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';
import { generateRegistrationId } from '../utils/sequence-generator.js';
import { executeWorkshopTransaction, logWorkshopAudit } from './workshop-audit.service.js';

/**
 * Validates whether a student meets the workshop cohort targeting criteria.
 *
 * @param {object} targetAudience
 * @param {object} student
 * @returns {boolean}
 */
export function isStudentEligibleForCohort(targetAudience, student) {
  if (!targetAudience || targetAudience.isAllDepartments) {
    return true;
  }

  const { departmentRules = [] } = targetAudience;
  const studentDeptId = student.departmentId ? String(student.departmentId) : '';
  const studentCourseId = student.courseId ? String(student.courseId) : '';
  const studentSemester = student.semester;

  const matchingRule = departmentRules.find(
    (rule) => String(rule.departmentId) === studentDeptId
  );

  if (!matchingRule) {
    return false;
  }

  const mode = matchingRule.targetingMode;

  if (mode === 'ALL_COURSES_ALL_SEMESTERS') {
    return true;
  }

  if (mode === 'ALL_COURSES_SELECTED_SEMESTERS') {
    return Array.isArray(matchingRule.semesters) && matchingRule.semesters.includes(studentSemester);
  }

  if (mode === 'SELECTED_COURSES_ALL_SEMESTERS') {
    return (
      Array.isArray(matchingRule.courseIds) &&
      matchingRule.courseIds.map((c) => String(c)).includes(studentCourseId)
    );
  }

  if (mode === 'CUSTOM_COURSE_SEMESTER_RULES') {
    if (!Array.isArray(matchingRule.courseSemesterRules)) return false;
    const courseRule = matchingRule.courseSemesterRules.find(
      (r) => String(r.courseId) === studentCourseId
    );
    return !!courseRule && Array.isArray(courseRule.semesters) && courseRule.semesters.includes(studentSemester);
  }

  return false;
}

/**
 * Registers an authenticated student for an approved, published workshop.
 *
 * Capacity Serialization (Decision A):
 * Serializes competing registrations by performing a genuine write to the Workshop document
 * inside the transaction before counting active registrations. Bounded retry handles transient
 * write conflicts, ensuring zero overbooking and atomic transaction audit logs.
 *
 * @param {string} workshopId
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function registerStudent(workshopId, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  // Strict student identity guard: Super Admin or staff cannot register as students
  if (auth.userType !== 'STUDENT' || auth.roleId !== ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Only authenticated students can register for workshops.');
  }

  // Resolve linked Student domain record
  const student = await Student.findOne({ userId: auth.userId }).lean();
  if (!student) {
    throw new AppError(404, 'STUDENT_PROFILE_NOT_FOUND', 'No student profile linked to this user account.');
  }

  return executeWorkshopTransaction(async (session) => {
    // 1. Load and validate target Workshop
    const workshop = await Workshop.findById(workshopId).session(session);
    if (!workshop) {
      throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
    }

    if (!workshop.isPublished || workshop.approvalStatus !== 'APPROVED') {
      throw new AppError(400, 'WORKSHOP_NOT_OPEN', 'Workshop is not published or approved for registration.');
    }

    if (workshop.lifecycleStatus === 'CANCELLED' || workshop.lifecycleStatus === 'COMPLETED') {
      throw new AppError(400, 'WORKSHOP_NOT_OPEN', `Workshop is in ${workshop.lifecycleStatus} status and cannot accept registrations.`);
    }

    // 2. Validate registration window
    const now = new Date();
    if (workshop.registrationOpensAt && now < workshop.registrationOpensAt) {
      throw new AppError(400, 'REGISTRATION_NOT_STARTED', 'Registration for this workshop has not opened yet.');
    }

    if (workshop.registrationDeadline && now > workshop.registrationDeadline) {
      throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration deadline for this workshop has passed.');
    }

    if (workshop.startAt && now >= workshop.startAt) {
      throw new AppError(400, 'REGISTRATION_CLOSED', 'Registration is closed because the workshop has already started.');
    }

    // 3. Validate student cohort targeting
    if (!isStudentEligibleForCohort(workshop.targetAudience, student)) {
      throw new AppError(403, 'INELIGIBLE_COHORT', 'You are not eligible to register for this workshop based on your department, course, or semester.');
    }

    // 4. Duplicate active registration check
    const existingRegistration = await WorkshopRegistration.findOne({
      workshopId: workshop._id,
      studentId: student._id,
      activeRegistrationKey: 'ACTIVE'
    }).session(session);

    if (existingRegistration) {
      throw new AppError(409, 'ALREADY_REGISTERED', 'You are already registered for this workshop.');
    }

    // 5. CAPACITY SERIALIZATION (Decision A):
    // Perform a genuine, safe write to the Workshop document to acquire document write lock
    // and serialize concurrent registration transactions.
    await Workshop.updateOne(
      { _id: workshop._id },
      { $set: { updatedAt: new Date() } },
      { session }
    );

    // Count active registrations within the serialized snapshot
    const activeCount = await WorkshopRegistration.countDocuments({
      workshopId: workshop._id,
      activeRegistrationKey: 'ACTIVE'
    }).session(session);

    if (activeCount >= workshop.maxParticipants) {
      throw new AppError(409, 'WORKSHOP_FULL', 'Workshop capacity has been reached. No seats available.');
    }

    // 6. Generate sequential Registration ID: WREG-YYYY-XXXX (derived from registration timestamp in IST)
    const registeredAt = new Date();
    const registrationId = await generateRegistrationId(registeredAt, { session });

    // 7. Insert Registration document
    const [createdRegistration] = await WorkshopRegistration.create(
      [
        {
          registrationId,
          workshopId: workshop._id,
          studentId: student._id,
          status: 'REGISTERED',
          registeredAt,
          registrationSource: 'STUDENT',
          registeredBy: auth.userId,
          attendancePercentage: 0,
          completionStatus: 'PENDING',
          activeRegistrationKey: 'ACTIVE'
        }
      ],
      { session }
    );

    // 8. Transactional Audit Log
    await logWorkshopAudit(
      {
        workshopId: workshop._id,
        registrationId: createdRegistration._id,
        action: 'STUDENT_REGISTERED',
        entityType: 'REGISTRATION',
        entityId: createdRegistration.registrationId,
        changedBy: auth.userId,
        newValue: {
          registrationId: createdRegistration.registrationId,
          studentId: student._id,
          workshopId: workshop.workshopId,
          status: 'REGISTERED',
          registeredAt
        }
      },
      session
    );

    return createdRegistration.toObject();
  }, { maxRetries: 20 });
}

/**
 * Cancels a student's active registration.
 * Permitted only strictly BEFORE workshop.startAt.
 *
 * @param {string} workshopId
 * @param {object} [options={}]
 * @param {string} [options.reason]
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function cancelStudentRegistration(workshopId, { reason } = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  if (auth.userType !== 'STUDENT' || auth.roleId !== ROLE_IDS.STUDENT) {
    throw new AppError(403, 'FORBIDDEN', 'Only students can cancel their workshop registrations.');
  }

  const student = await Student.findOne({ userId: auth.userId }).lean();
  if (!student) {
    throw new AppError(404, 'STUDENT_PROFILE_NOT_FOUND', 'No student profile linked to this user account.');
  }

  return executeWorkshopTransaction(async (session) => {
    const workshop = await Workshop.findById(workshopId).session(session);
    if (!workshop) {
      throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
    }

    const now = new Date();
    if (workshop.startAt && now >= workshop.startAt) {
      throw new AppError(400, 'CANCELLATION_DEADLINE_PASSED', 'Registrations cannot be cancelled after the workshop has started.');
    }

    const registration = await WorkshopRegistration.findOne({
      workshopId: workshop._id,
      studentId: student._id,
      activeRegistrationKey: 'ACTIVE'
    }).session(session);

    if (!registration) {
      throw new AppError(404, 'REGISTRATION_NOT_FOUND', 'Active registration not found.');
    }

    const cancellationReason = reason ? reason.trim() : 'Cancelled by student';

    await WorkshopRegistration.updateOne(
      { _id: registration._id },
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: auth.userId,
          cancellationReason
        },
        $unset: { activeRegistrationKey: 1 }
      },
      { session }
    );

    await logWorkshopAudit(
      {
        workshopId: workshop._id,
        registrationId: registration._id,
        action: 'REGISTRATION_CANCELLED',
        entityType: 'REGISTRATION',
        entityId: registration.registrationId,
        changedBy: auth.userId,
        reason: cancellationReason,
        oldValue: { status: registration.status, activeRegistrationKey: 'ACTIVE' },
        newValue: { status: 'CANCELLED', activeRegistrationKey: null }
      },
      session
    );

    return {
      registrationId: registration.registrationId,
      status: 'CANCELLED',
      cancelledAt: now,
      cancellationReason
    };
  });
}

/**
 * Retrieves the roster of registrations for a workshop.
 * Requires WORKSHOP_ROSTER_READ permission and departmental scope verification.
 *
 * @param {string} workshopId
 * @param {object} queryParams
 * @param {object} auth
 * @returns {Promise<{ roster: Array, total: number, page: number, totalPages: number }>}
 */
export async function getWorkshopRoster(workshopId, queryParams = {}, auth) {
  if (!auth || !auth.userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  const workshop = await Workshop.findById(workshopId).lean();
  if (!workshop) {
    throw new AppError(404, 'WORKSHOP_NOT_FOUND', 'Workshop not found.');
  }

  // Coordinator department scope check
  if (auth.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    const coordDept = await getCoordinatorDepartment(auth);
    if (!coordDept) {
      throw new AppError(403, 'FORBIDDEN', 'No valid department assigned.');
    }
    if (workshop.ownershipType === 'DEPARTMENT') {
      if (String(workshop.departmentId) !== String(coordDept.departmentId)) {
        throw new AppError(403, 'FORBIDDEN', 'You can only view rosters for workshops in your department.');
      }
    } else {
      throw new AppError(403, 'FORBIDDEN', 'Coordinators cannot view Central Placement Cell workshop rosters.');
    }
  }

  const { page = 1, limit = 20, status, search } = queryParams;

  const mongoQuery = { workshopId: workshop._id };
  if (status) {
    mongoQuery.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  let studentFilterIds = null;
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    const matchedStudents = await Student.find({
      $or: [{ firstName: regex }, { lastName: regex }, { universityId: regex }, { email: regex }]
    }).select('_id').lean();
    studentFilterIds = matchedStudents.map((s) => s._id);
    mongoQuery.studentId = { $in: studentFilterIds };
  }

  const [roster, total] = await Promise.all([
    WorkshopRegistration.find(mongoQuery)
      .sort({ registeredAt: -1, _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('studentId', 'firstName lastName universityId email branch department semester')
      .lean(),
    WorkshopRegistration.countDocuments(mongoQuery)
  ]);

  return {
    roster,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}
