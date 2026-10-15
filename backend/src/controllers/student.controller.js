import * as studentService from '../services/student.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const listStudents = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.listStudents(response.locals.input?.query || request.query || {}, request.auth))
);

export const getStudent = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.getStudentById(response.locals.input?.params?.id || request.params.id, request.auth))
);

export const createStudent = asyncHandler(async (request, response) =>
  sendSuccess(response, 201, await studentService.createStudent(response.locals.input?.body || request.body, request.auth))
);

export const updateStudent = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.updateStudent(response.locals.input?.params?.id || request.params.id, response.locals.input?.body || request.body, request.auth))
);

export const deleteStudent = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteStudent(response.locals.input?.params?.id || request.params.id, request.auth))
);

export const getMyStudentProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.getStudentByUserId(request.auth.userId))
);

export const getPublicStudentProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.getPublicStudentProfile(request.params.id, request.auth || null))
);

export const updateMyProfile = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.updateMyProfile(request.auth.userId, request.body))
);

export const updateProfilePhoto = asyncHandler(async (request, response) => {
  let photoUrl = request.body.profilePhoto;
  if (request.file) {
    photoUrl = `/uploads/photos/${request.file.filename}`;
  }
  sendSuccess(response, 200, await studentService.updateProfilePhoto(request.auth.userId, photoUrl));
});

export const deleteProfilePhoto = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteProfilePhoto(request.auth.userId))
);

export const updateResume = asyncHandler(async (request, response) => {
  let resumeData = request.body;
  if (request.file) {
    const fileUrl = `/uploads/resumes/${request.file.filename}`;
    resumeData = {
      url: fileUrl,
      fileName: request.file.originalname,
      fileSize: request.file.size
    };
  }
  sendSuccess(response, 200, await studentService.updateResume(request.auth.userId, resumeData));
});

export const deleteResume = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteResume(request.auth.userId))
);

const getUploadUrl = (file) => {
  if (!file) return '';
  let subfolder = 'documents';
  if (file.fieldname === 'resume' || file.mimetype?.includes('pdf')) subfolder = 'resumes';
  if (file.mimetype?.startsWith('image/')) subfolder = 'photos';
  return `/uploads/${subfolder}/${file.filename}`;
};

// Certificates
export const addCertificate = asyncHandler(async (request, response) => {
  const data = { ...request.body };
  if (request.file) {
    data.fileUrl = getUploadUrl(request.file);
  }
  sendSuccess(response, 201, await studentService.addCertificate(request.auth.userId, data));
});

export const updateCertificate = asyncHandler(async (request, response) => {
  const data = { ...request.body };
  if (request.file) {
    data.fileUrl = getUploadUrl(request.file);
  }
  sendSuccess(response, 200, await studentService.updateCertificate(request.auth.userId, request.params.certId, data));
});

export const deleteCertificate = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteCertificate(request.auth.userId, request.params.certId))
);

// Projects
export const addProject = asyncHandler(async (request, response) =>
  sendSuccess(response, 201, await studentService.addProject(request.auth.userId, request.body))
);

export const updateProject = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.updateProject(request.auth.userId, request.params.projectId, request.body))
);

export const deleteProject = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteProject(request.auth.userId, request.params.projectId))
);

// Internships
export const addInternship = asyncHandler(async (request, response) => {
  const data = { ...request.body };
  if (request.file) {
    data.documentUrl = getUploadUrl(request.file);
  }
  sendSuccess(response, 201, await studentService.addInternship(request.auth.userId, data));
});

export const updateInternship = asyncHandler(async (request, response) => {
  const data = { ...request.body };
  if (request.file) {
    data.documentUrl = getUploadUrl(request.file);
  }
  sendSuccess(response, 200, await studentService.updateInternship(request.auth.userId, request.params.internshipId, data));
});

export const deleteInternship = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteInternship(request.auth.userId, request.params.internshipId))
);

// Achievements
export const addAchievement = asyncHandler(async (request, response) => {
  const data = { ...request.body };
  if (request.file) {
    data.documentUrl = getUploadUrl(request.file);
  }
  sendSuccess(response, 201, await studentService.addAchievement(request.auth.userId, data));
});

export const updateAchievement = asyncHandler(async (request, response) => {
  const data = { ...request.body };
  if (request.file) {
    data.documentUrl = getUploadUrl(request.file);
  }
  sendSuccess(response, 200, await studentService.updateAchievement(request.auth.userId, request.params.achievementId, data));
});

export const deleteAchievement = asyncHandler(async (request, response) =>
  sendSuccess(response, 200, await studentService.deleteAchievement(request.auth.userId, request.params.achievementId))
);


