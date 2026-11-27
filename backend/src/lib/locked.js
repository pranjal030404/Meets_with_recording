import { Transaction } from 'sequelize';
import { sequelize } from '../database/index.js';

/**
 * Read-modify-write of one row that cannot lose a concurrent change: the row is locked (SELECT ... FOR UPDATE)
 * while `mutate` runs, so joins, votes and reactions that arrive together are applied one after another.
 * `mutate(row)` may edit JSON values in place. Returning false saves nothing. Resolves { row, result }, or null
 * when the row does not exist. Keep `mutate` quick and free of other writes to the same row.
 */
export const updateLocked = (Model, id, mutate) => sequelize.transaction(
  { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
  async (transaction) => {
    const row = await Model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) return null;
    const result = await mutate(row);
    if (result !== false) await row.save({ transaction });
    return { row, result };
  }
);
