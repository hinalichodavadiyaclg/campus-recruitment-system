/**
 * Structured activity logging accepts only safe event metadata. Callers must never supply passwords,
 * raw session tokens, token hashes, or reset tokens.
 */
export function logActivity(event, metadata = {}) {
  const safeMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), event, ...safeMetadata }));
}
