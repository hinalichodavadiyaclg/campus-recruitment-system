import crypto from 'node:crypto';
import mongoose from 'mongoose';
import * as xlsx from 'xlsx';
import { Company } from '../models/company.model.js';
import { Student } from '../models/student.model.js';
import { PlacementOfficer } from '../models/placement_officer.model.js';
import { User } from '../models/user.model.js';
import { Department } from '../models/department.model.js';
import { Course } from '../models/course.model.js';
import { ROLE_IDS } from '../utils/access-constants.js';
import { AppError } from '../utils/app-error.js';
import { hashPassword } from '../utils/password.js';
import { isValid10DigitMobile } from '../validators/schemas.js';
import { getNextCandidateCompanyId, executeWithCompanyIdRetry } from '../utils/company-id.js';
import { getCoordinatorDepartment } from '../utils/department-scope.js';

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CLEAR_SENTINEL_REGEX = /^\[?CLEAR\]?$/i;

export const PROTECTED_SYSTEM_FIELDS = Object.freeze(
  new Set([
    '_id',
    'id',
    'password',
    'passwordhash',
    'rawpassword',
    'temporarypassword',
    'token',
    'authtoken',
    'sessiontoken',
    'sessions',
    'roleid',
    'createdat',
    'updatedat',
    '__v'
  ])
);

export const MODULE_CONFIGS = Object.freeze({
  student: {
    type: 'student',
    displayName: 'Student',
    primaryKey: 'universityId',
    primaryKeyLabel: 'University ID / Roll Number',
    fields: [
      {
        key: 'universityId',
        label: 'University ID / Roll Number',
        header: 'University ID',
        aliases: ['universityid', 'university_id', 'rollnumber', 'roll_number', 'universityidrollnumber', 'primaryid'],
        requiredForCreate: true,
        requiredForUpdate: true,
        type: 'string',
        description: 'Unique institutional student roll number (e.g. STU2026001). Stable matching identifier.'
      },
      {
        key: 'firstName',
        label: 'First Name',
        header: 'First Name',
        aliases: ['firstname', 'first_name', 'givenname'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Student given legal first name (max 100 characters).'
      },
      {
        key: 'lastName',
        label: 'Last Name',
        header: 'Last Name',
        aliases: ['lastname', 'last_name', 'surname'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Student legal last name / surname (max 100 characters).'
      },
      {
        key: 'email',
        label: 'Email Address',
        header: 'Email Address',
        aliases: ['email', 'emailaddress', 'studentemail', 'mail'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'email',
        description: 'Unique academic or personal email address (e.g. student@university.edu).'
      },
      {
        key: 'mobileNumber',
        label: 'Mobile Number',
        header: 'Mobile Number',
        aliases: ['mobilenumber', 'mobile_number', 'mobile', 'phone', 'phonenumber', 'contactnumber'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'mobile',
        description: '10-digit mobile contact number (e.g. 9876543210 or +91 9876543210).'
      },
      {
        key: 'department',
        label: 'Department',
        header: 'Department',
        aliases: ['department', 'departmentname', 'dept', 'academicdepartment'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'relation',
        description: 'Name or code of the active academic department (e.g. Computer Science & Engineering).'
      },
      {
        key: 'branch',
        label: 'Course / Specialization',
        header: 'Course / Specialization',
        aliases: ['branch', 'course', 'specialization', 'coursename', 'degree', 'coursespecialization', 'coursebranch'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'relation',
        description: 'Name or code of the active course belonging to the selected department.'
      },
      {
        key: 'semester',
        label: 'Current Semester',
        header: 'Current Semester',
        aliases: ['semester', 'currentsemester', 'sem'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'number',
        description: 'Current active semester number (integer from 1 to 12).'
      },
      {
        key: 'passingYear',
        label: 'Passing Year',
        header: 'Passing Year',
        aliases: ['passingyear', 'passing_year', 'passyear', 'graduationyear', 'yearofpassing'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'number',
        description: 'Expected or completed graduation year (four-digit integer between 1990 and 2100).'
      },
      {
        key: 'cgpa',
        label: 'CGPA',
        header: 'CGPA',
        aliases: ['cgpa', 'gpa', 'cumulativegpa'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'number',
        description: 'Cumulative Grade Point Average on a 10.0 scale (decimal between 0.00 and 10.00).'
      },
      {
        key: 'backlogs',
        label: 'Active Backlogs',
        header: 'Active Backlogs',
        aliases: ['backlogs', 'activebacklogs', 'backlog', 'standingarrears'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'number',
        description: 'Count of currently active uncleared backlogs / arrears (0 or positive integer; default 0).'
      },
      {
        key: 'address',
        label: 'Residential / Campus Address',
        header: 'Residential / Campus Address',
        aliases: ['address', 'residentialaddress', 'campusaddress', 'permanentaddress', 'residentialcampusaddress'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'string',
        clearable: true,
        description: 'Permanent home address or campus accommodation. Enter [CLEAR] to empty on update.'
      }
    ],
    sampleRow: {
      universityId: 'STU2026999',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.edu',
      mobileNumber: '+91 9876543210',
      department: 'Computer Science & Engineering',
      branch: 'B.Tech Computer Science',
      semester: 8,
      passingYear: 2026,
      cgpa: 8.75,
      backlogs: 0,
      address: 'Campus Hostel Block A'
    }
  },

  company: {
    type: 'company',
    displayName: 'Company',
    primaryKey: 'companyId',
    primaryKeyLabel: 'Company ID',
    fields: [
      {
        key: 'companyId',
        label: 'Company ID',
        header: 'Company ID',
        aliases: ['companyid', 'company_id', 'businessid', 'businesscompanyid'],
        requiredForCreate: false, // Auto-generated for creates
        requiredForUpdate: true,  // Required to match existing
        type: 'string',
        description: 'Sequential business identifier (e.g. COMP-0001). Leave blank for new companies; required for update.'
      },
      {
        key: 'companyName',
        label: 'Company Name',
        header: 'Company Name',
        aliases: ['companyname', 'company_name', 'name', 'organizationname'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Official corporate legal entity or brand name (max 200 characters).'
      },
      {
        key: 'industryType',
        label: 'Industry Type',
        header: 'Industry Type',
        aliases: ['industrytype', 'industry_type', 'industry', 'sector'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Operating industry sector (e.g. Information Technology, Financial Services; max 100 characters).'
      },
      {
        key: 'hrRecruiterName',
        label: 'HR / Recruiter Name',
        header: 'HR / Recruiter Name',
        aliases: ['hrrecruitername', 'hr_recruiter_name', 'recruitername', 'hrname', 'primarycontact', 'contactperson'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Name of the primary recruiter or talent acquisition representative (max 100 characters).'
      },
      {
        key: 'email',
        label: 'Email Address',
        header: 'Email Address',
        aliases: ['email', 'emailaddress', 'recruiteremail', 'workemail', 'companyemail'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'email',
        description: 'Official corporate email for recruitment communications and recruiter portal access.'
      },
      {
        key: 'yearEstablished',
        label: 'Year Established',
        header: 'Year Established',
        aliases: ['yearestablished', 'year_established', 'establishedyear', 'foundingyear'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'number',
        description: 'Year company was incorporated or founded (four-digit integer between 1800 and 2100).'
      },
      {
        key: 'designation',
        label: 'Designation',
        header: 'Designation',
        aliases: ['designation', 'recruiterdesignation', 'jobtitle', 'title'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'string',
        description: 'Professional title of primary recruiter (e.g. Talent Acquisition Lead; max 100 characters).'
      },
      {
        key: 'mobileNumber',
        label: 'Mobile Number',
        header: 'Mobile Number',
        aliases: ['mobilenumber', 'mobile_number', 'mobile', 'phone', 'phonenumber', 'contactnumber'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'mobile',
        description: 'Recruiter official mobile or phone contact number (10 digits).'
      },
      {
        key: 'website',
        label: 'Website URL',
        header: 'Website URL',
        aliases: ['website', 'websiteurl', 'web', 'url', 'companywebsite'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'url',
        clearable: true,
        description: 'Official company website URL (e.g. https://example.com). Enter [CLEAR] to empty on update.'
      },
      {
        key: 'officeAddress',
        label: 'Office Address',
        header: 'Office Address',
        aliases: ['officeaddress', 'office_address', 'address', 'corporateaddress'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'string',
        description: 'Physical corporate office or registered address (max 500 characters).'
      },
      {
        key: 'description',
        label: 'Company Description',
        header: 'Company Description',
        aliases: ['description', 'companydescription', 'about', 'overview'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'string',
        description: 'Overview of company business, domain specializations, and culture (max 1000 characters).'
      }
    ],
    sampleRow: {
      companyId: '',
      companyName: 'Example Technologies Inc.',
      industryType: 'Information Technology',
      hrRecruiterName: 'Alex Smith',
      email: 'alex.smith@examplecorp.com',
      yearEstablished: 2015,
      designation: 'Lead Technical Recruiter',
      mobileNumber: '+91 9876543210',
      website: 'https://examplecorp.com',
      officeAddress: 'Tower 2, IT Park, Tech City',
      description: 'Enterprise cloud computing and digital transformation consulting services provider.'
    }
  },

  placement: {
    type: 'placement',
    displayName: 'Placement Officer',
    primaryKey: 'employeeId',
    primaryKeyLabel: 'Employee ID',
    fields: [
      {
        key: 'employeeId',
        label: 'Employee ID',
        header: 'Employee ID',
        aliases: ['employeeid', 'employee_id', 'empid', 'staffid'],
        requiredForCreate: true,
        requiredForUpdate: true,
        type: 'string',
        description: 'Institutional staff employee code (e.g. EMP-PL-101). Stable matching identifier.'
      },
      {
        key: 'firstName',
        label: 'First Name',
        header: 'First Name',
        aliases: ['firstname', 'first_name', 'givenname'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Officer legal given first name (max 100 characters).'
      },
      {
        key: 'lastName',
        label: 'Last Name',
        header: 'Last Name',
        aliases: ['lastname', 'last_name', 'surname'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'string',
        description: 'Officer legal last name / surname (max 100 characters).'
      },
      {
        key: 'email',
        label: 'Official Email Address',
        header: 'Official Email Address',
        aliases: ['email', 'officialemail', 'emailaddress', 'officialemailaddress', 'staffemail'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'email',
        description: 'University institutional staff email address for administrative portal access.'
      },
      {
        key: 'mobileNumber',
        label: 'Mobile Number',
        header: 'Mobile Number',
        aliases: ['mobilenumber', 'mobile_number', 'mobile', 'phone', 'phonenumber'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'mobile',
        description: 'Official 10-digit mobile contact number.'
      },
      {
        key: 'designation',
        label: 'Designation',
        header: 'Designation',
        aliases: ['designation', 'jobtitle', 'title', 'staffdesignation'],
        requiredForCreate: false,
        requiredForUpdate: false,
        type: 'string',
        description: 'Official university staff designation (e.g. Placement Coordinator / Placement Head).'
      },
      {
        key: 'role',
        label: 'Assigned Role',
        header: 'Assigned Role',
        aliases: ['role', 'assignedrole', 'systemrole', 'authorizationrole'],
        requiredForCreate: true,
        requiredForUpdate: false,
        type: 'role',
        description: 'System authorization role: ROLE_PLACEMENT_COORDINATOR or ROLE_PLACEMENT_HEAD.'
      },
      {
        key: 'department',
        label: 'Department',
        header: 'Department',
        aliases: ['department', 'assigneddepartment', 'departmentname', 'dept'],
        requiredForCreate: false, // Required only if role === ROLE_PLACEMENT_COORDINATOR
        requiredForUpdate: false,
        type: 'relation',
        clearable: true,
        description: 'Assigned department (required for Placement Coordinator; optional/blank for Placement Head).'
      }
    ],
    sampleRow: {
      employeeId: 'EMP-PL-999',
      firstName: 'Morgan',
      lastName: 'Taylor',
      email: 'morgan.taylor@example.edu',
      mobileNumber: '+91 9876543210',
      designation: 'Placement Coordinator',
      role: 'ROLE_PLACEMENT_COORDINATOR',
      department: 'Computer Science & Engineering'
    }
  }
});

// Backward compatibility export
export const TEMPLATE_COLUMNS = Object.freeze({
  student: MODULE_CONFIGS.student.fields.map((f) => f.key),
  company: MODULE_CONFIGS.company.fields.map((f) => f.key),
  placement: MODULE_CONFIGS.placement.fields.map((f) => f.key)
});

export function parseFileToRows(buffer) {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(worksheet, { defval: '' });
}

/**
 * Normalizes header string by stripping non-alphanumeric characters and lowercase
 */
export function normalizeHeaderString(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves a raw column header to a recognized module field or identifies unknown/protected
 */
export function resolveColumnHeader(rawHeader, moduleConfig) {
  const norm = normalizeHeaderString(rawHeader);
  if (!norm) return null;

  // Check if it matches a forbidden system / protected field
  if (PROTECTED_SYSTEM_FIELDS.has(norm)) {
    return { isProtected: true, rawHeader, norm };
  }

  // Specific check: students & placement cannot have companyId / userId / roleId injected
  if (moduleConfig.type !== 'company' && norm === 'companyid') {
    return { isProtected: true, rawHeader, norm };
  }
  if (moduleConfig.type === 'student' && (norm === 'role' || norm === 'roleid')) {
    return { isProtected: true, rawHeader, norm };
  }

  // Look up recognized field
  for (const field of moduleConfig.fields) {
    if (normalizeHeaderString(field.key) === norm || normalizeHeaderString(field.header) === norm) {
      return { field, rawHeader, norm };
    }
    for (const alias of field.aliases || []) {
      if (normalizeHeaderString(alias) === norm) {
        return { field, rawHeader, norm };
      }
    }
  }

  return { isUnknown: true, rawHeader, norm };
}

/**
 * Formula injection protection: prepend single-quote to trigger characters
 */
export function sanitizeForExport(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return val;
}

/**
 * Strips leading single-quote from cells escaped on previous export, or trims
 */
export function cleanCellValue(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (str.startsWith("'") && str.length > 1 && /^[=+\-@\t\r]/.test(str.slice(1))) {
    str = str.slice(1).trim();
  }
  return str;
}

/**
 * Generates an Excel workbook buffer with a Template sheet and an Instructions sheet
 */
export function generateTemplateBuffer(type) {
  const config = MODULE_CONFIGS[type];
  if (!config) throw new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown import type: ${type}`);

  const headers = config.fields.map((f) => {
    if (type === 'company' && f.key === 'companyId') {
      return 'Company ID (Optional for new records, required for update)';
    }
    if (f.requiredForCreate) {
      return `${f.header} *`;
    }
    return f.header;
  });

  // Empty template: header row only with zero example data rows
  const templateSheet = xlsx.utils.aoa_to_sheet([headers]);
  templateSheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

  // Build Instructions Sheet
  const instructionsRows = [
    {
      'Column Header': 'INSTRUCTIONS & IMPORT GUIDELINES',
      'Matching Identifier': '',
      'Required for Create': '',
      'Required for Update': '',
      'Accepted Formats & Rules': 'Please read carefully before filling out or uploading this workbook.'
    },
    {
      'Column Header': `Module: ${config.displayName}`,
      'Matching Identifier': `Primary Match Key: ${config.primaryKeyLabel}`,
      'Required for Create': 'Create mode: creates unmatched valid records.',
      'Required for Update': 'Update mode: updates matched records without overwriting omitted fields.',
      'Accepted Formats & Rules': 'Blank cells during update PRESERVE existing database values. Enter [CLEAR] in optional cells to erase existing values.'
    },
    ...config.fields.map((f) => ({
      'Column Header': f.header,
      'Matching Identifier': f.key === config.primaryKey ? 'YES (STABLE KEY)' : 'No',
      'Required for Create': f.requiredForCreate ? 'REQUIRED' : 'Optional',
      'Required for Update': f.key === config.primaryKey ? 'REQUIRED (MATCH KEY)' : 'Optional (preserves existing if empty)',
      'Accepted Formats & Rules': f.description
    }))
  ];

  const instructionsSheet = xlsx.utils.json_to_sheet(instructionsRows);

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, templateSheet, `${config.displayName} Template`);
  xlsx.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parses raw workbook buffer or rows payload and extracts normalized headers and data rows
 */
export function parseRawWorkbook(buffer, moduleConfig) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  // Find primary data sheet (prefer first sheet or non-instructions sheet)
  const sheetName = workbook.SheetNames.find((s) => !s.toLowerCase().includes('instruction')) || workbook.SheetNames[0];
  if (!sheetName) {
    return { rawHeaders: [], rows: [], ignoredColumns: [], protectedColumns: [] };
  }

  const worksheet = workbook.Sheets[sheetName];
  const matrix = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
  if (!matrix || matrix.length === 0) {
    return { rawHeaders: [], rows: [], ignoredColumns: [], protectedColumns: [] };
  }

  const rawHeaderRow = matrix[0] || [];
  const columnMappings = [];
  const ignoredColumns = [];
  const protectedColumns = [];

  for (let colIdx = 0; colIdx < rawHeaderRow.length; colIdx++) {
    const rawH = String(rawHeaderRow[colIdx] || '').trim();
    if (!rawH) continue;

    const resolution = resolveColumnHeader(rawH, moduleConfig);
    if (!resolution) continue;

    if (resolution.isProtected) {
      protectedColumns.push(rawH);
    } else if (resolution.isUnknown) {
      ignoredColumns.push(rawH);
    } else if (resolution.field) {
      columnMappings.push({ colIdx, fieldKey: resolution.field.key, rawHeader: rawH, field: resolution.field });
    }
  }

  const rows = [];
  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const rowCells = matrix[rIdx];
    if (!rowCells || rowCells.length === 0) continue;

    // Check if entire row is empty
    const hasAnyContent = rowCells.some((c) => String(c).trim() !== '');
    if (!hasAnyContent) continue;

    const rowObj = {};
    for (const mapping of columnMappings) {
      const rawVal = rowCells[mapping.colIdx];
      rowObj[mapping.fieldKey] = cleanCellValue(rawVal);
    }
    rowObj.__rowNumber = rIdx + 1; // 1-based index including header
    rows.push(rowObj);
  }

  return {
    rawHeaders: rawHeaderRow.map((h) => String(h).trim()).filter(Boolean),
    columnMappings,
    ignoredColumns: Array.from(new Set(ignoredColumns)),
    protectedColumns: Array.from(new Set(protectedColumns)),
    rows
  };
}

/**
 * Normalizes JSON array rows (when passed as body payload)
 */
export function normalizeJsonRows(rawRows, moduleConfig) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { rawHeaders: [], rows: [], ignoredColumns: [], protectedColumns: [] };
  }

  // Derive headers from the first few objects
  const rawHeadersSet = new Set();
  for (const r of rawRows) {
    if (r && typeof r === 'object') {
      Object.keys(r).forEach((k) => rawHeadersSet.add(k));
    }
  }

  const rawHeaders = Array.from(rawHeadersSet);
  const keyMappings = new Map();
  const ignoredColumns = [];
  const protectedColumns = [];

  for (const rawH of rawHeaders) {
    const res = resolveColumnHeader(rawH, moduleConfig);
    if (res?.isProtected) {
      protectedColumns.push(rawH);
    } else if (res?.isUnknown) {
      ignoredColumns.push(rawH);
    } else if (res?.field) {
      keyMappings.set(rawH, res.field.key);
    }
  }

  const rows = [];
  for (let idx = 0; idx < rawRows.length; idx++) {
    const item = rawRows[idx];
    if (!item || typeof item !== 'object') continue;

    const hasAny = Object.values(item).some((v) => String(v).trim() !== '');
    if (!hasAny) continue;

    const rowObj = {};
    for (const [rawK, canonKey] of keyMappings.entries()) {
      rowObj[canonKey] = cleanCellValue(item[rawK]);
    }
    rowObj.__rowNumber = idx + 2;
    rows.push(rowObj);
  }

  return {
    rawHeaders,
    ignoredColumns: Array.from(new Set(ignoredColumns)),
    protectedColumns: Array.from(new Set(protectedColumns)),
    rows
  };
}

/**
 * Validates import rows with ZERO database writes.
 * Returns preview details, counts for create, update, skip, invalid, and duplicate.
 */
export async function validateImportRows(type, inputSource, options = {}, auth = null) {
  const { createNew = true, updateExisting = true } = options;
  const config = MODULE_CONFIGS[type];
  if (!config) throw new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown import type: ${type}`);

  let parsed;
  if (Buffer.isBuffer(inputSource)) {
    parsed = parseRawWorkbook(inputSource, config);
  } else if (Array.isArray(inputSource)) {
    parsed = normalizeJsonRows(inputSource, config);
  } else {
    throw new AppError(400, 'NO_DATA_PROVIDED', 'Please provide a valid Excel/CSV file or rows payload.');
  }

  const { rows, ignoredColumns, protectedColumns, rawHeaders } = parsed;

  // 1. Enforce rejection of protected/security-sensitive fields
  if (protectedColumns.length > 0) {
    throw new AppError(
      400,
      'PROTECTED_FIELD_REJECTED',
      `Uploaded spreadsheet contains protected/forbidden column: '${protectedColumns[0]}'. Internal credentials, passwords, or system IDs cannot be imported.`
    );
  }

  // 2. Enforce Required Headers
  const presentCanonicalKeys = new Set();
  for (const h of rawHeaders) {
    const res = resolveColumnHeader(h, config);
    if (res?.field) presentCanonicalKeys.add(res.field.key);
  }

  // Identify missing required headers based on active modes
  const missingHeaders = [];
  const hasPrimaryKey = presentCanonicalKeys.has(config.primaryKey);

  const missingCreationHeaders = config.fields
    .filter((f) => f.requiredForCreate && !presentCanonicalKeys.has(f.key))
    .map((f) => f.header);

  if (createNew && !updateExisting) {
    // Strict Create-Only mode: all creation headers required
    if (missingCreationHeaders.length > 0) {
      missingHeaders.push(...missingCreationHeaders);
    }
  } else if (!createNew && updateExisting) {
    // Strict Update-Only mode: primary key header required
    if (!hasPrimaryKey) {
      missingHeaders.push(config.primaryKeyLabel);
    }
  } else if (createNew && updateExisting) {
    // Dual mode: if matching identifier is absent, all creation headers are required
    if (!hasPrimaryKey) {
      if (missingCreationHeaders.length > 0) {
        missingHeaders.push(...missingCreationHeaders);
      }
    }
  }

  if (missingHeaders.length > 0) {
    throw new AppError(
      400,
      'MISSING_REQUIRED_HEADERS',
      `Workbook is missing required column header(s): ${missingHeaders.join(', ')}.`
    );
  }

  if (rows.length === 0) {
    throw new AppError(400, 'EMPTY_IMPORT_DATA', 'No data rows found in the uploaded file.');
  }

  // Pre-load reference collections for fast relational validation
  const [activeDepartments, activeCourses, coordDept] = await Promise.all([
    Department.find({ isActive: true }).lean(),
    Course.find({ isActive: true }).lean(),
    type === 'student' ? getCoordinatorDepartment(auth) : Promise.resolve(null)
  ]);

  const preview = [];
  const seenBatchIds = new Map();
  const seenBatchEmails = new Map();

  let createCount = 0;
  let updateCount = 0;
  let skipCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = row.__rowNumber || i + 2;
    const errors = [];
    const notes = [];
    let isDuplicate = false;
    let action = 'SKIP';

    // Check for raw formula injection in cells
    for (const [k, v] of Object.entries(row)) {
      if (k === '__rowNumber') continue;
      const strVal = String(v);
      if (/^=[A-Z_]+\(/.test(strVal)) {
        errors.push(`Field '${k}' contains uncalculated formula syntax: '${strVal}'. Raw formulas are rejected.`);
      }
    }

    if (type === 'student') {
      const rawUniId = String(row.universityId || '').trim();
      const universityId = rawUniId.toUpperCase();
      const email = String(row.email || '').trim().toLowerCase();
      const firstName = String(row.firstName || '').trim();
      const lastName = String(row.lastName || '').trim();
      const mobileNumber = String(row.mobileNumber || '').trim();
      const departmentInput = String(row.department || '').trim();
      const branchInput = String(row.branch || '').trim();
      const semesterRaw = row.semester !== undefined && row.semester !== '' ? Number(row.semester) : undefined;
      const passingYearRaw = row.passingYear !== undefined && row.passingYear !== '' ? Number(row.passingYear) : undefined;
      const cgpaRaw = row.cgpa !== undefined && row.cgpa !== '' ? Number(row.cgpa) : undefined;
      const backlogsRaw = row.backlogs !== undefined && row.backlogs !== '' ? Number(row.backlogs) : undefined;
      const address = row.address !== undefined ? String(row.address).trim() : undefined;

      // Primary Key Validation
      if (!universityId) {
        errors.push('University ID is required.');
      } else if (universityId.length > 100) {
        errors.push('University ID cannot exceed 100 characters.');
      }

      // Check Duplicate Identifier in batch
      if (universityId) {
        if (seenBatchIds.has(universityId)) {
          isDuplicate = true;
          errors.push(`Duplicate University ID '${universityId}' in row ${rowNumber}. First seen at row ${seenBatchIds.get(universityId)}.`);
        } else {
          seenBatchIds.set(universityId, rowNumber);
        }
      }

      // Check Duplicate Email in batch
      if (email) {
        if (seenBatchEmails.has(email)) {
          isDuplicate = true;
          errors.push(`Duplicate Email '${email}' in row ${rowNumber}. First seen at row ${seenBatchEmails.get(email)}.`);
        } else {
          seenBatchEmails.set(email, rowNumber);
        }
      }

      // Lookup existing Student record by primary key (ZERO WRITES)
      let existingStudent = null;
      if (universityId && !isDuplicate) {
        existingStudent = await Student.findOne({ universityId }).lean();
      }

      if (existingStudent) {
        // Record exists -> UPDATE evaluation
        if (coordDept) {
          const matchesDeptId = existingStudent.departmentId && String(existingStudent.departmentId) === String(coordDept.departmentId);
          const matchesDeptName = existingStudent.department && existingStudent.department.trim().toLowerCase() === coordDept.departmentName.trim().toLowerCase();
          if (!matchesDeptId && !matchesDeptName) {
            errors.push('You are not authorized to update students from another department.');
          }
        }

        if (!updateExisting) {
          action = 'SKIP';
          notes.push('Skipped: Record already exists and Update Existing Records is disabled.');
        } else {
          action = 'UPDATE';
          notes.push(`Will update existing student (${existingStudent.firstName} ${existingStudent.lastName}).`);

          // Validate fields only if supplied
          if (email && email !== existingStudent.email.toLowerCase()) {
            if (!EMAIL_REGEX.test(email)) {
              errors.push('Email format is invalid.');
            } else {
              const emailConflict = (await User.exists({ email, _id: { $ne: existingStudent.userId } })) ||
                                    (await Student.exists({ email, _id: { $ne: existingStudent._id } }));
              if (emailConflict) {
                errors.push(`Email '${email}' is already registered to another user account.`);
              }
            }
          }

          if (mobileNumber && !isValid10DigitMobile(mobileNumber)) {
            errors.push('Mobile number must be exactly 10 digits (e.g. 9876543210 or +91 9876543210).');
          }

          if (semesterRaw !== undefined && (Number.isNaN(semesterRaw) || semesterRaw < 1 || semesterRaw > 12)) {
            errors.push('Current Semester must be an integer between 1 and 12.');
          }

          if (passingYearRaw !== undefined && (Number.isNaN(passingYearRaw) || passingYearRaw < 1990 || passingYearRaw > 2100)) {
            errors.push('Passing Year must be between 1990 and 2100.');
          }

          if (cgpaRaw !== undefined && (Number.isNaN(cgpaRaw) || cgpaRaw < 0 || cgpaRaw > 10)) {
            errors.push('CGPA must be between 0.00 and 10.00.');
          }

          if (backlogsRaw !== undefined && (Number.isNaN(backlogsRaw) || backlogsRaw < 0)) {
            errors.push('Active Backlogs must be 0 or greater.');
          }

          if (address && address !== '[CLEAR]' && address.length > 500) {
            errors.push('Address cannot exceed 500 characters.');
          }

          // Validate department and course if either supplied
          if (departmentInput || branchInput) {
            const targetDeptName = departmentInput || existingStudent.department;
            const targetBranchName = branchInput || existingStudent.branch;

            let matchedDept = null;
            let matchedCourse = null;

            if (activeDepartments.length > 0 && targetDeptName) {
              matchedDept = activeDepartments.find(
                (d) => d.name.toLowerCase() === targetDeptName.toLowerCase() || d.code.toLowerCase() === targetDeptName.toLowerCase()
              );
              if (!matchedDept) {
                errors.push(`Academic department '${targetDeptName}' does not exist or is inactive.`);
              } else if (coordDept && String(matchedDept._id) !== String(coordDept.departmentId)) {
                errors.push(`You cannot reassign student to another department ('${matchedDept.name}'). Your assigned department is '${coordDept.departmentName}'.`);
              }
            }

            if (activeCourses.length > 0 && targetBranchName) {
              matchedCourse = activeCourses.find(
                (c) => c.name.toLowerCase() === targetBranchName.toLowerCase() || c.code.toLowerCase() === targetBranchName.toLowerCase()
              );
              if (!matchedCourse) {
                errors.push(`Course / Specialization '${targetBranchName}' does not exist or is inactive.`);
              } else if (coordDept && String(matchedCourse.departmentId) !== String(coordDept.departmentId)) {
                errors.push(`Course '${matchedCourse.name}' does not belong to your assigned department ('${coordDept.departmentName}').`);
              }
            }

            if (activeDepartments.length > 0 && activeCourses.length > 0 && matchedDept && matchedCourse && String(matchedCourse.departmentId) !== String(matchedDept._id)) {
              errors.push(`Course '${matchedCourse.name}' does not belong to department '${matchedDept.name}'.`);
            }
          }
        }
      } else {
        // Record does NOT exist -> CREATE evaluation
        if (!createNew) {
          action = 'SKIP';
          notes.push('Skipped: Unmatched University ID and Create New Records is disabled.');
        } else {
          if (missingCreationHeaders.length > 0) {
            throw new AppError(
              400,
              'MISSING_REQUIRED_HEADERS',
              `Workbook is missing required column header(s): ${missingCreationHeaders.join(', ')}.`
            );
          }
          action = 'CREATE';
          notes.push('Will create new student profile and user account.');

          // Full required creation validation
          if (!firstName) errors.push('First Name is required.');
          else if (firstName.length > 100) errors.push('First Name cannot exceed 100 characters.');

          if (!lastName) errors.push('Last Name is required.');
          else if (lastName.length > 100) errors.push('Last Name cannot exceed 100 characters.');

          if (!email) errors.push('Email Address is required.');
          else if (!EMAIL_REGEX.test(email)) errors.push('Email format is invalid.');
          else {
            const emailExists = (await User.exists({ email })) || (await Student.exists({ email }));
            if (emailExists) errors.push(`Email '${email}' already exists in database.`);
          }

          if (!mobileNumber) errors.push('Mobile Number is required.');
          else if (!isValid10DigitMobile(mobileNumber)) {
            errors.push('Mobile number must be exactly 10 digits (e.g. 9876543210 or +91 9876543210).');
          }

          if (!departmentInput) errors.push('Department is required.');
          if (!branchInput) errors.push('Course / Specialization is required.');

          let matchedDept = null;
          let matchedCourse = null;
          if (activeDepartments.length > 0 && departmentInput) {
            matchedDept = activeDepartments.find(
              (d) => d.name.toLowerCase() === departmentInput.toLowerCase() || d.code.toLowerCase() === departmentInput.toLowerCase()
            );
            if (!matchedDept) {
              errors.push(`Department '${departmentInput}' does not exist or is inactive.`);
            } else if (coordDept && String(matchedDept._id) !== String(coordDept.departmentId)) {
              errors.push(`Placement Coordinators can only create students in their assigned department ('${coordDept.departmentName}').`);
            }
          }

          if (activeCourses.length > 0 && branchInput) {
            matchedCourse = activeCourses.find(
              (c) => c.name.toLowerCase() === branchInput.toLowerCase() || c.code.toLowerCase() === branchInput.toLowerCase()
            );
            if (!matchedCourse) {
              errors.push(`Course / Specialization '${branchInput}' does not exist or is inactive.`);
            } else if (coordDept && String(matchedCourse.departmentId) !== String(coordDept.departmentId)) {
              errors.push(`Course '${matchedCourse.name}' does not belong to your assigned department ('${coordDept.departmentName}').`);
            }
          }

          if (activeDepartments.length > 0 && activeCourses.length > 0 && matchedDept && matchedCourse && String(matchedCourse.departmentId) !== String(matchedDept._id)) {
            errors.push(`Course '${matchedCourse.name}' does not belong to department '${matchedDept.name}'.`);
          }

          if (semesterRaw === undefined || Number.isNaN(semesterRaw) || semesterRaw < 1 || semesterRaw > 12) {
            errors.push('Current Semester must be an integer between 1 and 12.');
          }

          if (passingYearRaw === undefined || Number.isNaN(passingYearRaw) || passingYearRaw < 1990 || passingYearRaw > 2100) {
            errors.push('Passing Year must be between 1990 and 2100.');
          }

          if (cgpaRaw === undefined || Number.isNaN(cgpaRaw) || cgpaRaw < 0 || cgpaRaw > 10) {
            errors.push('CGPA must be between 0.00 and 10.00.');
          }

          if (backlogsRaw !== undefined && (Number.isNaN(backlogsRaw) || backlogsRaw < 0)) {
            errors.push('Active Backlogs must be 0 or greater.');
          }

          if (address && address.length > 500) {
            errors.push('Address cannot exceed 500 characters.');
          }
        }
      }
    } else if (type === 'company') {
      const companyId = String(row.companyId || '').trim().toUpperCase();
      const companyName = String(row.companyName || '').trim();
      const industryType = String(row.industryType || '').trim();
      const hrRecruiterName = String(row.hrRecruiterName || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const yearEstRaw = row.yearEstablished !== undefined && row.yearEstablished !== '' ? Number(row.yearEstablished) : undefined;
      const designation = String(row.designation || '').trim();
      const mobileNumber = String(row.mobileNumber || '').trim();
      const website = String(row.website || '').trim();
      const officeAddress = String(row.officeAddress || '').trim();
      const description = String(row.description || '').trim();

      // Check Duplicate Company ID in batch if provided
      if (companyId) {
        if (seenBatchIds.has(companyId)) {
          isDuplicate = true;
          errors.push(`Duplicate Company ID '${companyId}' in row ${rowNumber}. First seen at row ${seenBatchIds.get(companyId)}.`);
        } else {
          seenBatchIds.set(companyId, rowNumber);
        }
      }

      // Check Duplicate Email in batch
      if (email) {
        if (seenBatchEmails.has(email)) {
          isDuplicate = true;
          errors.push(`Duplicate Email '${email}' in row ${rowNumber}. First seen at row ${seenBatchEmails.get(email)}.`);
        } else {
          seenBatchEmails.set(email, rowNumber);
        }
      }

      // Match existing company strictly by companyId
      let existingCompany = null;
      if (companyId && !isDuplicate) {
        existingCompany = await Company.findOne({ companyId }).lean();
      }

      if (existingCompany) {
        // Record exists -> UPDATE evaluation
        if (!updateExisting) {
          action = 'SKIP';
          notes.push('Skipped: Company exists and Update Existing Records is disabled.');
        } else {
          action = 'UPDATE';
          notes.push(`Will update existing company '${existingCompany.companyName}' (${existingCompany.companyId}).`);

          // Validate fields only if supplied
          if (companyName && companyName.toLowerCase() !== existingCompany.companyName.toLowerCase()) {
            if (companyName.length > 200) {
              errors.push('Company Name cannot exceed 200 characters.');
            } else {
              const nameExists = await Company.exists({
                companyName: new RegExp(`^${companyName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i'),
                _id: { $ne: existingCompany._id }
              });
              if (nameExists) errors.push(`Company name '${companyName}' is already taken.`);
            }
          }

          if (email && email !== existingCompany.email.toLowerCase()) {
            if (!EMAIL_REGEX.test(email)) {
              errors.push('Email format is invalid.');
            } else {
              const emailExists = (await User.exists({ email, companyId: { $ne: existingCompany._id } })) ||
                                  (await Company.exists({ email, _id: { $ne: existingCompany._id } }));
              if (emailExists) errors.push(`Email '${email}' is already registered to another account.`);
            }
          }

          if (mobileNumber && !isValid10DigitMobile(mobileNumber)) {
            errors.push('Mobile number must be exactly 10 digits.');
          }

          if (yearEstRaw !== undefined && (Number.isNaN(yearEstRaw) || yearEstRaw < 1800 || yearEstRaw > 2100)) {
            errors.push('Year Established must be between 1800 and 2100.');
          }

          if (website && website !== '[CLEAR]') {
            if (website.length > 300) errors.push('Website URL cannot exceed 300 characters.');
            else {
              try {
                const parsedUrl = new URL(website.startsWith('http') ? website : `https://${website}`);
                if (!parsedUrl.hostname || !parsedUrl.hostname.includes('.')) errors.push('Website URL format is invalid.');
              } catch (_) {
                errors.push('Website URL format is invalid.');
              }
            }
          }

          if (officeAddress && officeAddress.length > 500) {
            errors.push('Office Address cannot exceed 500 characters.');
          }

          if (description && description.length > 1000) {
            errors.push('Company Description cannot exceed 1000 characters.');
          }
        }
      } else {
        // Record does NOT exist -> CREATE evaluation
        if (companyId && !existingCompany) {
          notes.push(`Notice: Company ID '${companyId}' not found. A new sequential business ID will be allocated.`);
        }

        if (!createNew) {
          action = 'SKIP';
          notes.push('Skipped: Unmatched Company and Create New Records is disabled.');
        } else {
          if (missingCreationHeaders.length > 0) {
            throw new AppError(
              400,
              'MISSING_REQUIRED_HEADERS',
              `Workbook is missing required column header(s): ${missingCreationHeaders.join(', ')}.`
            );
          }
          action = 'CREATE';
          notes.push('Will register new company and allocate next sequential business ID.');

          if (!companyName) errors.push('Company Name is required.');
          else if (companyName.length > 200) errors.push('Company Name cannot exceed 200 characters.');
          else {
            const nameExists = await Company.exists({
              companyName: new RegExp(`^${companyName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i')
            });
            if (nameExists) errors.push(`A company with name '${companyName}' already exists.`);
          }

          if (!industryType) errors.push('Industry Type is required.');
          else if (industryType.length > 100) errors.push('Industry Type cannot exceed 100 characters.');

          if (!hrRecruiterName) errors.push('HR / Recruiter Name is required.');
          else if (hrRecruiterName.length > 100) errors.push('HR / Recruiter Name cannot exceed 100 characters.');

          if (!email) errors.push('Email Address is required.');
          else if (!EMAIL_REGEX.test(email)) errors.push('Email format is invalid.');
          else {
            const emailExists = (await User.exists({ email })) || (await Company.exists({ email }));
            if (emailExists) errors.push(`Email '${email}' already exists in database.`);
          }

          if (yearEstRaw === undefined || Number.isNaN(yearEstRaw) || yearEstRaw < 1800 || yearEstRaw > 2100) {
            errors.push('Year Established is required and must be between 1800 and 2100.');
          }

          if (designation && designation.length > 100) errors.push('Designation cannot exceed 100 characters.');

          if (mobileNumber && !isValid10DigitMobile(mobileNumber)) errors.push('Mobile number must be exactly 10 digits.');

          if (website) {
            if (website.length > 300) errors.push('Website URL cannot exceed 300 characters.');
            else {
              try {
                const parsedUrl = new URL(website.startsWith('http') ? website : `https://${website}`);
                if (!parsedUrl.hostname || !parsedUrl.hostname.includes('.')) errors.push('Website URL format is invalid.');
              } catch (_) {
                errors.push('Website URL format is invalid.');
              }
            }
          }

          if (officeAddress && officeAddress.length > 500) errors.push('Office Address cannot exceed 500 characters.');

          if (description && description.length > 1000) errors.push('Company Description cannot exceed 1000 characters.');
        }
      }
    } else if (type === 'placement') {
      const employeeId = String(row.employeeId || '').trim();
      const firstName = String(row.firstName || '').trim();
      const lastName = String(row.lastName || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const mobileNumber = String(row.mobileNumber || '').trim();
      const designation = String(row.designation || '').trim();
      let role = String(row.role || '').trim();
      const departmentInput = String(row.department || '').trim();

      // Normalize role alias
      if (role.toLowerCase() === 'placement coordinator' || role.toLowerCase() === 'coordinator') {
        role = ROLE_IDS.PLACEMENT_COORDINATOR;
      } else if (role.toLowerCase() === 'placement head' || role.toLowerCase() === 'head') {
        role = ROLE_IDS.PLACEMENT_HEAD;
      }

      if (!employeeId) {
        errors.push('Employee ID is required.');
      } else if (employeeId.length > 50) {
        errors.push('Employee ID cannot exceed 50 characters.');
      }

      // Check Duplicate Employee ID in batch
      if (employeeId) {
        if (seenBatchIds.has(employeeId)) {
          isDuplicate = true;
          errors.push(`Duplicate Employee ID '${employeeId}' in row ${rowNumber}. First seen at row ${seenBatchIds.get(employeeId)}.`);
        } else {
          seenBatchIds.set(employeeId, rowNumber);
        }
      }

      // Check Duplicate Email in batch
      if (email) {
        if (seenBatchEmails.has(email)) {
          isDuplicate = true;
          errors.push(`Duplicate Email '${email}' in row ${rowNumber}. First seen at row ${seenBatchEmails.get(email)}.`);
        } else {
          seenBatchEmails.set(email, rowNumber);
        }
      }

      // Match existing Placement Officer strictly by employeeId
      let existingOfficer = null;
      if (employeeId && !isDuplicate) {
        existingOfficer = await PlacementOfficer.findOne({ employeeId }).lean();
      }

      if (existingOfficer) {
        // Record exists -> UPDATE evaluation
        if (!updateExisting) {
          action = 'SKIP';
          notes.push('Skipped: Officer exists and Update Existing Records is disabled.');
        } else {
          action = 'UPDATE';
          notes.push(`Will update existing placement officer (${existingOfficer.firstName} ${existingOfficer.lastName}).`);

          if (email && email !== existingOfficer.email.toLowerCase()) {
            if (!EMAIL_REGEX.test(email)) {
              errors.push('Email format is invalid.');
            } else {
              const emailExists = (await User.exists({ email, _id: { $ne: existingOfficer.userId } })) ||
                                  (await PlacementOfficer.exists({ email, _id: { $ne: existingOfficer._id } }));
              if (emailExists) errors.push(`Email '${email}' is already registered to another account.`);
            }
          }

          if (mobileNumber && !isValid10DigitMobile(mobileNumber)) {
            errors.push('Mobile number must be exactly 10 digits.');
          }

          if (role) {
            if (![ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR].includes(role)) {
              errors.push(`Role must be either '${ROLE_IDS.PLACEMENT_HEAD}' or '${ROLE_IDS.PLACEMENT_COORDINATOR}'.`);
            }
          }

          const effectiveRole = role || existingOfficer.role;
          if (effectiveRole === ROLE_IDS.PLACEMENT_COORDINATOR && departmentInput && departmentInput !== '[CLEAR]') {
            const matchedDept = activeDepartments.find(
              (d) => d.name.toLowerCase() === departmentInput.toLowerCase() || d.code.toLowerCase() === departmentInput.toLowerCase()
            );
            if (!matchedDept) errors.push(`Department '${departmentInput}' does not exist or is inactive.`);
          }
        }
      } else {
        // Record does NOT exist -> CREATE evaluation
        if (!createNew) {
          action = 'SKIP';
          notes.push('Skipped: Unmatched Employee ID and Create New Records is disabled.');
        } else {
          if (missingCreationHeaders.length > 0) {
            throw new AppError(
              400,
              'MISSING_REQUIRED_HEADERS',
              `Workbook is missing required column header(s): ${missingCreationHeaders.join(', ')}.`
            );
          }
          action = 'CREATE';
          notes.push('Will create new placement officer staff account.');

          if (!firstName) errors.push('First Name is required.');
          else if (firstName.length > 100) errors.push('First Name cannot exceed 100 characters.');

          if (!lastName) errors.push('Last Name is required.');
          else if (lastName.length > 100) errors.push('Last Name cannot exceed 100 characters.');

          if (!email) errors.push('Official Email Address is required.');
          else if (!EMAIL_REGEX.test(email)) errors.push('Email format is invalid.');
          else {
            const emailExists = (await User.exists({ email })) || (await PlacementOfficer.exists({ email }));
            if (emailExists) errors.push(`Email '${email}' already exists in database.`);
          }

          if (mobileNumber && !isValid10DigitMobile(mobileNumber)) errors.push('Mobile number must be exactly 10 digits.');

          if (designation && designation.length > 100) errors.push('Designation cannot exceed 100 characters.');

          if (!role) {
            errors.push('Assigned Role is required.');
          } else if (![ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR].includes(role)) {
            errors.push(`Role must be either '${ROLE_IDS.PLACEMENT_HEAD}' or '${ROLE_IDS.PLACEMENT_COORDINATOR}'.`);
          }

          if (role === ROLE_IDS.PLACEMENT_COORDINATOR) {
            if (!departmentInput) {
              errors.push('Department is required for Placement Coordinator.');
            } else {
              const matchedDept = activeDepartments.find(
                (d) => d.name.toLowerCase() === departmentInput.toLowerCase() || d.code.toLowerCase() === departmentInput.toLowerCase()
              );
              if (!matchedDept) errors.push(`Department '${departmentInput}' does not exist or is inactive.`);
            }
          }
        }
      }
    }

    let status = 'VALID';
    if (isDuplicate) {
      status = 'DUPLICATE';
      duplicateCount++;
    } else if (errors.length > 0) {
      status = 'INVALID';
      invalidCount++;
    } else if (action === 'SKIP') {
      status = 'SKIPPED';
      skipCount++;
    } else if (action === 'CREATE') {
      createCount++;
    } else if (action === 'UPDATE') {
      updateCount++;
    }

    const rowIdentifier =
      row.universityId ||
      row.companyId ||
      row.employeeId ||
      row.email ||
      `Row ${rowNumber}`;

    preview.push({
      rowNumber,
      identifier: rowIdentifier,
      action,
      status,
      data: row,
      errors,
      notes
    });
  }

  return {
    totalRows: rows.length,
    createCount,
    updateCount,
    skipCount,
    invalidCount,
    duplicateCount,
    validCount: createCount + updateCount,
    ignoredColumns,
    preview
  };
}

/**
 * Executes database writes after re-validation.
 * Employs transaction with fallback compensation to prevent orphaned records.
 */
export async function confirmImport(type, inputSource, options = {}, auth = null) {
  const { createNew = true, updateExisting = true } = options;
  const config = MODULE_CONFIGS[type];
  if (!config) throw new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown import type: ${type}`);

  // Revalidate to protect against stale preview and concurrent updates
  const validation = await validateImportRows(type, inputSource, { createNew, updateExisting }, auth);
  const validActionItems = validation.preview.filter(
    (item) => item.status === 'VALID' && (item.action === 'CREATE' || item.action === 'UPDATE')
  );

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = validation.skipCount + validation.invalidCount + validation.duplicateCount;
  let failedCount = 0;
  const executionErrors = [];

  const [activeDepartments, activeCourses] = await Promise.all([
    Department.find({ isActive: true }).lean(),
    Course.find({ isActive: true }).lean()
  ]);

  for (const item of validActionItems) {
    const row = item.data;
    const action = item.action;

    try {
      if (type === 'student') {
        const universityId = String(row.universityId).trim().toUpperCase();

        if (action === 'CREATE') {
          const email = String(row.email).trim().toLowerCase();
          const rawPassword = process.env.DEFAULT_STUDENT_PASSWORD || 'Student@123456';
          const passwordHash = await hashPassword(rawPassword);

          // Resolve department & course
          const deptInput = String(row.department).trim();
          const courseInput = String(row.branch).trim();

          const matchedDept = activeDepartments.find(
            (d) => d.name.toLowerCase() === deptInput.toLowerCase() || d.code.toLowerCase() === deptInput.toLowerCase()
          );
          const matchedCourse = activeCourses.find(
            (c) => c.name.toLowerCase() === courseInput.toLowerCase() || c.code.toLowerCase() === courseInput.toLowerCase()
          );

          let createdUser = null;
          let createdStudent = null;

          try {
            createdUser = await User.create({
              email,
              passwordHash,
              userType: 'STUDENT',
              roleId: ROLE_IDS.STUDENT,
              universityId,
              accountStatus: 'ACTIVE',
              isEmailVerified: true
            });

            createdStudent = await Student.create({
              universityId,
              firstName: String(row.firstName).trim(),
              lastName: String(row.lastName).trim(),
              email,
              mobileNumber: String(row.mobileNumber).trim(),
              departmentId: matchedDept ? matchedDept._id : undefined,
              department: matchedDept ? matchedDept.name : deptInput,
              courseId: matchedCourse ? matchedCourse._id : undefined,
              branch: matchedCourse ? matchedCourse.name : courseInput,
              semester: Number(row.semester),
              passingYear: Number(row.passingYear),
              cgpa: Number(row.cgpa),
              backlogs: row.backlogs !== undefined && row.backlogs !== '' ? Number(row.backlogs) : 0,
              address: row.address ? String(row.address).trim() : '',
              userId: createdUser._id
            });

            createdCount++;
          } catch (createErr) {
            // Compensation
            if (createdStudent?._id) {
              try { await Student.findByIdAndDelete(createdStudent._id); } catch (_) {}
            }
            if (createdUser?._id) {
              try { await User.findByIdAndDelete(createdUser._id); } catch (_) {}
            }
            throw createErr;
          }
        } else if (action === 'UPDATE') {
          const student = await Student.findOne({ universityId });
          if (!student) {
            skippedCount++;
            continue;
          }

          // Update supplied non-empty fields
          if (row.firstName !== undefined && row.firstName !== '') student.firstName = String(row.firstName).trim();
          if (row.lastName !== undefined && row.lastName !== '') student.lastName = String(row.lastName).trim();
          if (row.mobileNumber !== undefined && row.mobileNumber !== '') student.mobileNumber = String(row.mobileNumber).trim();
          if (row.semester !== undefined && row.semester !== '') student.semester = Number(row.semester);
          if (row.passingYear !== undefined && row.passingYear !== '') student.passingYear = Number(row.passingYear);
          if (row.cgpa !== undefined && row.cgpa !== '') student.cgpa = Number(row.cgpa);
          if (row.backlogs !== undefined && row.backlogs !== '') student.backlogs = Number(row.backlogs);

          // Handle address clearing sentinel
          if (row.address !== undefined) {
            if (CLEAR_SENTINEL_REGEX.test(row.address.trim())) {
              student.address = '';
            } else if (row.address.trim() !== '') {
              student.address = row.address.trim();
            }
          }

          // Update email
          if (row.email && row.email.trim().toLowerCase() !== student.email.toLowerCase()) {
            const newEmail = row.email.trim().toLowerCase();
            student.email = newEmail;
            if (student.userId) {
              await User.findByIdAndUpdate(student.userId, { email: newEmail });
            }
          }

          // Update department & branch if provided
          if (row.department && row.department.trim()) {
            const dInput = row.department.trim();
            const matchedDept = activeDepartments.find(
              (d) => d.name.toLowerCase() === dInput.toLowerCase() || d.code.toLowerCase() === dInput.toLowerCase()
            );
            if (matchedDept) {
              student.departmentId = matchedDept._id;
              student.department = matchedDept.name;
            }
          }

          if (row.branch && row.branch.trim()) {
            const cInput = row.branch.trim();
            const matchedCourse = activeCourses.find(
              (c) => c.name.toLowerCase() === cInput.toLowerCase() || c.code.toLowerCase() === cInput.toLowerCase()
            );
            if (matchedCourse) {
              student.courseId = matchedCourse._id;
              student.branch = matchedCourse.name;
            }
          }

          await student.save();
          updatedCount++;
        }
      } else if (type === 'company') {
        if (action === 'CREATE') {
          const email = String(row.email).trim().toLowerCase();
          const companyName = String(row.companyName).trim();

          await executeWithCompanyIdRetry(async () => {
            const nextCompanyId = await getNextCandidateCompanyId();
            const rawPassword = process.env.DEFAULT_COMPANY_PASSWORD || 'Company@123456';
            const passwordHash = await hashPassword(rawPassword);

            let createdCompany = null;
            let createdUser = null;

            try {
              createdCompany = await Company.create({
                companyId: nextCompanyId,
                companyName,
                industryType: String(row.industryType).trim(),
                hrRecruiterName: String(row.hrRecruiterName).trim(),
                email,
                yearEstablished: Number(row.yearEstablished),
                designation: row.designation ? String(row.designation).trim() : 'Recruiter',
                mobileNumber: row.mobileNumber ? String(row.mobileNumber).trim() : '',
                website: row.website ? String(row.website).trim() : '',
                officeAddress: row.officeAddress ? String(row.officeAddress).trim() : '',
                description: row.description ? String(row.description).trim() : ''
              });

              createdUser = await User.create({
                email,
                passwordHash,
                userType: 'COMPANY',
                roleId: ROLE_IDS.COMPANY,
                companyId: createdCompany._id,
                accountStatus: 'ACTIVE'
              });

              createdCompany.userId = createdUser._id;
              createdCompany.primaryRecruiterId = createdUser._id;
              await createdCompany.save();

              createdCount++;
            } catch (err) {
              if (createdUser?._id) {
                try { await User.findByIdAndDelete(createdUser._id); } catch (_) {}
              }
              if (createdCompany?._id) {
                try { await Company.findByIdAndDelete(createdCompany._id); } catch (_) {}
              }
              throw err;
            }
          });
        } else if (action === 'UPDATE') {
          const companyId = String(row.companyId).trim().toUpperCase();
          const company = await Company.findOne({ companyId });
          if (!company) {
            skippedCount++;
            continue;
          }

          if (row.companyName !== undefined && row.companyName !== '') company.companyName = String(row.companyName).trim();
          if (row.industryType !== undefined && row.industryType !== '') company.industryType = String(row.industryType).trim();
          if (row.hrRecruiterName !== undefined && row.hrRecruiterName !== '') company.hrRecruiterName = String(row.hrRecruiterName).trim();
          if (row.yearEstablished !== undefined && row.yearEstablished !== '') company.yearEstablished = Number(row.yearEstablished);
          if (row.designation !== undefined && row.designation !== '') company.designation = String(row.designation).trim();
          if (row.mobileNumber !== undefined && row.mobileNumber !== '') company.mobileNumber = String(row.mobileNumber).trim();
          if (row.officeAddress !== undefined && row.officeAddress !== '') company.officeAddress = String(row.officeAddress).trim();
          if (row.description !== undefined && row.description !== '') company.description = String(row.description).trim();

          // Handle website clearing
          if (row.website !== undefined) {
            if (CLEAR_SENTINEL_REGEX.test(row.website.trim())) {
              company.website = '';
            } else if (row.website.trim() !== '') {
              company.website = row.website.trim();
            }
          }

          // Handle email update and sync with primary recruiter account
          if (row.email && row.email.trim().toLowerCase() !== company.email.toLowerCase()) {
            const newEmail = row.email.trim().toLowerCase();
            company.email = newEmail;
            const primaryId = company.primaryRecruiterId || company.userId;
            if (primaryId) {
              await User.findByIdAndUpdate(primaryId, { email: newEmail });
            }
          }

          await company.save();
          updatedCount++;
        }
      } else if (type === 'placement') {
        const employeeId = String(row.employeeId).trim();

        if (action === 'CREATE') {
          const email = String(row.email).trim().toLowerCase();
          let assignedRole = String(row.role || ROLE_IDS.PLACEMENT_COORDINATOR).trim();
          if (assignedRole.toLowerCase() === 'placement coordinator' || assignedRole.toLowerCase() === 'coordinator') {
            assignedRole = ROLE_IDS.PLACEMENT_COORDINATOR;
          } else if (assignedRole.toLowerCase() === 'placement head' || assignedRole.toLowerCase() === 'head') {
            assignedRole = ROLE_IDS.PLACEMENT_HEAD;
          }

          const rawPassword = process.env.DEFAULT_PLACEMENT_PASSWORD || 'Placement@123456';
          const passwordHash = await hashPassword(rawPassword);

          let deptDoc = null;
          if (assignedRole === ROLE_IDS.PLACEMENT_COORDINATOR && row.department) {
            const dInput = String(row.department).trim();
            deptDoc = activeDepartments.find(
              (d) => d.name.toLowerCase() === dInput.toLowerCase() || d.code.toLowerCase() === dInput.toLowerCase()
            );
          }

          let createdUser = null;
          let createdOfficer = null;

          try {
            createdUser = await User.create({
              email,
              passwordHash,
              userType: 'PLACEMENT',
              roleId: assignedRole,
              employeeId,
              accountStatus: 'ACTIVE'
            });

            createdOfficer = await PlacementOfficer.create({
              employeeId,
              firstName: String(row.firstName).trim(),
              lastName: String(row.lastName).trim(),
              email,
              mobileNumber: row.mobileNumber ? String(row.mobileNumber).trim() : '',
              designation: row.designation ? String(row.designation).trim() : (assignedRole === ROLE_IDS.PLACEMENT_HEAD ? 'Placement Head' : 'Placement Coordinator'),
              role: assignedRole,
              departmentId: deptDoc ? deptDoc._id : undefined,
              department: deptDoc ? deptDoc.name : (assignedRole === ROLE_IDS.PLACEMENT_COORDINATOR ? String(row.department).trim() : undefined),
              userId: createdUser._id
            });

            createdCount++;
          } catch (err) {
            if (createdOfficer?._id) {
              try { await PlacementOfficer.findByIdAndDelete(createdOfficer._id); } catch (_) {}
            }
            if (createdUser?._id) {
              try { await User.findByIdAndDelete(createdUser._id); } catch (_) {}
            }
            throw err;
          }
        } else if (action === 'UPDATE') {
          const officer = await PlacementOfficer.findOne({ employeeId });
          if (!officer) {
            skippedCount++;
            continue;
          }

          if (row.firstName !== undefined && row.firstName !== '') officer.firstName = String(row.firstName).trim();
          if (row.lastName !== undefined && row.lastName !== '') officer.lastName = String(row.lastName).trim();
          if (row.mobileNumber !== undefined && row.mobileNumber !== '') officer.mobileNumber = String(row.mobileNumber).trim();
          if (row.designation !== undefined && row.designation !== '') officer.designation = String(row.designation).trim();

          // Role change
          if (row.role && row.role.trim() !== '') {
            let assignedRole = row.role.trim();
            if (assignedRole.toLowerCase() === 'placement coordinator' || assignedRole.toLowerCase() === 'coordinator') {
              assignedRole = ROLE_IDS.PLACEMENT_COORDINATOR;
            } else if (assignedRole.toLowerCase() === 'placement head' || assignedRole.toLowerCase() === 'head') {
              assignedRole = ROLE_IDS.PLACEMENT_HEAD;
            }
            if ([ROLE_IDS.PLACEMENT_HEAD, ROLE_IDS.PLACEMENT_COORDINATOR].includes(assignedRole)) {
              officer.role = assignedRole;
              if (officer.userId) {
                await User.findByIdAndUpdate(officer.userId, { roleId: assignedRole });
              }
            }
          }

          // Department update for coordinator
          if (row.department !== undefined) {
            if (CLEAR_SENTINEL_REGEX.test(row.department.trim()) || officer.role === ROLE_IDS.PLACEMENT_HEAD) {
              officer.departmentId = undefined;
              officer.department = undefined;
            } else if (row.department.trim() !== '') {
              const dInput = row.department.trim();
              const matchedDept = activeDepartments.find(
                (d) => d.name.toLowerCase() === dInput.toLowerCase() || d.code.toLowerCase() === dInput.toLowerCase()
              );
              if (matchedDept) {
                officer.departmentId = matchedDept._id;
                officer.department = matchedDept.name;
              }
            }
          }

          // Email update and sync
          if (row.email && row.email.trim().toLowerCase() !== officer.email.toLowerCase()) {
            const newEmail = row.email.trim().toLowerCase();
            officer.email = newEmail;
            if (officer.userId) {
              await User.findByIdAndUpdate(officer.userId, { email: newEmail });
            }
          }

          await officer.save();
          updatedCount++;
        }
      }
    } catch (err) {
      console.error(`Import write execution error at row ${item.rowNumber}:`, err);
      failedCount++;
      executionErrors.push({
        rowNumber: item.rowNumber,
        identifier: item.identifier,
        error: err.message || 'Database write error'
      });
    }
  }

  return {
    totalProcessed: validActionItems.length + skippedCount,
    createdCount,
    updatedCount,
    importedCount: createdCount + updatedCount,
    skippedCount,
    failedCount,
    ignoredColumns: validation.ignoredColumns,
    errors: executionErrors
  };
}

/**
 * Generates an Excel workbook for Export (All or Filtered)
 */
export async function exportDataToExcel(
  type,
  {
    search = '',
    filtered = false,
    department = '',
    course = '',
    role = '',
    designation = '',
    semester = '',
    minCgpa = '',
    backlogs = ''
  } = {},
  auth = null
) {
  const config = MODULE_CONFIGS[type];
  if (!config) throw new AppError(400, 'INVALID_IMPORT_TYPE', `Unknown export type: ${type}`);

  if (type === 'placement' && auth?.roleId === ROLE_IDS.PLACEMENT_COORDINATOR) {
    throw new AppError(403, 'FORBIDDEN', 'Placement Coordinators cannot export Placement Cell data.');
  }

  let rows = [];

  if (type === 'student') {
    const query = {};
    if (filtered && search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { universityId: regex },
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { branch: regex },
        { department: regex }
      ];
    }
    const coordDept = await getCoordinatorDepartment(auth);
    if (coordDept) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { departmentId: coordDept.departmentId },
          { department: new RegExp(`^${coordDept.departmentName.trim()}$`, 'i') }
        ]
      });
    } else if (filtered && department && department.trim()) {
      if (mongoose.Types.ObjectId.isValid(department)) {
        query.departmentId = department;
      } else {
        query.department = new RegExp(department.trim(), 'i');
      }
    }
    if (filtered && course && course.trim()) {
      if (mongoose.Types.ObjectId.isValid(course)) {
        query.courseId = course;
      } else {
        query.branch = new RegExp(course.trim(), 'i');
      }
    }
    if (filtered && semester !== '' && semester !== undefined && semester !== null) {
      query.semester = Number(semester);
    }
    if (filtered && minCgpa !== '' && minCgpa !== undefined && minCgpa !== null) {
      query.cgpa = { $gte: Number(minCgpa) };
    }
    if (filtered && backlogs !== '' && backlogs !== undefined && backlogs !== null) {
      if (backlogs === '0' || backlogs === 'zero') query.backlogs = 0;
      else if (backlogs === 'max1') query.backlogs = { $lte: 1 };
      else if (backlogs === 'max2') query.backlogs = { $lte: 2 };
      else if (backlogs === 'has') query.backlogs = { $gt: 0 };
      else if (!isNaN(Number(backlogs))) query.backlogs = { $lte: Number(backlogs) };
    }

    const students = await Student.find(query)
      .populate('departmentId', 'name code')
      .populate('courseId', 'name code')
      .sort({ universityId: 1 })
      .lean();

    rows = students.map((s) => ({
      'University ID': sanitizeForExport(s.universityId),
      'First Name': sanitizeForExport(s.firstName),
      'Last Name': sanitizeForExport(s.lastName),
      'Email Address': sanitizeForExport(s.email),
      'Mobile Number': sanitizeForExport(s.mobileNumber),
      'Department': sanitizeForExport(s.departmentId?.name || s.department || ''),
      'Course / Specialization': sanitizeForExport(s.courseId?.name || s.branch || ''),
      'Current Semester': s.semester ?? '',
      'Passing Year': s.passingYear ?? '',
      'CGPA': s.cgpa !== undefined && s.cgpa !== null ? Number(s.cgpa).toFixed(2) : '',
      'Active Backlogs': s.backlogs ?? 0,
      'Residential / Campus Address': sanitizeForExport(s.address || '')
    }));
  } else if (type === 'company') {
    const query = {};
    if (filtered && search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { companyId: regex },
        { companyName: regex },
        { industryType: regex },
        { hrRecruiterName: regex },
        { email: regex }
      ];
    }

    const companies = await Company.find(query)
      .sort({ companyId: 1 })
      .lean();

    rows = companies.map((c) => ({
      'Company ID': sanitizeForExport(c.companyId || ''),
      'Company Name': sanitizeForExport(c.companyName || ''),
      'Industry Type': sanitizeForExport(c.industryType || ''),
      'HR / Recruiter Name': sanitizeForExport(c.hrRecruiterName || ''),
      'Email Address': sanitizeForExport(c.email || ''),
      'Year Established': c.yearEstablished ?? '',
      'Designation': sanitizeForExport(c.designation || ''),
      'Mobile Number': sanitizeForExport(c.mobileNumber || ''),
      'Website URL': sanitizeForExport(c.website || ''),
      'Office Address': sanitizeForExport(c.officeAddress || ''),
      'Company Description': sanitizeForExport(c.description || '')
    }));
  } else if (type === 'placement') {
    const query = {};
    if (filtered && search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { employeeId: regex },
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { mobileNumber: regex },
        { designation: regex },
        { role: regex },
        { department: regex }
      ];
    }
    if (filtered && role && role.trim()) {
      const r = role.trim();
      if (r === 'ROLE_PLACEMENT_HEAD' || r === 'HEAD') {
        const headConditions = [
          { role: 'ROLE_PLACEMENT_HEAD' },
          { designation: new RegExp('Head', 'i') }
        ];
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: headConditions }];
          delete query.$or;
        } else {
          query.$or = headConditions;
        }
      } else if (r === 'ROLE_PLACEMENT_COORDINATOR' || r === 'COORDINATOR') {
        const coordConditions = [
          { role: 'ROLE_PLACEMENT_COORDINATOR' },
          { designation: new RegExp('Coordinator', 'i') }
        ];
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: coordConditions }];
          delete query.$or;
        } else {
          query.$or = coordConditions;
        }
      } else {
        query.role = r;
      }
    }
    if (filtered && department && department.trim()) {
      if (mongoose.Types.ObjectId.isValid(department)) {
        query.departmentId = department;
      } else {
        query.department = new RegExp(department.trim(), 'i');
      }
    }
    if (filtered && designation && designation.trim()) {
      query.designation = new RegExp(designation.trim(), 'i');
    }

    const officers = await PlacementOfficer.find(query)
      .populate('departmentId', 'name code')
      .sort({ employeeId: 1 })
      .lean();

    rows = officers.map((po) => ({
      'Employee ID': sanitizeForExport(po.employeeId || ''),
      'First Name': sanitizeForExport(po.firstName || ''),
      'Last Name': sanitizeForExport(po.lastName || ''),
      'Official Email Address': sanitizeForExport(po.email || ''),
      'Mobile Number': sanitizeForExport(po.mobileNumber || ''),
      'Designation': sanitizeForExport(po.designation || ''),
      'Assigned Role': sanitizeForExport(po.role || ''),
      'Department': sanitizeForExport(po.departmentId?.name || po.department || '')
    }));
  }

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, worksheet, `${config.displayName} Data`);

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
