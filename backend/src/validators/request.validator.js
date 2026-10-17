import { AppError } from '../utils/app-error.js';

export function validate(schema) {
  return (request, response, next) => {
    const result = schema.safeParse({ body: request.body, params: request.params, query: request.query });
    if (!result.success) {
      const flattened = result.error.flatten();
      const detailedFieldErrors = { ...flattened.fieldErrors };
      result.error.issues.forEach((issue) => {
        if (issue.path.length > 1) {
          const fieldPath = issue.path.slice(1).join('.');
          if (!detailedFieldErrors[fieldPath]) {
            detailedFieldErrors[fieldPath] = [];
          }
          if (!detailedFieldErrors[fieldPath].includes(issue.message)) {
            detailedFieldErrors[fieldPath].push(issue.message);
          }
        }
      });
      return next(new AppError(400, 'VALIDATION_ERROR', 'One or more request fields are invalid.', {
        ...flattened,
        fieldErrors: detailedFieldErrors
      }));
    }
    response.locals.input = result.data;
    return next();
  };
}
