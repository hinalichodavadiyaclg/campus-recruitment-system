import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const companySchema = new Schema(
  {
    companyName: { type: String, required: true, unique: true, trim: true },
    industryType: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    website: { type: String, trim: true },
    yearEstablished: { type: Number, min: 1800, max: 2100 },
    hrRecruiterName: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobileNumber: { type: String, trim: true },
    officeAddress: { type: String, trim: true },
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'VERIFIED',
      required: true
    }
  },
  { collection: 'companies', timestamps: true }
);

companySchema.index({ industryType: 1 });

export const Company = model('Company', companySchema);
