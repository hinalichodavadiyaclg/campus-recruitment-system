import mongoose from 'mongoose';

const { Schema, model } = mongoose;

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
    semester: { type: Number, required: true, min: 1, max: 12 },
    cgpa: { type: Number, required: true, min: 0, max: 10 },
    backlogs: { type: Number, default: 0, min: 0 },
    passingYear: { type: Number, required: true, min: 1990, max: 2100 },
    userId: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { collection: 'students', timestamps: true }
);

studentSchema.index({ branch: 1, passingYear: 1 });

export const Student = model('Student', studentSchema);
