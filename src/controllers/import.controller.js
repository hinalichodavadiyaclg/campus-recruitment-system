import * as importService from '../services/import.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';

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
  let rows = [];

  if (request.file) {
    rows = importService.parseFileToRows(request.file.buffer);
  } else if (request.body && Array.isArray(request.body.rows)) {
    rows = request.body.rows;
  } else {
    throw new AppError(400, 'NO_DATA_PROVIDED', 'Please provide an Excel/CSV file or rows payload.');
  }

  const result = await importService.validateImportRows(type, rows);
  return sendSuccess(response, 200, result);
});

export const confirmImport = asyncHandler(async (request, response) => {
  const { type } = request.params;
  let rows = [];

  if (request.file) {
    rows = importService.parseFileToRows(request.file.buffer);
  } else if (request.body && Array.isArray(request.body.rows)) {
    rows = request.body.rows;
  } else {
    throw new AppError(400, 'NO_DATA_PROVIDED', 'Please provide rows to import.');
  }

  const result = await importService.confirmImport(type, rows);
  return sendSuccess(response, 200, result);
});
