import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const IMPROVEMENT_STATUSES = Object.freeze([
  'IN_PROGRESS',
  'READY_FOR_REVIEW',
  'APPROVED',
  'GENERATED'
]);

export const SECTION_DECISIONS = Object.freeze([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EDITED'
]);

const improvementSectionSchema = new Schema(
  {
    sectionKey: {
      type: String,
      required: true,
      trim: true
    },
    sectionTitle: {
      type: String,
      required: true,
      trim: true
    },
    originalContent: {
      type: Schema.Types.Mixed,
      required: true
    },
    improvedContent: {
      type: Schema.Types.Mixed,
      required: true
    },
    explanation: {
      type: String,
      required: true,
      trim: true
    },
    sourceEvidence: [{ type: String, trim: true }],
    unsupportedClaimsDetected: [{ type: String, trim: true }],
    studentDecision: {
      type: String,
      enum: SECTION_DECISIONS,
      default: 'PENDING'
    },
    studentEditedContent: {
      type: Schema.Types.Mixed,
      default: null
    }
  },
  { _id: true }
);

const missingInfoQuestionSchema = new Schema(
  {
    id: { type: String, required: true },
    sectionKey: { type: String, required: true },
    question: { type: String, required: true },
    reason: { type: String, required: true },
    studentAnswer: { type: String, default: '' },
    isAnswered: { type: Boolean, default: false }
  },
  { _id: false }
);

const resumeImprovementSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentResume',
      required: true,
      index: true
    },
    originalVersion: {
      type: Number,
      default: 1
    },
    status: {
      type: String,
      enum: IMPROVEMENT_STATUSES,
      default: 'READY_FOR_REVIEW',
      index: true
    },
    aiProvider: {
      type: String,
      default: 'local-deterministic'
    },
    sections: [improvementSectionSchema],
    missingInformationQuestions: [missingInfoQuestionSchema],
    validationStatus: {
      type: String,
      enum: ['STRICTLY_PRESERVED', 'CONTAINS_FLAGGED_ITEMS', 'MANUALLY_VERIFIED'],
      default: 'STRICTLY_PRESERVED'
    },
    generatedVersion: {
      versionNumber: { type: Number },
      newResumeId: { type: Schema.Types.ObjectId, ref: 'StudentResume' },
      pdfUrl: { type: String },
      docxUrl: { type: String },
      generatedAt: { type: Date }
    }
  },
  {
    collection: 'resume_improvements',
    timestamps: true
  }
);

resumeImprovementSchema.index({ studentId: 1, resumeId: 1, createdAt: -1 });

export const ResumeImprovement = model('ResumeImprovement', resumeImprovementSchema);

