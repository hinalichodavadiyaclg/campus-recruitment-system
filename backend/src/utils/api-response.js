export function sendSuccess(response, statusCode, data) {
  return response.status(statusCode).json({ success: true, data });
}
