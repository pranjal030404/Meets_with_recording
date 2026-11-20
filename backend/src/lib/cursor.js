import { Op } from 'sequelize';

/**
 * Keyset (cursor) pagination for "newest first" lists ordered by (createdAt DESC, id DESC).
 * Unlike OFFSET it stays O(limit) on deep pages and does not skip/duplicate rows when new rows arrive.
 * The id tiebreaker fixes the old `createdAt < before` approach, which dropped rows sharing a timestamp.
 * Cursors are opaque base64url strings: { t: ISO createdAt, id }.
 */

export const encodeCursor = (row) => Buffer.from(JSON.stringify({ t: new Date(row.createdAt).toISOString(), id: row.id })).toString('base64url');

export const decodeCursor = (cursor) => {
  if (!cursor || typeof cursor !== 'string' || cursor.length > 300) return null;
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const d = new Date(t);
    if (Number.isNaN(d.getTime()) || typeof id !== 'string' || id.length > 64) return null;
    return { createdAt: d, id };
  } catch { return null; }
};

/** WHERE fragment selecting rows strictly older than the cursor. */
export const olderThan = ({ createdAt, id }) => ({
  [Op.or]: [{ createdAt: { [Op.lt]: createdAt } }, { createdAt, id: { [Op.lt]: id } }],
});

export const ORDER_NEWEST_FIRST = [['createdAt', 'DESC'], ['id', 'DESC']];

export const clampLimit = (v, def = 50, max = 100) => Math.min(Math.max(parseInt(v) || def, 1), max);

/**
 * Fetch limit+1 rows to learn whether another page exists; returns { rows, nextCursor }.
 * `query(extraWhere, limit)` runs the actual findAll.
 */
export const pageNewestFirst = async ({ cursor, limit, query }) => {
  const c = decodeCursor(cursor);
  const rows = await query(c ? olderThan(c) : null, limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null };
};
