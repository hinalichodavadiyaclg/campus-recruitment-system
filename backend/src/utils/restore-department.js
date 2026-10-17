import mongoose from 'mongoose';
import { Department } from '../models/department.model.js';
import { Student } from '../models/student.model.js';
import { Course } from '../models/course.model.js';

async function restoreVerifiedDepartment() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_recruitment';
  console.log(`Connecting to: ${uri}`);
  await mongoose.connect(uri);

  const existingDept = await Department.findById('6ac9900ab9b209e72071c6cd');
  if (existingDept) {
    console.log('Department already exists with ID: 6ac9900ab9b209e72071c6cd');
    console.log(JSON.stringify(existingDept, null, 2));
  } else {
    console.log('Restoring verified Department document...');
    const restored = await Department.collection.insertOne({
      _id: new mongoose.Types.ObjectId('6ac9900ab9b209e72071c6cd'),
      name: 'Computer Science',
      code: 'CSE',
      description: '',
      isActive: true,
      createdAt: new Date('2026-10-10T01:48:19.000Z'),
      updatedAt: new Date('2026-10-10T01:48:19.000Z'),
      __v: 0
    });
    console.log('Restoration result:', restored);
  }

  // Verification step: verify department and foreign key linkage
  const deptDoc = await Department.findById('6ac9900ab9b209e72071c6cd').lean();
  console.log('Verified Department Record in DB:');
  console.log(JSON.stringify(deptDoc, null, 2));

  // Verify Student linkage
  const linkedStudents = await Student.find({ departmentId: deptDoc._id }).lean();
  console.log(`Students successfully linked to restored Department: ${linkedStudents.length}/10`);

  // Verify Course linkage
  const linkedCourses = await Course.find({ departmentId: deptDoc._id }).lean();
  console.log(`Courses successfully linked to restored Department: ${linkedCourses.length}/1`);

  await mongoose.disconnect();
  console.log('Database disconnected successfully.');
}

restoreVerifiedDepartment().catch((err) => {
  console.error('Restoration failed:', err);
  process.exit(1);
});
