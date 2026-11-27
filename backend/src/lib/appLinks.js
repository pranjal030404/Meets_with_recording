/**
 * Links that leave the server (notifications, email) use the configured address, never the request's Host
 * header, which the caller chooses.
 */
export const publicBaseUrl = (req) => {
  const configured = process.env.APP_URL || process.env.CLIENT_URL;
  if (configured) return configured.trim().replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
};
