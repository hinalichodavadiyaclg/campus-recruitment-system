import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const EXTRACTION_STATUSES = Object.freeze(['PENDING', 'SUCCESS', 'FAILED']);

const studentResumeSchema = new Schema(
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
    fileName: {
      type: String,
      required: true,
      trim: true
    },
    fileUrl: {
      type: String,
      required: true,
      trim: true
    },
    fileType: {
      type: String,
      required: true,
      trim: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    versionNumber: {
      type: Number,
      default: 1
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isAiImproved: {
      type: Boolean,
      default: false
    },
    improvementId: {
      type: Schema.Types.ObjectId,
      ref: 'ResumeImprovement',
      default: null
    },
    docxUrl: {
      type: String,
      default: null
    },
    extractedText: {
      type: String,
      default: ''
    },
    extractedData: {
      contact: {
        email: { type: String, trim: true },
        phone: { type: String, trim: true },
        linkedin: { type: String, trim: true },
        github: { type: String, trim: true }
      },
      skills: [{ type: String, trim: true }],
      education: [
        {
          degree: { type: String, trim: true },
          institution: { type: String, trim: true },
          year: { type: String, trim: true },
          score: { type: String, trim: true }
        }
      ],
      projects: [
        {
          title: { type: String, trim: true },
          description: { type: String, trim: true },
          technologies: [{ type: String, trim: true }]
        }
      ],
      experience: [
        {
          role: { type: String, trim: true },
          organization: { type: String, trim: true },
          duration: { type: String, trim: true },
          description: { type: String, trim: true }
        }
      ],
      certifications: [{ type: String, trim: true }]
    },
    extractionStatus: {
      type: String,
      enum: EXTRACTION_STATUSES,
      default: 'PENDING'
    },
    extractionError: {
      type: String,
      default: ''
    }
  },
  {
    collection: 'student_resumes',
    timestamps: true
  }
);

studentResumeSchema.index({ studentId: 1, versionNumber: -1 });

export const StudentResume = model('StudentResume', studentResumeSchema);

