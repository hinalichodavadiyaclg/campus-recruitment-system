import crypto from 'node:crypto';
import * as xlsx from 'xlsx';
import { Company } from '../models/company.model.js';
import { Student } from '../models/student.model.js';
import { User } from '../models/user.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TEMPLATE_COLUMNS = {
  student: [
    'universityId',
    'firstName',
    'lastName',
    'email',
    'mobileNumber',
    'address',
    'branch',
    'department',
    'semester',
    'cgpa',
    'backlogs',
    'passingYear'
  ],
  company: [
    'companyName',
    'industryType',
    'description',
    'website',
    'yearEstablished',
    'hrRecruiterName',
    'designation',
    'email',
    'mobileNumber',
    'officeAddress'
  ],
  placement: [
    'employeeId',
    'firstName',
    'lastName',
    'email',
    'role'
  ]
};

const SAMPLE_ROWS = {
  student: [
    {
      universityId: 'STU2026001',
      firstName: 'Aarav',
      lastName: 'Sharma',
      email: 'aarav.sharma@university.edu',
      mobileNumber: '+91 9876543210',
      address: 'Hostel 4, Campus',
      branch: 'Computer Science',
      department: 'Engineering',
      semester: 8,
      cgpa: 8.75,
      backlogs: 0,
      passingYear: 2026
    }
  ],
  company: [
    {
      companyName: 'Acme Technologies Inc.',
      industryType: 'Information Technology',
      description: 'Enterprise Cloud Solutions Provider',
      website: 'https://acme.example.com',
      yearEstablished: 2012,
      hrRecruiterName: 'Priya Patel',
      designation: 'Lead Technical Recruiter',
      email: 'priya.patel@acme.example.com',
      mobileNumber: '+91 9123456780',
      officeAddress: 'Tech Park, Sector 5, City'
    }
  ],
  placement: [
    {
      employeeId: 'EMP-PL-101',
      firstName: 'Rajesh',
      lastName: 'Verma',
      email: 'rajesh.verma@university.edu',
      role: 'ROLE_PLACEMENT_COORDINATOR'
    }
  ]
};

export function generateTemplateBuffer(type) {
  const columns = TEMPLATE_COLUMNS[type];
  const samples = SAMPLE_ROWS[type];
  if (!columns || !samples) throw new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown import type: ${type}`);

  const worksheet = xlsx.utils.json_to_sheet(samples, { header: columns });
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, `${type.toUpperCase()} Template`);
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function parseFileToRows(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(worksheet, { defval: '' });
}

export async function validateImportRows(type, rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new AppError(400, 'EMPTY_IMPORT_DATA', 'No data rows found in the uploaded file.');
  }

  const results = [];
  const seenEmails = new Set();
  const seenIds = new Set();
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNumber = i + 2; // Accounting for Excel 1-based index + Header row
    const errors = [];
    let isDuplicate = false;

    // Check if entire row is empty
    const values = Object.values(row).map((v) => String(v).trim()).filter(Boolean);
    if (values.length === 0) continue; // Skip completely empty row

    if (type === 'student') {
      const universityId = String(row.universityId || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const firstName = String(row.firstName || '').trim();
      const lastName = String(row.lastName || '').trim();
      const branch = String(row.branch || '').trim();
      const department = String(row.department || '').trim();
      const mobileNumber = String(row.mobileNumber || '').trim();
      const semester = Number(row.semester);
      const cgpa = Number(row.cgpa);
      const backlogs = row.backlogs !== undefined && row.backlogs !== '' ? Number(row.backlogs) : 0;
      const passingYear = Number(row.passingYear);

      if (!universityId) errors.push('universityId is required.');
      if (!email) errors.push('email is required.');
      else if (!EMAIL_REGEX.test(email)) errors.push('email format is invalid.');
      if (!firstName) errors.push('firstName is required.');
      if (!lastName) errors.push('lastName is required.');
      if (!branch) errors.push('branch is required.');
      if (!department) errors.push('department is required.');
      if (!mobileNumber) errors.push('mobileNumber is required.');
      if (Number.isNaN(semester) || semester < 1 || semester > 12) errors.push('semester must be an integer between 1 and 12.');
      if (Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10) errors.push('cgpa must be a number between 0.0 and 10.0.');
      if (Number.isNaN(backlogs) || backlogs < 0) errors.push('backlogs must be 0 or greater.');
      if (Number.isNaN(passingYear) || passingYear < 1990 || passingYear > 2100) errors.push('passingYear must be between 1990 and 2100.');

      // Check duplicate in current batch
      if (universityId && seenIds.has(universityId)) {
        isDuplicate = true;
        errors.push(`Duplicate universityId '${universityId}' in this file.`);
      } else if (universityId) {
        seenIds.add(universityId);
      }

      if (email && seenEmails.has(email)) {
        isDuplicate = true;
        errors.push(`Duplicate email '${email}' in this file.`);
      } else if (email) {
        seenEmails.add(email);
      }

      // Check duplicate in DB
      if (universityId && !isDuplicate) {
        const existsId = (await Student.exists({ universityId })) || (await User.exists({ universityId }));
        if (existsId) {
          isDuplicate = true;
          errors.push(`universityId '${universityId}' already exists in database.`);
        }
      }
      if (email && !isDuplicate) {
        const existsEmail = (await Student.exists({ email })) || (await User.exists({ email }));
        if (existsEmail) {
          isDuplicate = true;
          errors.push(`email '${email}' already exists in database.`);
        }
      }
    } else if (type === 'company') {
      const companyName = String(row.companyName || '').trim();
      const industryType = String(row.industryType || '').trim();
      const hrRecruiterName = String(row.hrRecruiterName || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const yearEstablished = row.yearEstablished ? Number(row.yearEstablished) : undefined;

      if (!companyName) errors.push('companyName is required.');
      if (!industryType) errors.push('industryType is required.');
      if (!hrRecruiterName) errors.push('hrRecruiterName is required.');
      if (!email) errors.push('email is required.');
      else if (!EMAIL_REGEX.test(email)) errors.push('email format is invalid.');
      if (yearEstablished !== undefined && (Number.isNaN(yearEstablished) || yearEstablished < 1800 || yearEstablished > 2100)) {
        errors.push('yearEstablished must be between 1800 and 2100.');
      }

      if (companyName && seenIds.has(companyName.toLowerCase())) {
        isDuplicate = true;
        errors.push(`Duplicate companyName '${companyName}' in this file.`);
      } else if (companyName) {
        seenIds.add(companyName.toLowerCase());
      }

      if (email && seenEmails.has(email)) {
        isDuplicate = true;
        errors.push(`Duplicate email '${email}' in this file.`);
      } else if (email) {
        seenEmails.add(email);
      }

      if (companyName && !isDuplicate) {
        const existsComp = await Company.exists({ companyName: new RegExp(`^${companyName}$`, 'i') });
        if (existsComp) {
          isDuplicate = true;
          errors.push(`companyName '${companyName}' already exists in database.`);
        }
      }
      if (email && !isDuplicate) {
        const existsEmail = (await Company.exists({ email })) || (await User.exists({ email }));
        if (existsEmail) {
          isDuplicate = true;
          errors.push(`email '${email}' already exists in database.`);
        }
      }
    } else if (type === 'placement') {
      const employeeId = String(row.employeeId || '').trim();
      const firstName = String(row.firstName || '').trim();
      const lastName = String(row.lastName || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const role = String(row.role || '').trim();

      if (!employeeId) errors.push('employeeId is required.');
      if (!firstName) errors.push('firstName is required.');
      if (!lastName) errors.push('lastName is required.');
      if (!email) errors.push('email is required.');
      else if (!EMAIL_REGEX.test(email)) errors.push('email format is invalid.');
      if (!role) errors.push('role is required.');
      else if (![ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR].includes(role)) {
        errors.push(`role must be either '${ROLE_IDS.PLACEMENT_HEAD}' or '${ROLE_IDS.PLACEMENT_COORDINATOR}'.`);
      }

      if (employeeId && seenIds.has(employeeId)) {
        isDuplicate = true;
        errors.push(`Duplicate employeeId '${employeeId}' in this file.`);
      } else if (employeeId) {
        seenIds.add(employeeId);
      }

      if (email && seenEmails.has(email)) {
        isDuplicate = true;
        errors.push(`Duplicate email '${email}' in this file.`);
      } else if (email) {
        seenEmails.add(email);
      }

      if (employeeId && !isDuplicate) {
        const existsEmp = await User.exists({ employeeId });
        if (existsEmp) {
          isDuplicate = true;
          errors.push(`employeeId '${employeeId}' already exists in database.`);
        }
      }
      if (email && !isDuplicate) {
        const existsEmail = await User.exists({ email });
        if (existsEmail) {
          isDuplicate = true;
          errors.push(`email '${email}' already exists in database.`);
        }
      }
    }

    const status = errors.length === 0 ? 'VALID' : isDuplicate ? 'DUPLICATE' : 'INVALID';
    if (status === 'VALID') validCount++;
    else if (status === 'DUPLICATE') duplicateCount++;
    else invalidCount++;

    results.push({
      rowNumber,
      data: row,
      status,
      errors
    });
  }

  return {
    totalRows: results.length,
    validCount,
    invalidCount,
    duplicateCount,
    preview: results
  };
}

export async function confirmImport(type, rows) {
  const validation = await validateImportRows(type, rows);
  const validRows = validation.preview.filter((item) => item.status === 'VALID').map((item) => item.data);

  let importedCount = 0;
  let skippedCount = validation.invalidCount + validation.duplicateCount;
  const createdRecords = [];

  for (const row of validRows) {
    try {
      if (type === 'student') {
        const email = String(row.email).trim().toLowerCase();
        const universityId = String(row.universityId).trim();
        const rawPassword = `Student@${crypto.randomBytes(4).toString('hex')}!`;
        const passwordHash = await hashPassword(rawPassword);

        // Create User account
        const user = await User.create({
          email,
          passwordHash,
          userType: 'STUDENT',
          roleId: ROLE_IDS.STUDENT,
          universityId,
          accountStatus: 'ACTIVE',
          isEmailVerified: true
        });

        // Create Student portal record
        const student = await Student.create({
          universityId,
          firstName: String(row.firstName).trim(),
          lastName: String(row.lastName).trim(),
          email,
          mobileNumber: String(row.mobileNumber).trim(),
          address: row.address ? String(row.address).trim() : '',
          branch: String(row.branch).trim(),
          department: String(row.department).trim(),
          semester: Number(row.semester),
          cgpa: Number(row.cgpa),
          backlogs: row.backlogs !== undefined && row.backlogs !== '' ? Number(row.backlogs) : 0,
          passingYear: Number(row.passingYear),
          userId: user._id
        });

        createdRecords.push(student);
        importedCount++;
      } else if (type === 'company') {
        const email = String(row.email).trim().toLowerCase();
        const companyName = String(row.companyName).trim();

        // Create Company record
        const company = await Company.create({
          companyName,
          industryType: String(row.industryType).trim(),
          description: row.description ? String(row.description).trim() : '',
          website: row.website ? String(row.website).trim() : '',
          yearEstablished: row.yearEstablished ? Number(row.yearEstablished) : undefined,
          hrRecruiterName: String(row.hrRecruiterName).trim(),
          designation: row.designation ? String(row.designation).trim() : '',
          email,
          mobileNumber: row.mobileNumber ? String(row.mobileNumber).trim() : '',
          officeAddress: row.officeAddress ? String(row.officeAddress).trim() : '',
          verificationStatus: 'VERIFIED'
        });

        // Create Recruiter user account
        const rawPassword = `Company@${crypto.randomBytes(4).toString('hex')}!`;
        const passwordHash = await hashPassword(rawPassword);
        await User.create({
          email,
          passwordHash,
          userType: 'COMPANY',
          roleId: ROLE_IDS.COMPANY,
          companyId: company._id,
          accountStatus: 'ACTIVE',
          isEmailVerified: true
        });

        createdRecords.push(company);
        importedCount++;
      } else if (type === 'placement') {
        const email = String(row.email).trim().toLowerCase();
        const employeeId = String(row.employeeId).trim();
        const rawPassword = `Placement@${crypto.randomBytes(4).toString('hex')}!`;
        const passwordHash = await hashPassword(rawPassword);

        const user = await User.create({
          email,
          passwordHash,
          userType: 'PLACEMENT',
          roleId: String(row.role).trim(),
          employeeId,
          accountStatus: 'ACTIVE',
          isEmailVerified: true
        });

        createdRecords.push(user);
        importedCount++;
      }
    } catch (err) {
      console.error(`Import failed for row:`, err);
      skippedCount++;
    }
  }

  return {
    importedCount,
    skippedCount,
    failedCount: 0,
    totalProcessed: validRows.length + skippedCount
  };
}
