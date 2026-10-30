import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const TEMPLATE_STATUSES = Object.freeze(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']);
export const TEMPLATE_ORIENTATIONS = Object.freeze(['LANDSCAPE', 'PORTRAIT']);
export const TEMPLATE_SCOPES = Object.freeze(['INSTITUTION', 'DEPARTMENT', 'COMPANY']);

const workshopCertificateTemplateSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: false,
      default: null,
      index: true
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: false,
      default: null,
      index: true
    },
    templateScope: {
      type: String,
      enum: TEMPLATE_SCOPES,
      default: 'COMPANY'
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    backgroundUrl: {
      type: String,
      required: true,
      trim: true
    },
    orientation: {
      type: String,
      enum: TEMPLATE_ORIENTATIONS,
      default: 'LANDSCAPE'
    },
    status: {
      type: String,
      enum: TEMPLATE_STATUSES,
      default: 'APPROVED'
    },
    version: {
      type: Number,
      default: 1
    },
    signatoryName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },
    signatoryTitle: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    collection: 'workshop_certificate_templates',
    timestamps: true
  }
);

workshopCertificateTemplateSchema.index({ companyId: 1, name: 1 }, { sparse: true });
workshopCertificateTemplateSchema.index({ departmentId: 1, name: 1 }, { sparse: true });

export const WorkshopCertificateTemplate = model(
  'WorkshopCertificateTemplate',
  workshopCertificateTemplateSchema
);
