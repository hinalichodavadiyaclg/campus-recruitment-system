import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Student } from '../models/student.model.js';
import { User } from '../models/user.model.js';
import { Department } from '../models/department.model.js';
import { Course } from '../models/course.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';
import { PROTECTED_STUDENT_FIELDS, STUDENT_EDITABLE_FIELDS } from '../utils/profile-permissions.js';

export async function listStudents({ page = 1, limit = 20, search }) {
  const query = {};
  if (search) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [
      { universityId: regex },
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { branch: regex },
      { department: regex }
    ];
  }
  const [items, total] = await Promise.all([
    Student.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Student.countDocuments(query)
  ]);
  return { items, page, limit, total };
}

export async function getStudentById(id) {
  const student = await Student.findById(id).lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student profile not found.');
  return student;
}

export async function createStudent(input) {
  const email = input.email.toLowerCase().trim();
  const universityId = input.universityId.trim().toUpperCase();

  const emailRegex = new RegExp(`^${email.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
  const uniIdRegex = new RegExp(`^${universityId.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');

  const existingEmail = (await User.exists({ email: emailRegex })) || (await Student.exists({ email: emailRegex }));
  if (existingEmail) throw new AppError(409, 'EMAIL_EXISTS', 'A user or student profile with this email already exists.');

  const existingId = (await User.exists({ universityId: uniIdRegex })) || (await Student.exists({ universityId: uniIdRegex }));
  if (existingId) throw new AppError(409, 'UNIVERSITY_ID_EXISTS', 'A student with this University ID already exists.');

  let departmentDoc = null;
  let courseDoc = null;

  if (input.departmentId) {
    departmentDoc = await Department.findById(input.departmentId);
    if (!departmentDoc) {
      throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'The referenced department does not exist.');
    }
    if (!departmentDoc.isActive) {
      throw new AppError(400, 'DEPARTMENT_INACTIVE', 'Cannot assign student to an inactive department.');
    }
  }

  if (input.courseId) {
    courseDoc = await Course.findById(input.courseId);
    if (!courseDoc) {
      throw new AppError(404, 'COURSE_NOT_FOUND', 'The referenced course does not exist.');
    }
    if (!courseDoc.isActive) {
      throw new AppError(400, 'COURSE_INACTIVE', 'Cannot assign student to an inactive course.');
    }
    const targetDeptId = departmentDoc ? String(departmentDoc._id) : (input.departmentId ? String(input.departmentId) : null);
    if (targetDeptId && String(courseDoc.departmentId) !== targetDeptId) {
      throw new AppError(400, 'INVALID_COURSE_DEPARTMENT', 'The selected course does not belong to the selected department.');
    }
  }

  const rawPassword = input.password || process.env.DEFAULT_STUDENT_PASSWORD || 'Student@123456';
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
    let createdStudent = null;

    try {
      const userDocs = await User.create(
        [
          {
            email,
            passwordHash,
            userType: 'STUDENT',
            roleId: ROLE_IDS.STUDENT,
            universityId,
            accountStatus: 'ACTIVE',
            isEmailVerified: true
          }
        ],
        opts
      );
      createdUser = userDocs[0];

      const studentDocs = await Student.create(
        [
          {
            universityId,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email,
            mobileNumber: input.mobileNumber.trim(),
            address: input.address ? input.address.trim() : '',
            branch: courseDoc ? courseDoc.name : input.branch.trim(),
            department: departmentDoc ? departmentDoc.name : input.department.trim(),
            departmentId: departmentDoc ? departmentDoc._id : (input.departmentId || undefined),
            courseId: courseDoc ? courseDoc._id : (input.courseId || undefined),
            semester: Number(input.semester),
            cgpa: Number(input.cgpa),
            backlogs: input.backlogs !== undefined ? Number(input.backlogs) : 0,
            passingYear: input.passingYear ? Number(input.passingYear) : undefined,
            userId: createdUser._id
          }
        ],
        opts
      );
      createdStudent = studentDocs[0];

      return { user: createdUser, student: createdStudent };
    } catch (createErr) {
      if (!useSession) {
        if (createdStudent?._id) {
          try { await Student.findByIdAndDelete(createdStudent._id); } catch (_) {}
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

    const result = resultDocs.student.toObject();
    if (!input.password) {
      result.temporaryPassword = rawPassword;
    }
    return result;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'DUPLICATE_ENTRY', 'A student with this Email or University ID already exists.');
    }
    throw error;
  }
}

export async function updateStudent(id, input) {
  const student = await Student.findById(id);
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student profile not found.');

  if (input.email && input.email.toLowerCase().trim() !== student.email) {
    const newEmail = input.email.toLowerCase().trim();
    const existing = (await User.exists({ email: newEmail, _id: { $ne: student.userId } })) ||
                     (await Student.exists({ email: newEmail, _id: { $ne: student._id } }));
    if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'A student with this email already exists.');
    student.email = newEmail;
    if (student.userId) {
      await User.findByIdAndUpdate(student.userId, { email: newEmail });
    }
  }

  if (input.universityId && input.universityId.trim() !== student.universityId) {
    const newUniId = input.universityId.trim();
    const existing = (await User.exists({ universityId: newUniId, _id: { $ne: student.userId } })) ||
                     (await Student.exists({ universityId: newUniId, _id: { $ne: student._id } }));
    if (existing) throw new AppError(409, 'UNIVERSITY_ID_EXISTS', 'A student with this University ID already exists.');
    student.universityId = newUniId;
    if (student.userId) {
      await User.findByIdAndUpdate(student.userId, { universityId: newUniId });
    }
  }

  if (input.firstName !== undefined) student.firstName = input.firstName.trim();
  if (input.lastName !== undefined) student.lastName = input.lastName.trim();
  if (input.mobileNumber !== undefined) student.mobileNumber = input.mobileNumber.trim();
  if (input.address !== undefined) student.address = input.address.trim();
  if (input.branch !== undefined) student.branch = input.branch.trim();
  if (input.departmentId !== undefined) {
    if (input.departmentId) {
      const dDoc = await Department.findById(input.departmentId);
      if (!dDoc) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'The referenced department does not exist.');
      if (!dDoc.isActive) throw new AppError(400, 'DEPARTMENT_INACTIVE', 'Cannot assign student to an inactive department.');
      student.departmentId = dDoc._id;
      student.department = dDoc.name;
    } else {
      student.departmentId = undefined;
    }
  }

  if (input.courseId !== undefined) {
    if (input.courseId) {
      const cDoc = await Course.findById(input.courseId);
      if (!cDoc) throw new AppError(404, 'COURSE_NOT_FOUND', 'The referenced course does not exist.');
      if (!cDoc.isActive) throw new AppError(400, 'COURSE_INACTIVE', 'Cannot assign student to an inactive course.');
      const currentDeptId = student.departmentId ? String(student.departmentId) : (input.departmentId ? String(input.departmentId) : null);
      if (currentDeptId && String(cDoc.departmentId) !== currentDeptId) {
        throw new AppError(400, 'INVALID_COURSE_DEPARTMENT', 'The selected course does not belong to the selected department.');
      }
      student.courseId = cDoc._id;
      student.branch = cDoc.name;
    } else {
      student.courseId = undefined;
    }
  }

  if (input.semester !== undefined) student.semester = Number(input.semester);
  if (input.cgpa !== undefined) student.cgpa = Number(input.cgpa);
  if (input.backlogs !== undefined) student.backlogs = Number(input.backlogs);
  if (input.passingYear !== undefined) student.passingYear = input.passingYear ? Number(input.passingYear) : undefined;

  await student.save();
  return student.toObject();
}

export async function findStudentByUserId(userId) {
  let student = await Student.findOne({ userId });
  if (!student) {
    const user = await User.findById(userId);
    if (user) {
      if (user.email) {
        student = await Student.findOne({ email: user.email.toLowerCase().trim() });
      }
      if (!student && user.universityId) {
        student = await Student.findOne({ universityId: user.universityId.trim().toUpperCase() });
      }
      if (student && !student.userId) {
        student.userId = user._id;
        await student.save();
      }
    }
  }
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student profile not found for this account.');
  return student;
}

export async function getStudentByUserId(userId) {
  const student = await findStudentByUserId(userId);
  return student.toObject ? student.toObject() : student;
}

export async function getPublicStudentProfile(id, requestUser = null) {
  let student;
  if (mongoose.Types.ObjectId.isValid(id)) {
    student = await Student.findById(id).lean();
  }
  if (!student) {
    student = await Student.findOne({ universityId: id.toUpperCase() }).lean();
  }
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student profile not found.');

  const isOwner = requestUser && String(student.userId) === String(requestUser.userId);
  const isAuthorizedStaff = requestUser && ['ROLE_SUPER_ADMIN', 'ROLE_PLACEMENT_HEAD', 'ROLE_PLACEMENT_COORDINATOR'].includes(requestUser.roleId);

  if (!student.isPublicProfile && !isOwner && !isAuthorizedStaff) {
    throw new AppError(403, 'PROFILE_PRIVATE', 'This student profile is currently set to private.');
  }

  // Ensure security: never leak internal user/auth structures
  delete student.__v;
  return student;
}

export async function updateProfilePhoto(userId, photoUrl) {
  const student = await findStudentByUserId(userId);
  student.profilePhoto = photoUrl;
  await student.save();
  return { profilePhoto: student.profilePhoto };
}

export async function deleteProfilePhoto(userId) {
  const student = await findStudentByUserId(userId);
  student.profilePhoto = undefined;
  await student.save();
  return { message: 'Profile photo removed.' };
}

export async function updateMyProfile(userId, input = {}) {
  const prohibitedInPayload = Object.keys(input).filter((key) => PROTECTED_STUDENT_FIELDS.includes(key));
  if (prohibitedInPayload.length > 0) {
    throw new AppError(
      400,
      'PROTECTED_FIELD_READONLY',
      `Field '${prohibitedInPayload[0]}' is a protected record and cannot be edited directly by students. Requests for academic updates must be submitted to Placement Cell staff.`
    );
  }

  const student = await findStudentByUserId(userId);

  if (input.profilePhoto !== undefined) student.profilePhoto = input.profilePhoto;
  if (input.headline !== undefined) student.headline = input.headline.trim();
  if (input.bio !== undefined) student.bio = input.bio.trim();
  if (input.careerObjective !== undefined) student.careerObjective = input.careerObjective.trim();
  if (Array.isArray(input.skills)) student.skills = input.skills.map((s) => String(s).trim()).filter(Boolean);
  if (input.githubUrl !== undefined) student.githubUrl = input.githubUrl.trim();
  if (input.linkedinUrl !== undefined) student.linkedinUrl = input.linkedinUrl.trim();
  if (input.portfolioUrl !== undefined) student.portfolioUrl = input.portfolioUrl.trim();
  if (input.isPublicProfile !== undefined) student.isPublicProfile = Boolean(input.isPublicProfile);

  if (input.mobileNumber !== undefined) student.mobileNumber = input.mobileNumber.trim();
  if (input.address !== undefined) student.address = input.address.trim();

  await student.save();
  return student.toObject();
}

export async function updateResume(userId, resumeData) {
  const student = await findStudentByUserId(userId);

  student.resume = {
    url: resumeData.url,
    fileName: resumeData.fileName,
    fileSize: resumeData.fileSize || 0,
    uploadedAt: new Date()
  };
  await student.save();
  return student.resume;
}

export async function deleteResume(userId) {
  const student = await findStudentByUserId(userId);

  student.resume = undefined;
  await student.save();
  return { message: 'Resume deleted successfully.' };
}

// Certificate CRUD
export async function addCertificate(userId, input) {
  const student = await findStudentByUserId(userId);

  student.certificates.push({
    name: input.name.trim(),
    issuingOrganization: input.issuingOrganization.trim(),
    issueDate: input.issueDate ? String(input.issueDate).trim() : '',
    credentialId: input.credentialId ? String(input.credentialId).trim() : '',
    credentialUrl: input.credentialUrl ? String(input.credentialUrl).trim() : '',
    fileUrl: input.fileUrl ? String(input.fileUrl).trim() : ''
  });
  await student.save();
  return student.certificates[student.certificates.length - 1];
}

export async function updateCertificate(userId, certId, input) {
  const student = await findStudentByUserId(userId);

  const cert = student.certificates.id(certId);
  if (!cert) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'Certificate record not found.');

  if (input.name !== undefined) cert.name = input.name.trim();
  if (input.issuingOrganization !== undefined) cert.issuingOrganization = input.issuingOrganization.trim();
  if (input.issueDate !== undefined) cert.issueDate = String(input.issueDate).trim();
  if (input.credentialId !== undefined) cert.credentialId = String(input.credentialId).trim();
  if (input.credentialUrl !== undefined) cert.credentialUrl = String(input.credentialUrl).trim();
  if (input.fileUrl !== undefined) cert.fileUrl = String(input.fileUrl).trim();

  await student.save();
  return cert;
}

export async function deleteCertificate(userId, certId) {
  const student = await findStudentByUserId(userId);

  student.certificates.pull(certId);
  await student.save();
  return { message: 'Certificate deleted successfully.' };
}

// Project CRUD
export async function addProject(userId, input) {
  const student = await findStudentByUserId(userId);

  student.projects.push({
    title: input.title.trim(),
    description: input.description ? input.description.trim() : '',
    technologies: Array.isArray(input.technologies) ? input.technologies.map((t) => String(t).trim()).filter(Boolean) : [],
    projectUrl: input.projectUrl ? String(input.projectUrl).trim() : '',
    githubUrl: input.githubUrl ? String(input.githubUrl).trim() : '',
    startDate: input.startDate ? String(input.startDate).trim() : '',
    endDate: input.endDate ? String(input.endDate).trim() : ''
  });
  await student.save();
  return student.projects[student.projects.length - 1];
}

export async function updateProject(userId, projectId, input) {
  const student = await findStudentByUserId(userId);

  const project = student.projects.id(projectId);
  if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project record not found.');

  if (input.title !== undefined) project.title = input.title.trim();
  if (input.description !== undefined) project.description = input.description.trim();
  if (Array.isArray(input.technologies)) project.technologies = input.technologies.map((t) => String(t).trim()).filter(Boolean);
  if (input.projectUrl !== undefined) project.projectUrl = String(input.projectUrl).trim();
  if (input.githubUrl !== undefined) project.githubUrl = String(input.githubUrl).trim();
  if (input.startDate !== undefined) project.startDate = String(input.startDate).trim();
  if (input.endDate !== undefined) project.endDate = String(input.endDate).trim();

  await student.save();
  return project;
}

export async function deleteProject(userId, projectId) {
  const student = await findStudentByUserId(userId);

  student.projects.pull(projectId);
  await student.save();
  return { message: 'Project deleted successfully.' };
}

// Internship CRUD
export async function addInternship(userId, input) {
  const student = await findStudentByUserId(userId);

  student.internships.push({
    organization: input.organization.trim(),
    role: input.role.trim(),
    description: input.description ? input.description.trim() : '',
    startDate: input.startDate ? String(input.startDate).trim() : '',
    endDate: input.endDate ? String(input.endDate).trim() : '',
    documentUrl: input.documentUrl ? String(input.documentUrl).trim() : ''
  });
  await student.save();
  return student.internships[student.internships.length - 1];
}

export async function updateInternship(userId, internshipId, input) {
  const student = await findStudentByUserId(userId);

  const internship = student.internships.id(internshipId);
  if (!internship) throw new AppError(404, 'INTERNSHIP_NOT_FOUND', 'Internship record not found.');

  if (input.organization !== undefined) internship.organization = input.organization.trim();
  if (input.role !== undefined) internship.role = input.role.trim();
  if (input.description !== undefined) internship.description = input.description.trim();
  if (input.startDate !== undefined) internship.startDate = String(input.startDate).trim();
  if (input.endDate !== undefined) internship.endDate = String(input.endDate).trim();
  if (input.documentUrl !== undefined) internship.documentUrl = String(input.documentUrl).trim();

  await student.save();
  return internship;
}

export async function deleteInternship(userId, internshipId) {
  const student = await findStudentByUserId(userId);

  student.internships.pull(internshipId);
  await student.save();
  return { message: 'Internship deleted successfully.' };
}

// Achievement CRUD
export async function addAchievement(userId, input) {
  const student = await findStudentByUserId(userId);

  student.achievements.push({
    title: input.title.trim(),
    description: input.description ? input.description.trim() : '',
    date: input.date ? String(input.date).trim() : '',
    issuingOrganization: input.issuingOrganization ? String(input.issuingOrganization).trim() : '',
    documentUrl: input.documentUrl ? String(input.documentUrl).trim() : ''
  });
  await student.save();
  return student.achievements[student.achievements.length - 1];
}

export async function updateAchievement(userId, achievementId, input) {
  const student = await findStudentByUserId(userId);

  const achievement = student.achievements.id(achievementId);
  if (!achievement) throw new AppError(404, 'ACHIEVEMENT_NOT_FOUND', 'Achievement record not found.');

  if (input.title !== undefined) achievement.title = input.title.trim();
  if (input.description !== undefined) achievement.description = input.description.trim();
  if (input.date !== undefined) achievement.date = String(input.date).trim();
  if (input.issuingOrganization !== undefined) achievement.issuingOrganization = input.issuingOrganization.trim();
  if (input.documentUrl !== undefined) achievement.documentUrl = String(input.documentUrl).trim();

  await student.save();
  return achievement;
}

export async function deleteAchievement(userId, achievementId) {
  const student = await findStudentByUserId(userId);

  student.achievements.pull(achievementId);
  await student.save();
  return { message: 'Achievement deleted successfully.' };
}

export async function deleteStudent(id) {
  const student = await Student.findById(id);
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student profile not found.');

  const userOr = [];
  if (student.userId) userOr.push({ _id: student.userId });
  if (student.email) userOr.push({ email: student.email.toLowerCase().trim() });
  if (student.universityId) userOr.push({ universityId: student.universityId.trim() });

  if (userOr.length > 0) {
    await User.deleteMany({ $or: userOr });
  }
  await Student.findByIdAndDelete(id);
  return { message: 'Student profile and linked user account deleted successfully.' };
}


