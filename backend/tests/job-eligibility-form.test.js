import assert from 'node:assert/strict';
import test, { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PERMISSION_IDS, ROLE_IDS } from '../src/utils/access-constants.js';
import { Department } from '../src/models/department.model.js';
import { Course } from '../src/models/course.model.js';
import { Job } from '../src/models/job.model.js';
import { Student } from '../src/models/student.model.js';
import { User } from '../src/models/user.model.js';
import { Company } from '../src/models/company.model.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedInitialData } from '../src/seeders/seed.js';
import { evaluateEligibility } from '../src/services/eligibility.service.js';
import { jobCreateSchema } from '../src/validators/schemas.js';

describe('Job Eligibility Selection & Form Refactoring Verification', () => {
  let mongo;
  let testCompany;
  let deptCs;
  let deptCommerce;
  let courseBTech;
  let courseMTech;
  let courseBCom;
  let studentCs;
  let studentCommerce;

  before(async () => {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
    await connectDatabase(mongo.getUri());
    await seedInitialData();

    // Create test company
    testCompany = await Company.create({
      companyId: 'COMP-0001',
      companyName: 'Tech Innovations Corp',
      industryType: 'Information Technology',
      yearEstablished: 2015,
      hrRecruiterName: 'Priya Sharma',
      email: 'hr@techinnovations.com',
      contactPhone: '9876543210'
    });

    // Create real test departments
    deptCs = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true
    });

    deptCommerce = await Department.create({
      name: 'Department of Commerce and Management',
      code: 'DCM',
      isActive: true
    });

    // Create real test courses associated with departments
    courseBTech = await Course.create({
      name: 'B.Tech Computer Science and Engineering',
      code: 'BT-CSE',
      departmentId: deptCs._id,
      level: 'UNDERGRADUATE',
      durationYears: 4,
      isActive: true
    });

    courseMTech = await Course.create({
      name: 'M.Tech Computer Science',
      code: 'MT-CSE',
      departmentId: deptCs._id,
      level: 'POSTGRADUATE',
      durationYears: 2,
      isActive: true
    });

    courseBCom = await Course.create({
      name: 'Bachelor of Commerce',
      code: 'BCOM',
      departmentId: deptCommerce._id,
      level: 'UNDERGRADUATE',
      durationYears: 3,
      isActive: true
    });

    // Create test students
    const userCs = await User.create({
      email: 'student.cs@vvwu.edu.in',
      passwordHash: 'dummyhash',
      roleId: ROLE_IDS.STUDENT,
      userType: 'STUDENT',
      universityId: 'UNI-2026-0001'
    });

    studentCs = await Student.create({
      userId: userCs._id,
      universityId: 'UNI-2026-0001',
      studentId: 'STU-0001',
      firstName: 'Aarohi',
      lastName: 'Patel',
      email: userCs.email,
      mobileNumber: '9876543210',
      branch: 'CSE',
      department: deptCs.name,
      departmentId: deptCs._id,
      courseId: courseBTech._id,
      semester: 8,
      passingYear: 2026,
      cgpa: 8.5,
      activeBacklogs: 0,
      resume: { url: 'https://cdn.vvwu.edu/resumes/aarohi.pdf', fileName: 'aarohi_resume.pdf' },
      certificates: [
        {
          name: 'Naandi Employability Skill Training',
          issuingOrganization: 'Naandi Foundation',
          credentialId: 'VVWU-NAANDI-2025-001',
          authoritativeVerified: true,
          isVerified: true
        }
      ]
    });

    const userComm = await User.create({
      email: 'student.comm@vvwu.edu.in',
      passwordHash: 'dummyhash',
      roleId: ROLE_IDS.STUDENT,
      userType: 'STUDENT',
      universityId: 'UNI-2026-0002'
    });

    studentCommerce = await Student.create({
      userId: userComm._id,
      universityId: 'UNI-2026-0002',
      studentId: 'STU-0002',
      firstName: 'Kavita',
      lastName: 'Shah',
      email: userComm.email,
      mobileNumber: '9876543211',
      branch: 'DCM',
      department: deptCommerce.name,
      departmentId: deptCommerce._id,
      courseId: courseBCom._id,
      semester: 6,
      passingYear: 2026,
      cgpa: 7.8,
      activeBacklogs: 0,
      resume: { url: 'https://cdn.vvwu.edu/resumes/kavita.pdf', fileName: 'kavita_resume.pdf' },
      certificates: []
    });
  });

  after(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  describe('1. Zod Schema Eligibility Payloads', () => {
    it('validates unrestricted eligibility when allowedDepartmentIds and allowedCourseIds are empty arrays', () => {
      const payload = {
        body: {
          title: 'Software Development Engineer',
          description: 'Join our core platform engineering team working with microservices, React, and Node.js.',
          jobType: 'FULL_TIME',
          category: 'Software Engineering',
          workMode: 'ON_SITE',
          location: 'Surat',
          vacancies: 5,
          compensation: {
            salaryMin: 600000,
            salaryMax: 900000,
            currency: 'INR',
            salaryFormat: 'PER_ANNUM'
          },
          selectionProcess: ['Resume Screening', 'Technical Test', 'Interview'],
          eligibilityMode: 'RESTRICTED',
          eligibilityCriteria: {
            allowedDepartmentIds: [], // All departments
            allowedCourseIds: [], // All courses
            allowedPassingYears: [2026],
            minCgpa: 6.0,
            maxActiveBacklogs: 0,
            requiresNaandiTraining: false
          },
          deadline: new Date(Date.now() + 86400000 * 10).toISOString(),
          status: 'OPEN'
        },
        params: {},
        query: {}
      };

      const result = jobCreateSchema.safeParse(payload);
      assert.ok(result.success, `Schema validation should succeed for unrestricted: ${JSON.stringify(result.error)}`);
      assert.deepEqual(result.data.body.eligibilityCriteria.allowedDepartmentIds, []);
      assert.deepEqual(result.data.body.eligibilityCriteria.allowedCourseIds, []);
    });

    it('validates restricted eligibility with real MongoDB ObjectId strings', () => {
      const payload = {
        body: {
          title: 'Frontend Developer',
          description: 'Build modern user experiences with React, TypeScript, and accessible UI standards.',
          jobType: 'FULL_TIME',
          vacancies: 2,
          workMode: 'HYBRID',
          location: 'Surat',
          compensation: {
            salaryMin: 500000,
            salaryMax: 700000,
            currency: 'INR',
            salaryFormat: 'PER_ANNUM'
          },
          selectionProcess: ['Application Review', 'Assignment'],
          eligibilityMode: 'RESTRICTED',
          eligibilityCriteria: {
            allowedDepartmentIds: [deptCs._id.toString()],
            allowedCourseIds: [courseBTech._id.toString()],
            minCgpa: 7.0,
            requiresNaandiTraining: true
          },
          deadline: new Date(Date.now() + 86400000 * 14).toISOString(),
          status: 'OPEN'
        },
        params: {},
        query: {}
      };

      const result = jobCreateSchema.safeParse(payload);
      assert.ok(result.success, 'Schema validation should pass for valid Mongo IDs');
      assert.equal(result.data.body.eligibilityCriteria.allowedDepartmentIds[0], deptCs._id.toString());
      assert.equal(result.data.body.eligibilityCriteria.allowedCourseIds[0], courseBTech._id.toString());
    });

    it('rejects display labels or arbitrary text submitted as database IDs', () => {
      const payload = {
        body: {
          title: 'QA Engineer',
          description: 'Responsible for end to end automated test suites and regression pipelines.',
          jobType: 'FULL_TIME',
          vacancies: 1,
          workMode: 'REMOTE',
          selectionProcess: ['Interview'],
          eligibilityMode: 'RESTRICTED',
          eligibilityCriteria: {
            allowedDepartmentIds: ['Computer Science and Engineering'], // INVALID: Display label instead of ObjectId
            allowedCourseIds: ['All Courses'] // INVALID: Display label instead of ObjectId
          },
          deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
          status: 'OPEN'
        },
        params: {},
        query: {}
      };

      const result = jobCreateSchema.safeParse(payload);
      assert.ok(!result.success, 'Schema must reject display labels as database IDs');
    });
  });

  describe('2. Dynamic Eligibility Evaluation Logic', () => {
    it('allows students from all departments and courses when allowed arrays are empty', async () => {
      const job = {
        status: 'OPEN',
        isSuspended: false,
        deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [], // All departments
          allowedCourseIds: [], // All courses
          minCgpa: 6.0,
          requiresNaandiTraining: false
        }
      };

      const csResult = await evaluateEligibility({ job, student: studentCs });
      assert.ok(csResult.isEligible, 'CS student should be eligible under unrestricted');

      const commResult = await evaluateEligibility({ job, student: studentCommerce });
      assert.ok(commResult.isEligible, 'Commerce student should be eligible under unrestricted');
    });

    it('restricts eligibility to specific departments and specific courses', async () => {
      const jobRestrictedToCs = {
        status: 'OPEN',
        isSuspended: false,
        deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [deptCs._id.toString()],
          allowedCourseIds: [courseBTech._id.toString()],
          minCgpa: 6.0,
          requiresNaandiTraining: false
        }
      };

      const csResult = await evaluateEligibility({ job: jobRestrictedToCs, student: studentCs });
      assert.ok(csResult.isEligible, 'B.Tech CSE student should pass eligibility');

      const commResult = await evaluateEligibility({ job: jobRestrictedToCs, student: studentCommerce });
      assert.ok(!commResult.isEligible, 'Commerce student must be blocked');
      assert.ok(
        commResult.ineligibleReason.includes('department is not eligible'),
        'Failure reason must cite ineligible department'
      );
    });

    it('enforces mandatory Naandi Training when requiresNaandiTraining is true', async () => {
      const jobWithNaandi = {
        status: 'OPEN',
        isSuspended: false,
        deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [],
          allowedCourseIds: [],
          minCgpa: 6.0,
          requiresNaandiTraining: true
        }
      };

      const csResult = await evaluateEligibility({ job: jobWithNaandi, student: studentCs });
      assert.ok(csResult.isEligible, 'Student with verified Naandi certificate should pass');

      const commResult = await evaluateEligibility({ job: jobWithNaandi, student: studentCommerce });
      assert.ok(!commResult.isEligible, 'Student without Naandi certificate must fail');
      assert.ok(
        commResult.ineligibleReason.includes('Naandi Training'),
        'Failure reason must cite Naandi training'
      );
    });

    it('allows student from any passing year when allowedPassingYears is an empty array (Any Passing Year mode)', async () => {
      const jobAnyPassingYear = {
        status: 'OPEN',
        isSuspended: false,
        deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [],
          allowedCourseIds: [],
          allowedPassingYears: [], // Empty array = Any Passing Year (no year cutoff)
          minCgpa: 6.0,
          requiresNaandiTraining: false
        }
      };

      const result = await evaluateEligibility({ job: jobAnyPassingYear, student: studentCs });
      assert.ok(result.isEligible, 'Student with passing year 2026 must be eligible under Any Passing Year mode');
      assert.equal(result.checks.passingYear, undefined, 'No passing-year failure check should be imposed');
    });

    it('restricts eligibility to selected passing years and rejects students from unselected years', async () => {
      // Student has passingYear: 2026
      const jobRestrictedYear = {
        status: 'OPEN',
        isSuspended: false,
        deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [],
          allowedCourseIds: [],
          allowedPassingYears: [2027, 2028], // Only 2027 and 2028 eligible
          minCgpa: 6.0,
          requiresNaandiTraining: false
        }
      };

      const result = await evaluateEligibility({ job: jobRestrictedYear, student: studentCs });
      assert.ok(!result.isEligible, 'Student with passing year 2026 must be blocked from 2027/2028 job');
      assert.ok(
        result.ineligibleReason.includes('passing year'),
        `Failure reason must cite passing year: ${result.ineligibleReason}`
      );

      // When passing year matches
      const jobMatchingYear = {
        status: 'OPEN',
        isSuspended: false,
        deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
        eligibilityMode: 'RESTRICTED',
        eligibilityCriteria: {
          allowedDepartmentIds: [],
          allowedCourseIds: [],
          allowedPassingYears: [2025, 2026], // 2026 is included
          minCgpa: 6.0,
          requiresNaandiTraining: false
        }
      };

      const matchingResult = await evaluateEligibility({ job: jobMatchingYear, student: studentCs });
      assert.ok(matchingResult.isEligible, 'Student with passing year 2026 must pass when 2026 is in allowedPassingYears');
      assert.ok(matchingResult.checks.passingYear?.passed, 'Passing year check must be marked passed');
    });
  });

  describe('3. Course to Department Filtering Relations', () => {
    it('correctly maps courses to their parent departments via database references', async () => {
      const cseCourses = await Course.find({ departmentId: deptCs._id }).lean();
      const cseCourseCodes = cseCourses.map((c) => c.code);
      assert.ok(cseCourseCodes.includes('BT-CSE'));
      assert.ok(cseCourseCodes.includes('MT-CSE'));
      assert.ok(!cseCourseCodes.includes('BCOM'), 'Commerce course must not belong to CSE');

      const dcmCourses = await Course.find({ departmentId: deptCommerce._id }).lean();
      const dcmCourseCodes = dcmCourses.map((c) => c.code);
      assert.ok(dcmCourseCodes.includes('BCOM'));
      assert.ok(!dcmCourseCodes.includes('BT-CSE'));
    });
  });

  describe('4. Job Responsibilities Validation & Backward Compatibility', () => {
    it('accepts repeatable array of responsibility strings', () => {
      const payload = {
        body: {
          title: 'Full Stack Developer',
          description: 'Design and develop scalable applications across modern frameworks.',
          responsibilities: [
            'Architect scalable backend REST services',
            'Develop responsive React user interfaces',
            'Participate in daily agile standups and code reviews'
          ],
          jobType: 'FULL_TIME',
          workMode: 'REMOTE',
          vacancies: 2,
          deadline: new Date(Date.now() + 86400000 * 14).toISOString(),
          status: 'OPEN'
        },
        params: {},
        query: {}
      };

      const result = jobCreateSchema.safeParse(payload);
      assert.ok(result.success, 'Schema should accept array of responsibility strings');
      assert.equal(result.data.body.responsibilities.length, 3);
      assert.equal(result.data.body.responsibilities[0], 'Architect scalable backend REST services');
    });

    it('preserves backward compatibility with legacy single-string responsibilities', () => {
      const payload = {
        body: {
          title: 'Legacy Responsibilities Job',
          description: 'Overview of the software engineer role and requirements.',
          responsibilities: 'Lead core platform development, mentor junior developers, and optimize queries.',
          jobType: 'FULL_TIME',
          workMode: 'REMOTE',
          vacancies: 1,
          deadline: new Date(Date.now() + 86400000 * 14).toISOString(),
          status: 'DRAFT'
        },
        params: {},
        query: {}
      };

      const result = jobCreateSchema.safeParse(payload);
      assert.ok(result.success, 'Schema should accept legacy string responsibilities');
      assert.equal(typeof result.data.body.responsibilities, 'string');
    });

    it('rejects empty responsibility entries in array', () => {
      const payload = {
        body: {
          title: 'Software Developer',
          description: 'Overview of the software engineer role and requirements.',
          responsibilities: [''], // Empty string is invalid
          jobType: 'FULL_TIME',
          workMode: 'REMOTE',
          vacancies: 1,
          deadline: new Date(Date.now() + 86400000 * 14).toISOString(),
          status: 'DRAFT'
        },
        params: {},
        query: {}
      };

      const result = jobCreateSchema.safeParse(payload);
      assert.ok(!result.success, 'Schema must reject empty responsibility items');
    });

    it('stores and retrieves array of responsibilities in MongoDB without type coercion corruption', async () => {
      const testJob = await Job.create({
        jobId: 'JOB-RESP-001',
        companyId: testCompany._id,
        title: 'Backend Systems Engineer',
        description: 'Build enterprise distributed systems and cloud microservices.',
        responsibilities: [
          'Design scalable MongoDB aggregation pipelines',
          'Optimize Node.js event loop throughput',
          'Deploy CI/CD containerized microservices'
        ],
        jobType: 'FULL_TIME',
        workMode: 'REMOTE',
        vacancies: 2,
        deadline: new Date(Date.now() + 86400000 * 14),
        status: 'OPEN',
        createdBy: studentCs.userId
      });

      const retrieved = await Job.findById(testJob._id).lean();
      assert.ok(Array.isArray(retrieved.responsibilities), 'Retrieved responsibilities must be an array');
      assert.equal(retrieved.responsibilities.length, 3);
      assert.equal(retrieved.responsibilities[0], 'Design scalable MongoDB aggregation pipelines');
      assert.equal(retrieved.responsibilities[1], 'Optimize Node.js event loop throughput');
      assert.equal(retrieved.responsibilities[2], 'Deploy CI/CD containerized microservices');
    });
  });
});
