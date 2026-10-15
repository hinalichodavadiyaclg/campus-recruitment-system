import * as courseService from '../services/course.service.js';
import { sendSuccess } from '../utils/api-response.js';

export async function list(req, res) {
  const queryParams = res.locals.input?.query || req.query || {};
  const result = await courseService.listCourses(queryParams, req.auth);
  return sendSuccess(res, 200, result);
}

export async function getById(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const course = await courseService.getCourseById(id, req.auth);
  return sendSuccess(res, 200, course);
}

export async function create(req, res) {
  const body = res.locals.input?.body || req.body;
  const course = await courseService.createCourse(body, req.auth);
  return sendSuccess(res, 201, course);
}

export async function update(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const body = res.locals.input?.body || req.body;
  const course = await courseService.updateCourse(id, body, req.auth);
  return sendSuccess(res, 200, course);
}

export async function setStatus(req, res) {
  const id = res.locals.input?.params?.id || req.params.id;
  const isActive = res.locals.input?.body?.isActive;
  const course = await courseService.setCourseStatus(id, isActive, req.auth);
  return sendSuccess(res, 200, course);
}
