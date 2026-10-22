import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const statusHistorySchema = new Schema(
  {
    previousStatus: { type: String },
    newStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true }
  },
  { _id: false }
);

const resumeSnapshotSchema = new Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number },
    source: {
      type: String,
      enum: ['PROFILE', 'JOB_SPECIFIC'],
      default: 'PROFILE'
    },
    submittedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const jobSnapshotSchema = new Schema(
  {
    title: { type: String, required: true },
    jobType: { type: String, required: true },
    category: { type: String },
    workMode: { type: String, required: true },
    location: { type: String },
    vacancies: { type: Number, required: true },
    compensation: { type: Schema.Types.Mixed },
    selectionProcess: [{ type: String }],
    deadline: { type: Date, required: true },
    recruitmentRound: { type: Number, default: 1 }
  },
  { _id: false }
);

const eligibilitySnapshotSchema = new Schema(
  {
    evaluatedAt: { type: Date, default: Date.now },
    isEligible: { type: Boolean, required: true },
    checks: { type: Schema.Types.Mixed },
    details: { type: String }
  },
  { _id: false }
);

const applicationSchema = new Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
      index: true
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    recruitmentRound: {
      type: Number,
      required: true,
      default: 1,
      min: 1
    },
    status: {
      type: String,
      enum: [
        'APPLIED',
        'UNDER_REVIEW',
        'SHORTLISTED',
        'ASSESSMENT',
        'INTERVIEW',
        'SELECTED',
        'REJECTED',
        'WITHDRAWN'
      ],
      default: 'APPLIED',
      required: true,
      index: true
    },
    jobSnapshot: {
      type: jobSnapshotSchema,
      required: true
    },
    resumeSnapshot: {
      type: resumeSnapshotSchema,
      required: true
    },
    eligibilitySnapshot: {
      type: eligibilitySnapshotSchema,
      required: true
    },
    statusHistory: [statusHistorySchema]
  },
  {
    collection: 'applications',
    timestamps: true
  }
);

// Prevent duplicate applications for the same job and student in the same recruitment round
applicationSchema.index({ jobId: 1, studentId: 1, recruitmentRound: 1 }, { unique: true });

// Query optimization indexes
applicationSchema.index({ studentId: 1, createdAt: -1 });
applicationSchema.index({ companyId: 1, status: 1 });
applicationSchema.index({ jobId: 1, status: 1 });

export const Application = model('Application', applicationSchema);
