import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import * as xlsx from 'xlsx';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '10';
process.env.SESSION_TOKEN_PEPPER = 'test-session-token-pepper-that-is-long-enough';
process.env.PASSWORD_RESET_SECRET = 'test-password-reset-secret-that-is-long-enough';

const [
  { createApp },
  { connectDatabase, disconnectDatabase },
  { seedInitialData },
  { User },
  { UserSession },
  { Student },
  { Company },
  { PlacementOfficer },
  { Department },
  { Course },
  { hashPassword },
  { createRawSessionToken, hashSessionToken },
  { ROLE_IDS },
  importService
] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/database.js'),
  import('../src/seeders/seed.js'),
  import('../src/models/user.model.js'),
  import('../src/models/user-session.model.js'),
  import('../src/models/student.model.js'),
  import('../src/models/company.model.js'),
  import('../src/models/placement_officer.model.js'),
  import('../src/models/department.model.js'),
  import('../src/models/course.model.js'),
  import('../src/utils/password.js'),
  import('../src/utils/session-token.js'),
  import('../src/utils/access-constants.js'),
  import('../src/services/import.service.js')
]);

let mongo;
let app;
let activeDept;
let activeCourse;

async function createAuthenticatedSession(roleId, userType = 'PLACEMENT') {
  const ts = Date.now() + Math.floor(Math.random() * 100000);
  const email = `test-${roleId.toLowerCase()}-${ts}@example.edu`;
  const passwordHash = await hashPassword('Password!123456');
  const user = await User.create({
    email,
    passwordHash,
    userType,
    roleId,
    employeeId: userType === 'PLACEMENT' ? `EMP-${ts}` : undefined,
    universityId: userType === 'STUDENT' ? `UNI-${ts}` : undefined,
    accountStatus: 'ACTIVE'
  });

  const rawToken = createRawSessionToken();
  const sessionTokenHash = hashSessionToken(rawToken);
  const now = new Date();
  await UserSession.create({
    userId: user._id,
    sessionTokenHash,
    loginAt: now,
    lastActivityAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    ipAddress: '127.0.0.1',
    userAgent: 'IntegrationTestRunner/1.0',
    isActive: true
  });

  return { user, token: rawToken };
}

function makeWorkbookBuffer(sheetName, headers, rows) {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows, { header: headers });
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

before(async () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const backendBinaryDir = join(testDir, '..', '.mongodb-binaries');
  const binaryDir = existsSync(backendBinaryDir) ? backendBinaryDir : join(process.cwd(), '.mongodb-binaries');
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: binaryDir } });
  await connectDatabase(mongo.getUri());
  await seedInitialData();
  app = createApp();

  activeDept = await Department.findOne({ code: 'CSE' });
  if (!activeDept) {
    activeDept = await Department.create({ name: 'Computer Science and Engineering', code: 'CSE', isActive: true });
  }

  activeCourse = await Course.findOne({ code: 'BTECH_CSE' });
  if (!activeCourse) {
    activeCourse = await Course.create({
      name: 'B.Tech Computer Science and Engineering',
      code: 'BTECH_CSE',
      departmentId: activeDept._id,
      level: 'UNDERGRADUATE',
      durationYears: 4,
      isActive: true
    });
  }
});

after(async () => {
  await disconnectDatabase();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Student.deleteMany({});
  await Company.deleteMany({});
  await PlacementOfficer.deleteMany({});
  await User.deleteMany({ roleId: { $ne: ROLE_IDS.SUPER_ADMIN } });
  await UserSession.deleteMany({});
});

// Scenario 1: Correct default template generated for each module (headers only, zero example data)
test('1. Correct default template generated for each module', async () => {
  for (const type of ['student', 'company', 'placement']) {
    const buf = importService.generateTemplateBuffer(type);
    assert.ok(Buffer.isBuffer(buf));
    const wb = xlsx.read(buf, { type: 'buffer' });
    assert.ok(wb.SheetNames.length >= 2, `Template for ${type} should have at least 2 sheets`);
    const templateSheetName = wb.SheetNames.find((s) => s.includes('Template'));
    assert.ok(templateSheetName, `Template sheet exists for ${type}`);
    assert.ok(wb.SheetNames.includes('Instructions'), `Instructions sheet exists for ${type}`);

    // Verify template sheet contains only headers and no example/dummy data rows
    const templateSheet = wb.Sheets[templateSheetName];
    const dataRows = xlsx.utils.sheet_to_json(templateSheet);
    assert.equal(dataRows.length, 0, `Template for ${type} must contain zero example data rows`);
  }
});

// Scenario 2: Templates contain only approved form fields
test('2. Templates contain only approved form fields', async () => {
  const studentBuf = importService.generateTemplateBuffer('student');
  const studentWb = xlsx.read(studentBuf, { type: 'buffer' });
  const studentSheet = studentWb.Sheets[studentWb.SheetNames[0]];
  const studentData = xlsx.utils.sheet_to_json(studentSheet, { header: 1 });
  const studentHeaders = studentData[0];
  assert.ok(studentHeaders.some((h) => h.includes('University ID')));
  assert.ok(studentHeaders.some((h) => h.includes('First Name')));
  assert.ok(studentHeaders.some((h) => h.includes('Department')));
  assert.ok(studentHeaders.some((h) => h.includes('CGPA')));

  const companyBuf = importService.generateTemplateBuffer('company');
  const companyWb = xlsx.read(companyBuf, { type: 'buffer' });
  const companySheet = companyWb.Sheets[companyWb.SheetNames[0]];
  const companyData = xlsx.utils.sheet_to_json(companySheet, { header: 1 });
  const companyHeaders = companyData[0];
  assert.ok(companyHeaders.some((h) => h.includes('Company Name')));
  assert.ok(companyHeaders.some((h) => h.includes('HR / Recruiter Name')));
  assert.ok(companyHeaders.some((h) => h.includes('Year Established')));

  const placementBuf = importService.generateTemplateBuffer('placement');
  const placementWb = xlsx.read(placementBuf, { type: 'buffer' });
  const placementSheet = placementWb.Sheets[placementWb.SheetNames[0]];
  const placementData = xlsx.utils.sheet_to_json(placementSheet, { header: 1 });
  const placementHeaders = placementData[0];
  assert.ok(placementHeaders.some((h) => h.includes('Employee ID')));
  assert.ok(placementHeaders.some((h) => h.includes('Designation')));
  assert.ok(placementHeaders.some((h) => h.includes('Assigned Role')));
});

// Scenario 3: Internal and protected fields are excluded from templates and rejected on import
test('3. Internal and protected fields are excluded from templates and rejected on import', async () => {
  for (const type of ['student', 'company', 'placement']) {
    const buf = importService.generateTemplateBuffer(type);
    const wb = xlsx.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const headers = xlsx.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
    for (const h of headers) {
      const lower = String(h).toLowerCase();
      assert.ok(!lower.includes('_id'), `Template must not include _id in ${type}`);
      assert.ok(!lower.includes('password'), `Template must not include password in ${type}`);
      assert.ok(!lower.includes('token'), `Template must not include token in ${type}`);
    }
  }

  // Attempt to import a spreadsheet containing protected column '_id'
  const maliciousHeaders = ['_id', 'University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const maliciousRows = [{
    '_id': '507f1f77bcf86cd799439011',
    'University ID': 'STU999',
    'First Name': 'Test',
    'Last Name': 'User',
    'Email Address': 'test@example.edu',
    'Mobile Number': '9876543210',
    'Department': activeDept.name,
    'Course / Specialization': activeCourse.name,
    'Current Semester': 6,
    'Passing Year': 2026,
    'CGPA': 8.5
  }];
  const maliciousBuf = makeWorkbookBuffer('Sheet1', maliciousHeaders, maliciousRows);

  await assert.rejects(
    async () => {
      await importService.validateImportRows('student', maliciousBuf);
    },
    (err) => {
      assert.equal(err.code, 'PROTECTED_FIELD_REJECTED');
      return true;
    }
  );
});

// Scenario 4: Required headers missing causes rejection before writes
test('4. Required headers missing causes rejection before writes', async () => {
  // Missing 'Email Address' header
  const incompleteHeaders = ['University ID', 'First Name', 'Last Name', 'Mobile Number'];
  const incompleteRows = [{
    'University ID': 'STU001',
    'First Name': 'Aarav',
    'Last Name': 'Sharma',
    'Mobile Number': '9876543210'
  }];
  const buf = makeWorkbookBuffer('Sheet1', incompleteHeaders, incompleteRows);

  await assert.rejects(
    async () => {
      await importService.validateImportRows('student', buf, { createNew: true, updateExisting: true });
    },
    (err) => {
      assert.equal(err.code, 'MISSING_REQUIRED_HEADERS');
      assert.ok(err.message.includes('missing required column header'));
      return true;
    }
  );

  // Verify zero records were written
  const count = await Student.countDocuments();
  assert.equal(count, 0);
});

// Scenario 5: Missing required row values produce clear validation errors
test('5. Missing required row values produce clear validation errors', async () => {
  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [
    {
      'University ID': '', // Missing required
      'First Name': 'Priya',
      'Last Name': 'Patel',
      'Email Address': 'priya.patel@example.edu',
      'Mobile Number': '9876543210',
      'Department': activeDept.name,
      'Course / Specialization': activeCourse.name,
      'Current Semester': 4,
      'Passing Year': 2026,
      'CGPA': 9.1
    },
    {
      'University ID': 'STU002',
      'First Name': '', // Missing required
      'Last Name': 'Patel',
      'Email Address': 'invalid-email', // Invalid format
      'Mobile Number': '123', // Invalid phone
      'Department': activeDept.name,
      'Course / Specialization': activeCourse.name,
      'Current Semester': 15, // Out of bounds semester
      'Passing Year': 1980, // Out of bounds passing year
      'CGPA': 12.0 // Out of bounds CGPA
    }
  ];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);
  const result = await importService.validateImportRows('student', buf, { createNew: true, updateExisting: true });

  assert.equal(result.invalidCount, 2);
  assert.equal(result.validCount, 0);
  assert.ok(result.preview[0].errors.some((e) => e.includes('University ID is required')));
  assert.ok(result.preview[1].errors.some((e) => e.includes('First Name is required')));
  assert.ok(result.preview[1].errors.some((e) => e.includes('Email format is invalid')));
  assert.ok(result.preview[1].errors.some((e) => e.includes('Mobile number must be exactly 10 digits')));
  assert.ok(result.preview[1].errors.some((e) => e.includes('Current Semester must be an integer between 1 and 12')));
  assert.ok(result.preview[1].errors.some((e) => e.includes('CGPA must be between 0.00 and 10.00')));
});

// Scenario 6: Missing optional columns preserve existing values during updates
test('6. Missing optional columns preserve existing values during updates', async () => {
  // Pre-insert a student with address and backlogs
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);
  const created = await importService.confirmImport('student', [
    {
      universityId: 'STU100',
      firstName: 'OriginalFirst',
      lastName: 'OriginalLast',
      email: 'original@example.edu',
      mobileNumber: '9876543210',
      department: activeDept.name,
      branch: activeCourse.name,
      semester: 4,
      passingYear: 2026,
      cgpa: 8.5,
      backlogs: 2,
      address: 'Original Address 123'
    }
  ], { createNew: true, updateExisting: false });
  assert.equal(created.createdCount, 1);

  // Update without providing address column at all
  const updateHeaders = ['University ID', 'CGPA'];
  const updateRows = [{ 'University ID': 'STU100', 'CGPA': 9.25 }];
  const buf = makeWorkbookBuffer('Sheet1', updateHeaders, updateRows);

  const confirmRes = await importService.confirmImport('student', buf, { createNew: false, updateExisting: true });
  assert.equal(confirmRes.updatedCount, 1);

  const updatedDoc = await Student.findOne({ universityId: 'STU100' });
  assert.equal(updatedDoc.cgpa, 9.25);
  assert.equal(updatedDoc.address, 'Original Address 123', 'Address must be preserved when column is omitted');
  assert.equal(updatedDoc.backlogs, 2, 'Backlogs must be preserved');
  assert.equal(updatedDoc.firstName, 'OriginalFirst');
});

// Scenario 7: Blank optional cells preserve existing values during updates
test('7. Blank optional cells preserve existing values during updates', async () => {
  await importService.confirmImport('student', [
    {
      universityId: 'STU200',
      firstName: 'Sameer',
      lastName: 'Khan',
      email: 'sameer@example.edu',
      mobileNumber: '9876543210',
      department: activeDept.name,
      branch: activeCourse.name,
      semester: 6,
      passingYear: 2026,
      cgpa: 8.0,
      backlogs: 1,
      address: 'Hostel 5, Room 202'
    }
  ], { createNew: true });

  // Update providing address header, but with blank cell
  const updateHeaders = ['University ID', 'Current Semester', 'Residential / Campus Address'];
  const updateRows = [
    {
      'University ID': 'STU200',
      'Current Semester': 7,
      'Residential / Campus Address': '' // Blank cell should preserve
    }
  ];
  const buf = makeWorkbookBuffer('Sheet1', updateHeaders, updateRows);

  await importService.confirmImport('student', buf, { createNew: false, updateExisting: true });

  const student = await Student.findOne({ universityId: 'STU200' });
  assert.equal(student.semester, 7);
  assert.equal(student.address, 'Hostel 5, Room 202', 'Blank cell must preserve existing address');

  // Now explicitly clear using [CLEAR]
  const clearRows = [
    {
      'University ID': 'STU200',
      'Residential / Campus Address': '[CLEAR]'
    }
  ];
  const clearBuf = makeWorkbookBuffer('Sheet1', updateHeaders, clearRows);
  await importService.confirmImport('student', clearBuf, { createNew: false, updateExisting: true });

  const clearedStudent = await Student.findOne({ universityId: 'STU200' });
  assert.equal(clearedStudent.address, '', 'Explicit [CLEAR] must clear the optional field');
});

// Scenario 8: Optional fields behave correctly during creation
test('8. Optional fields behave correctly during creation', async () => {
  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [{
    'University ID': 'STU300',
    'First Name': 'Kavita',
    'Last Name': 'Rao',
    'Email Address': 'kavita.rao@example.edu',
    'Mobile Number': '9876543210',
    'Department': activeDept.name,
    'Course / Specialization': activeCourse.name,
    'Current Semester': 2,
    'Passing Year': 2028,
    'CGPA': 9.5
    // backlogs and address omitted
  }];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);
  await importService.confirmImport('student', buf, { createNew: true, updateExisting: false });

  const doc = await Student.findOne({ universityId: 'STU300' });
  assert.ok(doc);
  assert.equal(doc.backlogs, 0, 'Backlogs defaults to 0');
  assert.equal(doc.address, '', 'Address defaults to empty string');
});

// Scenario 9: Extra columns are ignored and reported
test('9. Extra columns are ignored and reported', async () => {
  const headers = [
    'University ID',
    'First Name',
    'Last Name',
    'Email Address',
    'Mobile Number',
    'Department',
    'Course / Specialization',
    'Current Semester',
    'Passing Year',
    'CGPA',
    'Extra Hobby Column',
    'Favorite Food'
  ];
  const rows = [{
    'University ID': 'STU400',
    'First Name': 'Vikram',
    'Last Name': 'Singh',
    'Email Address': 'vikram.singh@example.edu',
    'Mobile Number': '9876543210',
    'Department': activeDept.name,
    'Course / Specialization': activeCourse.name,
    'Current Semester': 8,
    'Passing Year': 2026,
    'CGPA': 8.2,
    'Extra Hobby Column': 'Chess',
    'Favorite Food': 'Pizza'
  }];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);
  const preview = await importService.validateImportRows('student', buf);

  assert.equal(preview.validCount, 1);
  assert.ok(preview.ignoredColumns.includes('Extra Hobby Column'));
  assert.ok(preview.ignoredColumns.includes('Favorite Food'));

  const confirmRes = await importService.confirmImport('student', buf);
  assert.equal(confirmRes.createdCount, 1);
  assert.ok(confirmRes.ignoredColumns.includes('Extra Hobby Column'));

  const doc = await Student.findOne({ universityId: 'STU400' }).lean();
  assert.equal(doc['Extra Hobby Column'], undefined, 'Extra column must not be mass-assigned to doc');
});

// Scenario 10: Matching Student university ID updates the existing record
test('10. Matching Student university ID updates the existing record', async () => {
  await importService.confirmImport('student', [{
    universityId: 'STU500',
    firstName: 'Ananya',
    lastName: 'Sen',
    email: 'ananya@example.edu',
    mobileNumber: '9876543210',
    department: activeDept.name,
    branch: activeCourse.name,
    semester: 4,
    passingYear: 2026,
    cgpa: 7.8
  }], { createNew: true });

  const buf = makeWorkbookBuffer('Sheet1', ['University ID', 'CGPA', 'Current Semester'], [
    { 'University ID': 'STU500', 'CGPA': 8.9, 'Current Semester': 5 }
  ]);
  const res = await importService.confirmImport('student', buf, { createNew: false, updateExisting: true });

  assert.equal(res.updatedCount, 1);
  const updated = await Student.findOne({ universityId: 'STU500' });
  assert.equal(updated.cgpa, 8.9);
  assert.equal(updated.semester, 5);
  assert.equal(updated.firstName, 'Ananya');
});

// Scenario 11: Unmatched Student creates a record only when enabled and valid
test('11. Unmatched Student creates a record only when enabled and valid', async () => {
  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [{
    'University ID': 'STU600',
    'First Name': 'Deepak',
    'Last Name': 'Joshi',
    'Email Address': 'deepak@example.edu',
    'Mobile Number': '9876543210',
    'Department': activeDept.name,
    'Course / Specialization': activeCourse.name,
    'Current Semester': 6,
    'Passing Year': 2026,
    'CGPA': 8.1
  }];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);

  // When createNew is false: must NOT create
  const previewNoCreate = await importService.validateImportRows('student', buf, { createNew: false, updateExisting: true });
  assert.equal(previewNoCreate.createCount, 0);
  assert.equal(previewNoCreate.skipCount, 1);

  const confirmNoCreate = await importService.confirmImport('student', buf, { createNew: false, updateExisting: true });
  assert.equal(confirmNoCreate.createdCount, 0);
  assert.equal(await Student.countDocuments({ universityId: 'STU600' }), 0);

  // When createNew is true: creates
  const confirmCreate = await importService.confirmImport('student', buf, { createNew: true, updateExisting: true });
  assert.equal(confirmCreate.createdCount, 1);
  assert.equal(await Student.countDocuments({ universityId: 'STU600' }), 1);
});

// Scenario 12: Matching Company business ID updates the existing company
test('12. Matching Company business ID updates the existing company', async () => {
  // Create company
  const created = await importService.confirmImport('company', [{
    companyName: 'Apex Cloud Solutions',
    industryType: 'Cloud Technology',
    hrRecruiterName: 'Maya Roy',
    email: 'maya@apexcloud.com',
    yearEstablished: 2018,
    designation: 'Staff Recruiter',
    mobileNumber: '9876543210',
    officeAddress: 'Apex Tower, Sector 3',
    description: 'Cloud consulting'
  }], { createNew: true });
  assert.equal(created.createdCount, 1);

  const existingCompany = await Company.findOne({ companyName: 'Apex Cloud Solutions' });
  assert.ok(existingCompany.companyId.startsWith('COMP-'));

  // Update using companyId
  const updateBuf = makeWorkbookBuffer('Sheet1', ['Company ID', 'Designation', 'Mobile Number'], [{
    'Company ID': existingCompany.companyId,
    'Designation': 'Head of Talent',
    'Mobile Number': '9123456780'
  }]);

  const updateRes = await importService.confirmImport('company', updateBuf, { createNew: false, updateExisting: true });
  assert.equal(updateRes.updatedCount, 1);

  const reloaded = await Company.findOne({ companyId: existingCompany.companyId });
  assert.equal(reloaded.designation, 'Head of Talent');
  assert.equal(reloaded.mobileNumber, '9123456780');
  assert.equal(reloaded.companyName, 'Apex Cloud Solutions');
});

// Scenario 13: New companies receive a unique sequential business identifier
test('13. New companies receive a unique sequential business identifier', async () => {
  const rows = [
    {
      companyName: 'Company Alpha',
      industryType: 'Finance',
      hrRecruiterName: 'Recruiter A',
      email: 'recruiter.a@alpha.com',
      yearEstablished: 2010,
      designation: 'HR',
      mobileNumber: '9876543210',
      officeAddress: 'Alpha Street',
      description: 'Fintech leader'
    },
    {
      companyName: 'Company Beta',
      industryType: 'Automotive',
      hrRecruiterName: 'Recruiter B',
      email: 'recruiter.b@beta.com',
      yearEstablished: 2015,
      designation: 'HR',
      mobileNumber: '9876543210',
      officeAddress: 'Beta Park',
      description: 'Electric mobility'
    }
  ];

  await importService.confirmImport('company', rows, { createNew: true });

  const c1 = await Company.findOne({ companyName: 'Company Alpha' });
  const c2 = await Company.findOne({ companyName: 'Company Beta' });

  assert.ok(/^COMP-\d{4}$/.test(c1.companyId));
  assert.ok(/^COMP-\d{4}$/.test(c2.companyId));
  assert.notEqual(c1.companyId, c2.companyId);
});

// Scenario 14: Existing company business identifiers cannot be overwritten
test('14. Existing company business identifiers cannot be overwritten', async () => {
  await importService.confirmImport('company', [{
    companyName: 'Secure Tech Corp',
    industryType: 'Security',
    hrRecruiterName: 'Sarah Connor',
    email: 'sarah@securetech.com',
    yearEstablished: 2014,
    designation: 'Recruiter',
    mobileNumber: '9876543210',
    officeAddress: 'Cyber Road',
    description: 'Cybersecurity defense'
  }], { createNew: true });

  const comp = await Company.findOne({ companyName: 'Secure Tech Corp' });
  const origCompanyId = comp.companyId;

  // Even if workbook is matched, companyId remains immutable
  const updateBuf = makeWorkbookBuffer('Sheet1', ['Company ID', 'Office Address'], [{
    'Company ID': origCompanyId,
    'Office Address': 'New Cyber Road 2'
  }]);

  await importService.confirmImport('company', updateBuf, { updateExisting: true });

  const afterUpdate = await Company.findById(comp._id);
  assert.equal(afterUpdate.companyId, origCompanyId, 'companyId must never change on update');
  assert.equal(afterUpdate.officeAddress, 'New Cyber Road 2');
});

// Scenario 15: Matching Placement Officer employee ID updates the existing record
test('15. Matching Placement Officer employee ID updates the existing record', async () => {
  await importService.confirmImport('placement', [{
    employeeId: 'EMP-PL-201',
    firstName: 'Rohan',
    lastName: 'Bose',
    email: 'rohan.bose@university.edu',
    mobileNumber: '9876543210',
    designation: 'Placement Coordinator',
    role: ROLE_IDS.PLACEMENT_COORDINATOR,
    department: activeDept.name
  }], { createNew: true });

  const updateBuf = makeWorkbookBuffer('Sheet1', ['Employee ID', 'Designation', 'Mobile Number'], [{
    'Employee ID': 'EMP-PL-201',
    'Designation': 'Senior Coordinator',
    'Mobile Number': '9812345678'
  }]);

  const res = await importService.confirmImport('placement', updateBuf, { updateExisting: true });
  assert.equal(res.updatedCount, 1);

  const officer = await PlacementOfficer.findOne({ employeeId: 'EMP-PL-201' });
  assert.equal(officer.designation, 'Senior Coordinator');
  assert.equal(officer.mobileNumber, '9812345678');
  assert.equal(officer.firstName, 'Rohan');
});

// Scenario 16: Duplicate identifiers within the workbook are detected
test('16. Duplicate identifiers within the workbook are detected', async () => {
  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [
    {
      'University ID': 'STU700',
      'First Name': 'First1',
      'Last Name': 'Last1',
      'Email Address': 'user1@example.edu',
      'Mobile Number': '9876543210',
      'Department': activeDept.name,
      'Course / Specialization': activeCourse.name,
      'Current Semester': 6,
      'Passing Year': 2026,
      'CGPA': 8.0
    },
    {
      'University ID': 'STU700', // DUPLICATE ID IN FILE
      'First Name': 'First2',
      'Last Name': 'Last2',
      'Email Address': 'user2@example.edu',
      'Mobile Number': '9876543210',
      'Department': activeDept.name,
      'Course / Specialization': activeCourse.name,
      'Current Semester': 6,
      'Passing Year': 2026,
      'CGPA': 8.5
    }
  ];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);
  const preview = await importService.validateImportRows('student', buf, { createNew: true });

  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.preview[1].status, 'DUPLICATE');
  assert.ok(preview.preview[1].errors.some((e) => e.includes('Duplicate University ID')));
});

// Scenario 17: Invalid department/course references are rejected
test('17. Invalid department/course references are rejected', async () => {
  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [{
    'University ID': 'STU800',
    'First Name': 'Sanjay',
    'Last Name': 'Dutt',
    'Email Address': 'sanjay@example.edu',
    'Mobile Number': '9876543210',
    'Department': 'NonExistent Department XYZ',
    'Course / Specialization': activeCourse.name,
    'Current Semester': 4,
    'Passing Year': 2026,
    'CGPA': 7.5
  }];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);
  const preview = await importService.validateImportRows('student', buf, { createNew: true });

  assert.equal(preview.invalidCount, 1);
  assert.ok(preview.preview[0].errors.some((e) => e.includes('does not exist or is inactive')));
});

// Scenario 18: User/student and company/recruiter relationships remain consistent
test('18. User/student and company/recruiter relationships remain consistent', async () => {
  // Student
  await importService.confirmImport('student', [{
    universityId: 'STU900',
    firstName: 'Naveen',
    lastName: 'Kumar',
    email: 'naveen@example.edu',
    mobileNumber: '9876543210',
    department: activeDept.name,
    branch: activeCourse.name,
    semester: 8,
    passingYear: 2026,
    cgpa: 8.4
  }], { createNew: true });

  const student = await Student.findOne({ universityId: 'STU900' });
  const studentUser = await User.findById(student.userId);
  assert.ok(studentUser);
  assert.equal(studentUser.email, 'naveen@example.edu');
  assert.equal(studentUser.universityId, 'STU900');
  assert.equal(studentUser.roleId, ROLE_IDS.STUDENT);

  // Company
  await importService.confirmImport('company', [{
    companyName: 'Unified Dynamics Inc',
    industryType: 'Robotics',
    hrRecruiterName: 'Elena Rostova',
    email: 'elena@unifieddynamics.com',
    yearEstablished: 2016,
    designation: 'Recruiter',
    mobileNumber: '9876543210',
    officeAddress: 'Industrial Zone 4',
    description: 'Robotic automation'
  }], { createNew: true });

  const comp = await Company.findOne({ companyName: 'Unified Dynamics Inc' });
  const recruiterUser = await User.findById(comp.primaryRecruiterId);
  assert.ok(recruiterUser);
  assert.equal(String(recruiterUser.companyId), String(comp._id));
  assert.equal(String(comp.userId), String(recruiterUser._id), 'Dual sync userId matches');
  assert.equal(String(comp.primaryRecruiterId), String(recruiterUser._id), 'Dual sync primaryRecruiterId matches');
});

// Scenario 19: Preview performs zero database writes
test('19. Preview performs zero database writes', async () => {
  const initialStudentCount = await Student.countDocuments();
  const initialCompanyCount = await Company.countDocuments();
  const initialOfficerCount = await PlacementOfficer.countDocuments();
  const initialUserCount = await User.countDocuments();

  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [{
    'University ID': 'STU_ZERO_WRITES',
    'First Name': 'Zero',
    'Last Name': 'Writes',
    'Email Address': 'zero.writes@example.edu',
    'Mobile Number': '9876543210',
    'Department': activeDept.name,
    'Course / Specialization': activeCourse.name,
    'Current Semester': 1,
    'Passing Year': 2028,
    'CGPA': 9.0
  }];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);

  const preview = await importService.validateImportRows('student', buf, { createNew: true });
  assert.equal(preview.validCount, 1);

  assert.equal(await Student.countDocuments(), initialStudentCount);
  assert.equal(await Company.countDocuments(), initialCompanyCount);
  assert.equal(await PlacementOfficer.countDocuments(), initialOfficerCount);
  assert.equal(await User.countDocuments(), initialUserCount);
});

// Scenario 20: Stale previews are revalidated before confirmation
test('20. Stale previews are revalidated before confirmation', async () => {
  const headers = ['University ID', 'First Name', 'Last Name', 'Email Address', 'Mobile Number', 'Department', 'Course / Specialization', 'Current Semester', 'Passing Year', 'CGPA'];
  const rows = [{
    'University ID': 'STU_STALE_TEST',
    'First Name': 'Stale',
    'Last Name': 'Test',
    'Email Address': 'stale@example.edu',
    'Mobile Number': '9876543210',
    'Department': activeDept.name,
    'Course / Specialization': activeCourse.name,
    'Current Semester': 4,
    'Passing Year': 2026,
    'CGPA': 8.0
  }];
  const buf = makeWorkbookBuffer('Sheet1', headers, rows);

  // Initial preview: would CREATE
  const preview1 = await importService.validateImportRows('student', buf, { createNew: true, updateExisting: false });
  assert.equal(preview1.createCount, 1);

  // Before confirmation, a record with this ID is created concurrently
  await importService.confirmImport('student', [{
    universityId: 'STU_STALE_TEST',
    firstName: 'Existing',
    lastName: 'User',
    email: 'concurrent@example.edu',
    mobileNumber: '9876543210',
    department: activeDept.name,
    branch: activeCourse.name,
    semester: 4,
    passingYear: 2026,
    cgpa: 8.0
  }], { createNew: true });

  // Confirmation with createNew: true, updateExisting: false revalidates and skips instead of duplicate insertion!
  const confirmResult = await importService.confirmImport('student', buf, { createNew: true, updateExisting: false });
  assert.equal(confirmResult.createdCount, 0);
  assert.equal(confirmResult.skippedCount, 1);
});

// Scenario 21: Failed multi-document operations do not leave orphaned records
test('21. Failed multi-document operations do not leave orphaned records', async () => {
  const initialUsers = await User.countDocuments();
  const initialStudents = await Student.countDocuments();

  // Inject failure by mocking Student.create to throw
  const origCreate = Student.create;
  Student.create = async () => {
    throw new Error('Simulated database write crash during student record persistence');
  };

  try {
    await importService.confirmImport('student', [{
      universityId: 'STU_FAIL_ROLLBACK',
      firstName: 'Fail',
      lastName: 'User',
      email: 'fail.rollback@example.edu',
      mobileNumber: '9876543210',
      department: activeDept.name,
      branch: activeCourse.name,
      semester: 2,
      passingYear: 2028,
      cgpa: 8.0
    }], { createNew: true });
  } finally {
    Student.create = origCreate;
  }

  // Ensure no orphaned User was left behind
  assert.equal(await User.countDocuments(), initialUsers);
  assert.equal(await Student.countDocuments(), initialStudents);
});

// Scenario 22: Export All includes all authorized matching records across pages
test('22. Export All includes all authorized matching records across pages', async () => {
  // Insert 3 students
  for (let i = 1; i <= 3; i++) {
    await importService.confirmImport('student', [{
      universityId: `STU_EXP_${i}`,
      firstName: `ExportFirst${i}`,
      lastName: `ExportLast${i}`,
      email: `export${i}@example.edu`,
      mobileNumber: '9876543210',
      department: activeDept.name,
      branch: activeCourse.name,
      semester: 6,
      passingYear: 2026,
      cgpa: 8.5
    }], { createNew: true });
  }

  const exportBuf = await importService.exportDataToExcel('student', { filtered: false });
  assert.ok(Buffer.isBuffer(exportBuf));

  const wb = xlsx.read(exportBuf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  assert.equal(rows.length, 3);
  assert.ok(rows.some((r) => r['University ID'] === 'STU_EXP_1'));
  assert.ok(rows.some((r) => r['University ID'] === 'STU_EXP_2'));
  assert.ok(rows.some((r) => r['University ID'] === 'STU_EXP_3'));
});

// Scenario 23: Export Filtered respects active filters across pages
test('23. Export Filtered respects active filters across pages', async () => {
  await importService.confirmImport('company', [
    {
      companyName: 'Alpha Tech Corp',
      industryType: 'Software',
      hrRecruiterName: 'Alpha HR',
      email: 'alpha@tech.com',
      yearEstablished: 2012,
      designation: 'Recruiter',
      mobileNumber: '9876543210',
      officeAddress: 'City Alpha',
      description: 'Alpha IT'
    },
    {
      companyName: 'Beta Biotech Ltd',
      industryType: 'Biomedical',
      hrRecruiterName: 'Beta HR',
      email: 'beta@biotech.com',
      yearEstablished: 2015,
      designation: 'Recruiter',
      mobileNumber: '9876543210',
      officeAddress: 'City Beta',
      description: 'Bio research'
    }
  ], { createNew: true });

  const exportFilteredBuf = await importService.exportDataToExcel('company', { search: 'Biotech', filtered: true });
  const wb = xlsx.read(exportFilteredBuf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Company Name'], 'Beta Biotech Ltd');
});

// Scenario 24: Exports exclude sensitive fields and protect against formula injection
test('24. Exports exclude sensitive fields and protect against formula injection', async () => {
  await importService.confirmImport('student', [{
    universityId: 'STU_FORMULA',
    firstName: '=CMD|()', // Potential formula payload
    lastName: '+2+2',
    email: 'formula@example.edu',
    mobileNumber: '9876543210',
    department: activeDept.name,
    branch: activeCourse.name,
    semester: 4,
    passingYear: 2026,
    cgpa: 8.0,
    address: '@sum(A1:A5)'
  }], { createNew: true });

  const exportBuf = await importService.exportDataToExcel('student', { filtered: false });
  const wb = xlsx.read(exportBuf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawMatrix = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  const headers = rawMatrix[0];
  const rowCells = rawMatrix[1];

  // Sensitive field check
  for (const h of headers) {
    const l = String(h).toLowerCase();
    assert.ok(!l.includes('password'), 'No password in export');
    assert.ok(!l.includes('_id'), 'No _id in export');
  }

  // Formula escape verification (prepended with ')
  const fNameVal = rowCells[headers.indexOf('First Name')];
  const lNameVal = rowCells[headers.indexOf('Last Name')];
  const addrVal = rowCells[headers.indexOf('Residential / Campus Address')];

  assert.ok(String(fNameVal).startsWith("'="), `First Name formula trigger must be escaped: ${fNameVal}`);
  assert.ok(String(lNameVal).startsWith("'+"), `Last Name formula trigger must be escaped: ${lNameVal}`);
  assert.ok(String(addrVal).startsWith("'@"), `Address formula trigger must be escaped: ${addrVal}`);
});

// Scenario 25: Unauthorized users cannot import, update, or export restricted records
test('25. Unauthorized users cannot import, update, or export restricted records', async () => {
  const studentUser = await createAuthenticatedSession(ROLE_IDS.STUDENT, 'STUDENT');

  // Student cannot access import validate endpoint
  const importRes = await request(app)
    .post('/api/imports/validate/student')
    .set('Authorization', `Bearer ${studentUser.token}`)
    .send({ rows: [] });
  assert.equal(importRes.status, 403, 'Student is forbidden from importing');

  // Student cannot export company records
  const exportRes = await request(app)
    .get('/api/imports/export/company')
    .set('Authorization', `Bearer ${studentUser.token}`);
  assert.equal(exportRes.status, 403, 'Student is forbidden from exporting companies');
});

// Scenario 26: Malformed files and invalid cell values are handled safely
test('26. Malformed files and invalid cell values are handled safely', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // Send invalid buffer
  const corruptedBuf = Buffer.from('this is not an excel file');
  const res = await request(app)
    .post('/api/imports/validate/student')
    .set('Authorization', `Bearer ${admin.token}`)
    .attach('file', corruptedBuf, 'corrupt.xlsx');

  assert.ok(res.status >= 400);
});

// Scenario 27: Import and export work correctly with real .xlsx files
test('27. Import and export work correctly with real .xlsx files', async () => {
  const admin = await createAuthenticatedSession(ROLE_IDS.SUPER_ADMIN);

  // 1. Download official template
  const templateRes = await request(app)
    .get('/api/imports/templates/student')
    .set('Authorization', `Bearer ${admin.token}`);
  assert.equal(templateRes.status, 200);
  assert.equal(templateRes.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  // 2. Build workbook matching the template
  const headers = [
    'University ID *',
    'First Name *',
    'Last Name *',
    'Email Address *',
    'Mobile Number *',
    'Department *',
    'Course / Specialization *',
    'Current Semester *',
    'Passing Year *',
    'CGPA *',
    'Active Backlogs',
    'Residential / Campus Address'
  ];
  const rowData = [{
    'University ID *': 'STU_E2E_01',
    'First Name *': 'Aanya',
    'Last Name *': 'Gupta',
    'Email Address *': 'aanya.gupta@example.edu',
    'Mobile Number *': '9876543210',
    'Department *': activeDept.name,
    'Course / Specialization *': activeCourse.name,
    'Current Semester *': 6,
    'Passing Year *': 2026,
    'CGPA *': 9.2,
    'Active Backlogs': 0,
    'Residential / Campus Address': 'Campus Hostel 1'
  }];
  const uploadBuf = makeWorkbookBuffer('Template', headers, rowData);

  // 3. Validate
  const valRes = await request(app)
    .post('/api/imports/validate/student')
    .set('Authorization', `Bearer ${admin.token}`)
    .attach('file', uploadBuf, 'students.xlsx');
  assert.equal(valRes.status, 200);
  assert.equal(valRes.body.data.validCount, 1);
  assert.equal(valRes.body.data.createCount, 1);

  // 4. Confirm
  const confirmRes = await request(app)
    .post('/api/imports/confirm/student')
    .set('Authorization', `Bearer ${admin.token}`)
    .attach('file', uploadBuf, 'students.xlsx');
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.data.createdCount, 1);

  // 5. Export
  const exportRes = await request(app)
    .get('/api/imports/export/student')
    .set('Authorization', `Bearer ${admin.token}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  assert.equal(exportRes.status, 200);
  const exportedWb = xlsx.read(exportRes.body, { type: 'buffer' });
  const exportedRows = xlsx.utils.sheet_to_json(exportedWb.Sheets[exportedWb.SheetNames[0]]);
  assert.equal(exportedRows.length, 1);
  assert.equal(exportedRows[0]['University ID'], 'STU_E2E_01');
  assert.equal(exportedRows[0]['First Name'], 'Aanya');
});
