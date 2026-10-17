/**
 * Route resolution helper for public certificate verification URLs.
 * Handles canonical route and alias routes:
 * - Canonical: #/verify-certificate/:code
 * - Short Alias: #/verify/:code
 * - Structured Alias: #/certificates/verify/:code
 *
 * @param {string} pathname
 * @returns {{ isVerifyRoute: boolean, code: string }}
 */
export function parseCertificateVerificationRoute(pathname) {
  const parts = (pathname || '').split('/').filter(Boolean);
  const isVerifyRoute =
    parts[0] === 'verify-certificate' ||
    parts[0] === 'verify' ||
    (parts[0] === 'certificates' && parts[1] === 'verify');

  if (!isVerifyRoute) {
    return { isVerifyRoute: false, code: '' };
  }

  let rawCode = '';
  if (parts[0] === 'verify-certificate' || parts[0] === 'verify') {
    rawCode = parts[1] || '';
  } else if (parts[0] === 'certificates' && parts[1] === 'verify') {
    rawCode = parts[2] || '';
  }

  const code = rawCode ? decodeURIComponent(rawCode) : '';
  return { isVerifyRoute: true, code };
}
