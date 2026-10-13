import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Department } from '../models/department.model.js';
import { Course } from '../models/course.model.js';
import { Student } from '../models/student.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportFilePath = path.join(__dirname, '..', '..', 'docs', 'unmatched-student-mappings.json');

export async function runAudit() {
  console.log('Running read-only diagnostic audit for department and course mappings...');
  await connectDatabase();

  const [students, departments, courses] = await Promise.all([
    Student.find({}).lean(),
    Department.find({}).lean(),
    Course.find({}).lean()
  ]);

  const deptMap = new Map();
  departments.forEach((d) => {
    deptMap.set(d.name.toLowerCase().trim(), d);
    deptMap.set(d.code.toLowerCase().trim(), d);
  });

  const courseMap = new Map();
  courses.forEach((c) => {
    courseMap.set(c.name.toLowerCase().trim(), c);
    courseMap.set(c.code.toLowerCase().trim(), c);
  });

  const matched = [];
  const unmatched = [];

  for (const student of students) {
    const deptStr = String(student.department || '').toLowerCase().trim();
    const branchStr = String(student.branch || '').toLowerCase().trim();

    const matchedDept = deptMap.get(deptStr);
    const matchedCourse = courseMap.get(branchStr) || courseMap.get(deptStr);

    if (matchedDept && matchedCourse) {
      matched.push({
        studentId: String(student._id),
        universityId: student.universityId,
        departmentString: student.department,
        branchString: student.branch,
        mappedDepartmentId: String(matchedDept._id),
        mappedCourseId: String(matchedCourse._id)
      });
    } else {
      unmatched.push({
        studentId: String(student._id),
        universityId: student.universityId,
        departmentString: student.department,
        branchString: student.branch,
        reason: !matchedDept && !matchedCourse
          ? 'Neither Department nor Course matched master documents'
          : !matchedDept
            ? 'Department string did not match any Department document'
            : 'Branch/Department string did not match any Course document'
      });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    totalStudentsAudited: students.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched
  };

  fs.mkdirSync(path.dirname(reportFilePath), { recursive: true });
  fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Audit complete. Total students: ${students.length}. Matched: ${matched.length}, Unmatched: ${unmatched.length}.`);
  console.log(`Diagnostic report written to: ${reportFilePath}`);

  await disconnectDatabase();
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAudit().catch(async (err) => {
    console.error('Audit failed:', err);
    await disconnectDatabase();
    process.exitCode = 1;
  });
}
