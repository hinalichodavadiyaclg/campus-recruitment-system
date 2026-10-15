import * as departmentService from '../services/department.service.js';
import { sendSuccess } from '../utils/api-response.js';

export async function list(req, res) {
  const queryParams = res.locals.input?.query || req.query || {};
  const result = await departmentService.listDepartments(queryParams, req.auth);
  return sendSuccess(res, 200, result);
}

export async function getById(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const department = await departmentService.getDepartmentById(id, req.auth);
  return sendSuccess(res, 200, department);
}

export async function create(req, res) {
  const body = res.locals.input?.body || req.body;
  const department = await departmentService.createDepartment(body);
  return sendSuccess(res, 201, department);
}

export async function update(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body;
  const department = await departmentService.updateDepartment(id, body);
  return sendSuccess(res, 200, department);
}

export async function setStatus(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const isActive = res.locals.input?.body?.isActive;
  const department = await departmentService.setDepartmentStatus(id, isActive);
  return sendSuccess(res, 200, department);
}
