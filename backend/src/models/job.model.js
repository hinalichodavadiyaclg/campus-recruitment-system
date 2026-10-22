import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const compensationSchema = new Schema(
  {
    salaryMin: { type: Number, min: 0 },
    salaryMax: { type: Number, min: 0 },
    currency: { type: String, default: 'INR', trim: true },
    salaryFormat: {
      type: String,
      enum: ['PER_ANNUM', 'PER_MONTH', 'STIPEND'],
      default: 'PER_ANNUM'
    },
    additionalPerks: { type: String, trim: true }
  },
  { _id: false }
);

const eligibilityCriteriaSchema = new Schema(
  {
    allowedDepartmentIds: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
    allowedCourseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    allowedPassingYears: [{ type: Number }],
    minCgpa: { type: Number, min: 0, max: 10, default: 0 },
    maxActiveBacklogs: { type: Number, min: 0, default: null },
    requiredSkills: [{ type: String, trim: true }],
    preferredSkills: [{ type: String, trim: true }],
    requiresNaandiTraining: { type: Boolean, default: true }
  },
  { _id: false }
);

const jobHistorySchema = new Schema(
  {
    action: { type: String, required: true, trim: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true },
    details: { type: Schema.Types.Mixed }
  },
  { _id: false }
);

const jobSchema = new Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10
    },
    responsibilities: {
      type: Schema.Types.Mixed,
      default: []
    },
    jobType: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT'],
      required: true
    },
    category: {
      type: String,
      trim: true
    },
    workMode: {
      type: String,
      enum: ['ON_SITE', 'REMOTE', 'HYBRID'],
      required: true
    },
    location: {
      type: String,
      trim: true
    },
    vacancies: {
      type: Number,
      required: true,
      min: 1
    },
    compensation: compensationSchema,
    selectionProcess: [{ type: String, trim: true }],
    eligibilityMode: {
      type: String,
      enum: ['ALL_STUDENTS', 'RESTRICTED'],
      default: 'RESTRICTED'
    },
    eligibilityCriteria: {
      type: eligibilityCriteriaSchema,
      default: () => ({})
    },
    status: {
      type: String,
      enum: ['DRAFT', 'OPEN', 'PAUSED', 'CLOSED'],
      default: 'DRAFT',
      index: true
    },
    deadline: {
      type: Date,
      required: true
    },
    publishedAt: {
      type: Date
    },
    closedAt: {
      type: Date
    },
    isSuspended: {
      type: Boolean,
      default: false,
      index: true
    },
    suspensionReason: {
      type: String,
      trim: true
    },
    suspendedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    suspendedAt: {
      type: Date
    },
    recruitmentRound: {
      type: Number,
      default: 1,
      min: 1
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    history: [jobHistorySchema]
  },
  {
    collection: 'jobs',
    timestamps: true
  }
);

// Indexes
jobSchema.index({ companyId: 1, status: 1 });
jobSchema.index({ status: 1, isSuspended: 1, deadline: 1 });
jobSchema.index({ 'eligibilityCriteria.allowedDepartmentIds': 1 });
jobSchema.index({ 'eligibilityCriteria.allowedCourseIds': 1 });
jobSchema.index({ title: 'text', description: 'text', category: 'text' });

export const Job = model('Job', jobSchema);
