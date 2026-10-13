export const STUDENT_EDITABLE_FIELDS = Object.freeze([
  'mobileNumber',
  'address',
  'profilePhoto',
  'headline',
  'bio',
  'careerObjective',
  'skills',
  'linkedinUrl',
  'githubUrl',
  'portfolioUrl',
  'resume',
  'certificates',
  'projects',
  'internships',
  'achievements',
  'isPublicProfile'
]);

export const COMPANY_EDITABLE_FIELDS = Object.freeze([
  'companyName',
  'industryType',
  'description',
  'website',
  'yearEstablished',
  'hrRecruiterName',
  'designation',
  'email',
  'mobileNumber',
  'officeAddress'
]);

export const PROTECTED_STUDENT_FIELDS = Object.freeze([
  '_id',
  'userId',
  'universityId',
  'firstName',
  'lastName',
  'department',
  'departmentId',
  'courseId',
  'branch',
  'semester',
  'cgpa',
  'backlogs',
  'passingYear',
  'createdAt',
  'updatedAt'
]);

export const PROTECTED_COMPANY_FIELDS = Object.freeze([
  '_id',
  'userId',
  'createdAt',
  'updatedAt'
]);
