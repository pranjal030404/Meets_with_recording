/**
 * Request checks shared by every route: types and lengths of the common fields and sane paging values, so bad
 * input is a 400 with a plain message instead of a database or JavaScript error.
 */
const TEXT = { title: 255, name: 100, description: 2000, content: 2000, answer: 2000, question: 2000, email: 255, password: 200, newPassword: 200, currentPassword: 200, channelType: 80, text: 200000 };
const DATES = ['scheduledAt', 'dueDate', 'statusExpiresAt'];
const ONE_OF = { priority: ['low', 'medium', 'high', 'urgent', 'normal'], billingInterval: ['monthly', 'yearly'] };
const MAX_PAGE_SIZE = 2000;
const IDS = ['teamId', 'meetingId', 'assigneeId', 'userId', 'parentId', 'messageId', 'conversationId', 'roomId', 'recipientId', 'replyTo', 'replyToId'];
const NULL_IS_ABSENT = ['userIds', 'labels', 'invitees', 'type']; // so that the route's default applies
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const bad = (res, message) => res.status(400).json({ success: false, message });

export const validateRequest = (req, res, next) => {
  const { limit, page, before } = req.query;
  if (limit !== undefined) {
    if (!/^\d+$/.test(String(limit)) || Number(limit) < 1) return bad(res, 'limit must be a positive number');
    if (Number(limit) > MAX_PAGE_SIZE) req.query.limit = String(MAX_PAGE_SIZE);
  }
  if (page !== undefined && (!/^\d+$/.test(String(page)) || Number(page) < 1 || Number(page) > 1e6)) return bad(res, 'page must be a positive number');
  if (before !== undefined && Number.isNaN(new Date(before).getTime())) return bad(res, 'before must be a date');
  for (const [key, value] of Object.entries(req.query)) {
    // arrays / nested objects from `?a[]=` reach code that expects text
    if (typeof value !== 'string') return bad(res, `${key} must be a single value`);
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return next();
  for (const [key, max] of Object.entries(TEXT)) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return bad(res, `${key} must be text`);
    if (value.length > max) return bad(res, `${key} is too long (max ${max} characters)`);
  }
  for (const key of IDS) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') return bad(res, `${key} must be an id`);
  }
  for (const key of NULL_IS_ABSENT) if (body[key] === null) delete body[key];
  if (Array.isArray(body.invitees)) {
    // entries that are not objects were never usable; an object with a non-text id or address is a mistake worth reporting
    body.invitees = body.invitees.filter(isObject);
    if (body.invitees.some((i) => ['userId', 'email'].some((k) => i[k] !== undefined && i[k] !== null && typeof i[k] !== 'string'))) return bad(res, 'invitees need a text userId or email');
  }
  if (Array.isArray(body.userIds) && body.userIds.some((id) => typeof id !== 'string')) return bad(res, 'userIds must be ids');
  for (const key of DATES) {
    if (body[key] && Number.isNaN(new Date(body[key]).getTime())) return bad(res, `${key} is not a valid date`);
  }
  for (const [key, allowed] of Object.entries(ONE_OF)) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '' && !allowed.includes(body[key])) return bad(res, `${key} must be one of: ${allowed.join(', ')}`);
  }
  next();
};

/** multer hands over UTF-8 filenames as latin1 ("résumé" arrives as "rÃ©sumÃ©"). */
export const fixUploadName = (req, file, callback) => {
  const name = file.originalname || '';
  // only re-decode when every character fits in one byte and the result is valid UTF-8
  if (/^[\x00-\xff]*$/.test(name)) {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (!decoded.includes('�')) file.originalname = decoded;
  }
  callback(null, true);
};
