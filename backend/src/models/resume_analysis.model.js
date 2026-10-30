import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const ANALYSIS_TYPES = Object.freeze(['GENERAL', 'JOB_MATCH']);
export const ANALYSIS_STATUSES = Object.freeze(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

const recommendationSchema = new Schema(
  {
    problem: { type: String, required: true },
    whyItMatters: { type: String, required: true },
    howToImprove: { type: String, required: true },
    example: { type: String, default: '' },
    priority: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], default: 'MEDIUM' }
  },
  { _id: false }
);

const resumeAnalysisSchema = new Schema(
  {
    resumeId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentResume',
      required: true,
      index: true
    },
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
    resumeVersion: {
      type: Number,
      default: 1
    },
    analysisType: {
      type: String,
      enum: ANALYSIS_TYPES,
      default: 'GENERAL',
      index: true
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'Job',
      default: null,
      index: true
    },
    overallScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    categoryScores: {
      atsCompatibility: { type: Number, min: 0, max: 100, default: 0 },
      skills: { type: Number, min: 0, max: 100, default: 0 },
      education: { type: Number, min: 0, max: 100, default: 0 },
      projects: { type: Number, min: 0, max: 100, default: 0 },
      experience: { type: Number, min: 0, max: 100, default: 0 },
      resumeStructure: { type: Number, min: 0, max: 100, default: 0 }
    },
    summary: {
      type: String,
      required: true,
      trim: true
    },
    strengths: [{ type: String, trim: true }],
    areasForImprovement: [{ type: String, trim: true }],
    extractedSkills: {
      technical: [{ type: String, trim: true }],
      soft: [{ type: String, trim: true }],
      industry: [{ type: String, trim: true }],
      missingOrWeak: [{ type: String, trim: true }]
    },
    missingSections: [{ type: String, trim: true }],
    recommendations: [recommendationSchema],
    jobMatchResult: {
      jobMatchScore: { type: Number, min: 0, max: 100, default: null },
      matchedSkills: [{ type: String, trim: true }],
      missingSkills: [{ type: String, trim: true }],
      partiallyDemonstratedSkills: [{ type: String, trim: true }],
      jobRecommendations: [{ type: String, trim: true }],
      jobSnapshot: {
        title: { type: String, default: '' },
        companyName: { type: String, default: '' },
        jobType: { type: String, default: '' },
        workLocation: { type: String, default: '' }
      }
    },
    aiModel: {
      type: String,
      default: 'vvwu-ai-analyzer-v1'
    },
    analysisStatus: {
      type: String,
      enum: ANALYSIS_STATUSES,
      default: 'COMPLETED'
    },
    errorMessage: {
      type: String,
      default: ''
    }
  },
  {
    collection: 'resume_analyses',
    timestamps: true
  }
);

resumeAnalysisSchema.index({ studentId: 1, createdAt: -1 });
resumeAnalysisSchema.index({ resumeId: 1, createdAt: -1 });

export const ResumeAnalysis = model('ResumeAnalysis', resumeAnalysisSchema);
