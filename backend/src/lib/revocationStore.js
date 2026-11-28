import { Op } from 'sequelize';
import RevokedSession from '../models/RevokedSession.js';

export const revocationStore = {
  async save(key, value, expiresAtMs) {
    await RevokedSession.upsert({ key, value, expiresAt: new Date(expiresAtMs) });
  },
  async load() {
    await RevokedSession.sync();
    await RevokedSession.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
    return RevokedSession.findAll({ raw: true });
  }
};
