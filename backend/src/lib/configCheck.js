/**
 * Settings that make a production server unsafe. Used at start (the "fatal" ones stop it) and by the pre-deploy check.
 */
export const jwtSecretProblem = (secret) => {
  if (!secret) return 'JWT_SECRET is not set';
  if (/change|your-super-secret|example|secret-key/i.test(secret)) return 'JWT_SECRET is still an example value';
  if (secret.length < 32) return 'JWT_SECRET is shorter than 32 characters';
  return null;
};

export const checkConfig = (env = process.env) => {
  const fatal = [];
  const warnings = [];
  const jwt = jwtSecretProblem(env.JWT_SECRET);
  if (jwt) fatal.push(`${jwt}. Make one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  if (env.BILLING_DEMO_MODE === 'true') warnings.push('BILLING_DEMO_MODE is on: anyone can activate paid plans without paying');
  if (!env.CLIENT_URL) warnings.push('CLIENT_URL is not set: set it to the public https address (CORS and emailed links depend on it)');
  else if (!/^https:\/\//.test(env.CLIENT_URL)) warnings.push('CLIENT_URL is not https');
  if (!env.DB_PASSWORD) warnings.push('DB_PASSWORD is empty');
  if (env.DB_USER === 'root') warnings.push('The app signs in to the database as root: give it its own user limited to its database');
  if (!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS)) warnings.push('SMTP is not set: password reset, invitations and reminders will not work');
  if (!env.TURN_SECRET && !env.TURN_SERVER_URL) warnings.push('No TURN server: calls will fail for people behind strict firewalls');
  else if (!env.TURN_SECRET) warnings.push('TURN uses one fixed password given to every user: set TURN_SECRET and TURN_URLS instead');
  if (!env.MEDIASOUP_ANNOUNCED_IP) warnings.push('MEDIASOUP_ANNOUNCED_IP is not set: calls from other machines will not connect');
  if (!env.REDIS_URL) warnings.push('No Redis: only one app process may run');
  if (!env.LEGAL_NAME || !env.LEGAL_CONTACT) warnings.push('LEGAL_NAME / LEGAL_CONTACT are not set: no privacy notice or terms are shown');
  if (!env.CLAMAV_HOST) warnings.push('Uploads are not virus-scanned (set CLAMAV_HOST to enable)');
  return { fatal, warnings };
};
