import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const certificateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    issuingOrganization: { type: String, required: true, trim: true },
    issueDate: { type: String, trim: true },
    credentialId: { type: String, trim: true },
    credentialUrl: { type: String, trim: true },
    fileUrl: { type: String, trim: true },
    isNaandiTraining: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const projectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    technologies: { type: [String], default: [] },
    projectUrl: { type: String, trim: true },
    githubUrl: { type: String, trim: true },
    startDate: { type: String, trim: true },
    endDate: { type: String, trim: true }
  },
  { timestamps: true }
);

const internshipSchema = new Schema(
  {
    organization: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    startDate: { type: String, trim: true },
    endDate: { type: String, trim: true },
    documentUrl: { type: String, trim: true }
  },
  { timestamps: true }
);

const achievementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    date: { type: String, trim: true },
    issuingOrganization: { type: String, trim: true },
    documentUrl: { type: String, trim: true }
  },
  { timestamps: true }
);

const resumeSchema = new Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const studentSchema = new Schema(
  {
    universityId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    branch: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    semester: { type: Number, required: true, min: 1, max: 12 },
    cgpa: { type: Number, required: true, min: 0, max: 10 },
    backlogs: { type: Number, default: 0, min: 0 },
    passingYear: { type: Number, min: 1990, max: 2100 },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },

    // Additional Profile Information
    profilePhoto: { type: String, trim: true },
    headline: { type: String, trim: true },
    bio: { type: String, trim: true },
    careerObjective: { type: String, trim: true },
    skills: { type: [String], default: [] },
    githubUrl: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    portfolioUrl: { type: String, trim: true },
    isPublicProfile: { type: Boolean, default: true },

    resume: resumeSchema,
    certificates: [certificateSchema],
    projects: [projectSchema],
    internships: [internshipSchema],
    achievements: [achievementSchema]
  },
  { collection: 'students', timestamps: true }
);

studentSchema.index({ branch: 1, passingYear: 1 });
studentSchema.index({ departmentId: 1, courseId: 1 });
studentSchema.index({ isPublicProfile: 1 });

export const Student = model('Student', studentSchema);

