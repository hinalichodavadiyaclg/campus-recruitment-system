import mongoose from 'mongoose';
import { Department } from '../models/department.model.js';
import { Course } from '../models/course.model.js';

async function restoreDepartments() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_recruitment?replicaSet=rs0';
  console.log(`Connecting to: ${uri}`);
  await mongoose.connect(uri);

  const departmentsToRestore = [
    {
      _id: new mongoose.Types.ObjectId('6ac9900ab9b209e72071c6cd'),
      name: 'Computer Science',
      code: 'CSE',
      description: 'Department of Computer Science and Applications',
      isActive: true,
      createdAt: new Date('2026-10-10T01:48:19.000Z'),
      updatedAt: new Date('2026-10-10T01:48:19.000Z'),
      __v: 0
    },
    {
      _id: new mongoose.Types.ObjectId('6ad25239bce748f3a173445e'),
      name: 'Management',
      code: 'MGMT',
      description: 'Department of Management Studies and Business Administration',
      isActive: true,
      createdAt: new Date('2026-10-16T16:35:05.000Z'),
      updatedAt: new Date('2026-10-16T16:35:05.000Z'),
      __v: 0
    },
    {
      _id: new mongoose.Types.ObjectId('6ae425e62f35ee9c6868b4e8'),
      name: 'Computer Engineering',
      code: 'CE',
      description: 'Department of Computer Engineering',
      isActive: true,
      createdAt: new Date('2026-10-30T05:06:46.681Z'),
      updatedAt: new Date('2026-10-30T05:06:46.681Z'),
      __v: 0
    }
  ];

  console.log('\n--- Restoring Departments ---');
  for (const deptData of departmentsToRestore) {
    const existing = await Department.findById(deptData._id);
    if (existing) {
      console.log(`[EXISTS] Department ${deptData.name} (${deptData.code}) with ID ${deptData._id}`);
      // Ensure it is active
      if (!existing.isActive) {
        existing.isActive = true;
        await existing.save();
        console.log(`  Updated isActive to true`);
      }
    } else {
      await Department.collection.insertOne(deptData);
      console.log(`[RESTORED] Department ${deptData.name} (${deptData.code}) with ID ${deptData._id}`);
    }
  }

  // Verification step: verify all courses and their department linkages
  console.log('\n--- Verifying Course -> Department Linkages ---');
  const allCourses = await Course.find({}).lean();
  let allLinked = true;

  for (const course of allCourses) {
    const linkedDept = await Department.findById(course.departmentId).lean();
    if (linkedDept) {
      console.log(`✓ Course: "${course.name}" (${course.code}) -> Department: "${linkedDept.name}" (${linkedDept.code}) [ID: ${course.departmentId}]`);
    } else {
      console.error(`✗ Course: "${course.name}" (${course.code}) -> MISSING Department [ID: ${course.departmentId}]`);
      allLinked = false;
    }
  }

  console.log('\n--- Department Summary in Database ---');
  const allDepts = await Department.find({}).lean();
  console.log(`Total departments in DB: ${allDepts.length}`);
  for (const d of allDepts) {
    const coursesInDept = await Course.find({ departmentId: d._id }).lean();
    console.log(`- [${d.code}] ${d.name} (_id: ${d._id}, isActive: ${d.isActive}) -> ${coursesInDept.length} courses: ${coursesInDept.map(c => c.code).join(', ')}`);
  }

  if (allLinked) {
    console.log('\nSUCCESS: All courses are successfully linked to their retrieved departments!');
  } else {
    console.error('\nWARNING: Some courses are still unlinked.');
  }

  await mongoose.disconnect();
  console.log('Database disconnected.');
}

restoreDepartments().catch((err) => {
  console.error('Restoration failed:', err);
  process.exit(1);
});

