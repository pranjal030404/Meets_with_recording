/**
 * How the web app carries its session: a cookie that page scripts cannot read, so an injected script cannot copy it
 * and use it elsewhere. The mobile app and other API clients keep sending `Authorization: Bearer`.
 *
 * Forgery from another site is stopped twice: the cookie is SameSite=Strict, and it only counts together with the
 * `X-Client: web` header, which a form cannot send and which another origin may not send without CORS permission.
 */
export const SESSION_COOKIE = 'mc_session';
export const ADMIN_COOKIE = 'mc_admin';

const PATHS = { [SESSION_COOKIE]: '/api', [ADMIN_COOKIE]: '/api/admin' };
const MAX_AGE = { [SESSION_COOKIE]: 7 * 24 * 3600, [ADMIN_COOKIE]: 12 * 3600 };

export const readCookie = (header, name) => {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

export const isWebClient = (req) => req.headers['x-client'] === 'web';

/** The caller's token: the Authorization header, or the named cookie when the web app is asking. */
export const tokenFrom = (req, cookie = SESSION_COOKIE) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return isWebClient(req) ? readCookie(req.headers.cookie, cookie) : null;
};

// `Secure` everywhere in production, except an installation that is deliberately plain http (a browser would drop it)
const secureFlag = (req) => (req.secure || (process.env.NODE_ENV === 'production' && !String(process.env.CLIENT_URL).startsWith('http://')) ? '; Secure' : '');

const write = (req, res, name, value, maxAge) => res.append('Set-Cookie', `${name}=${value}; Path=${PATHS[name]}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureFlag(req)}`);
export const setCookie = (req, res, name, token) => write(req, res, name, token, MAX_AGE[name]);
export const clearCookie = (req, res, name) => write(req, res, name, '', 0);

/** What a sign-in answer should carry: the web app gets the cookie and never sees the token; others get the token. */
export const handOver = (req, res, token, cookie = SESSION_COOKIE) => {
  if (!isWebClient(req)) return { token };
  setCookie(req, res, cookie, token);
  return {};
};
