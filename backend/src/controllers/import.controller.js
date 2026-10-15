import * as importService from '../services/import.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

function parseImportOptions(request) {
  let createNew = true;
  let updateExisting = true;

  if (request.body?.createNew !== undefined) {
    createNew = String(request.body.createNew) === 'true' || request.body.createNew === true;
  } else if (request.query?.createNew !== undefined) {
    createNew = String(request.query.createNew) === 'true';
  }

  if (request.body?.updateExisting !== undefined) {
    updateExisting = String(request.body.updateExisting) === 'true' || request.body.updateExisting === true;
  } else if (request.query?.updateExisting !== undefined) {
    updateExisting = String(request.query.updateExisting) === 'true';
  }

  return { createNew, updateExisting };
}

export const downloadTemplate = asyncHandler(async (request, response) => {
  const { type } = request.params;
  const buffer = importService.generateTemplateBuffer(type);

  response.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  response.setHeader('Content-Disposition', `attachment; filename="${type}_import_template.xlsx"`);
  return response.send(buffer);
});

export const validateImport = asyncHandler(async (request, response) => {
  const { type } = request.params;
  const options = parseImportOptions(request);
  let inputSource;

  if (request.file?.buffer) {
    inputSource = request.file.buffer;
  } else if (request.body && Array.isArray(request.body.rows)) {
    inputSource = request.body.rows;
  } else {
    throw new AppError(400, 'NO_DATA_PROVIDED', 'Please provide an Excel/CSV file or rows payload.');
  }

  const result = await importService.validateImportRows(type, inputSource, options, request.auth);
  return sendSuccess(response, 200, result);
});

export const confirmImport = asyncHandler(async (request, response) => {
  const { type } = request.params;
  const options = parseImportOptions(request);
  let inputSource;

  if (request.file?.buffer) {
    inputSource = request.file.buffer;
  } else if (request.body && Array.isArray(request.body.rows)) {
    inputSource = request.body.rows;
  } else {
    throw new AppError(400, 'NO_DATA_PROVIDED', 'Please provide rows or file to import.');
  }

  const result = await importService.confirmImport(type, inputSource, options, request.auth);
  return sendSuccess(response, 200, result);
});

export const exportData = asyncHandler(async (request, response) => {
  const { type } = request.params;
  const filtered = String(request.query.filtered) === 'true';
  const search = typeof request.query.search === 'string' ? request.query.search : '';
  const department = typeof request.query.department === 'string' ? request.query.department : (typeof request.query.departmentId === 'string' ? request.query.departmentId : '');
  const course = typeof request.query.course === 'string' ? request.query.course : (typeof request.query.courseId === 'string' ? request.query.courseId : '');
  const role = typeof request.query.role === 'string' ? request.query.role : '';
  const designation = typeof request.query.designation === 'string' ? request.query.designation : '';
  const semester = request.query.semester;
  const minCgpa = request.query.minCgpa || request.query.cgpa;
  const backlogs = request.query.backlogs;

  const buffer = await importService.exportDataToExcel(type, {
    search,
    filtered,
    department,
    course,
    role,
    designation,
    semester,
    minCgpa,
    backlogs
  }, request.auth);

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${type}_${filtered ? 'filtered_' : 'all_'}${timestamp}.xlsx`;

  response.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return response.send(buffer);
});
