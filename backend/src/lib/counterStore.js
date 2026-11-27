import crypto from 'crypto';
import { Op } from 'sequelize';
import AttemptCounter from '../models/AttemptCounter.js';

const keyOf = (id) => (id.length <= 190 ? id : crypto.createHash('sha256').update(id).digest('hex'));

export const counterStore = {
  async hit(id, windowMs) {
    const now = Date.now();
    // one statement, so two wrong guesses at once are both counted
    await AttemptCounter.sequelize.query(
      `INSERT INTO AttemptCounters (\`key\`, n, resetAt) VALUES (:key, 1, :resetAt)
       ON DUPLICATE KEY UPDATE n = IF(resetAt <= :now, 1, n + 1), resetAt = IF(resetAt <= :now, :resetAt, resetAt)`,
      { replacements: { key: keyOf(id), resetAt: now + windowMs, now } }
    );
    return this.count(id);
  },
  async count(id) {
    const row = await AttemptCounter.findByPk(keyOf(id), { raw: true });
    return row && Number(row.resetAt) > Date.now() ? row.n : 0;
  },
  async reset(id) { await AttemptCounter.destroy({ where: { key: keyOf(id) } }); },
  async prune() { await AttemptCounter.destroy({ where: { resetAt: { [Op.lte]: Date.now() } } }); }
};
