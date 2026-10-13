import { AppError } from '../utils/app-error.js';

export function validate(schema) {
  return (request, response, next) => {
    const result = schema.safeParse({ body: request.body, params: request.params, query: request.query });
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'One or more request fields are invalid.', result.error.flatten()));
    }
    response.locals.input = result.data;
    return next();
  };
}
