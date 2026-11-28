/**
 * 023 - Foreign keys. Nothing is deleted or changed: where existing rows point at something that is gone, that
 * constraint is left out with a warning. `npm run check-integrity` shows them and can repair them.
 */
import { sequelize } from '../index.js';
import { RELATIONS, nameOf, hasForeignKey, tableExists, countOrphans, addForeignKey } from '../relations.js';

export async function up() {
  // some of these tables are only created by their models
  await import('../../models/associations.js');
  for (const name of ['Admin', 'RevokedSession', 'MeetingUser', 'TeamUser']) await (await import(`../../models/${name}.js`)).default.sync();
  await sequelize.sync();

  for (const relation of RELATIONS) {
    const [table, column, target] = relation;
    if (!(await tableExists(sequelize, table)) || !(await tableExists(sequelize, target))) continue;
    if (await hasForeignKey(sequelize, relation)) continue;
    const orphans = await countOrphans(sequelize, relation);
    if (orphans) console.warn(`  WARNING ${table}.${column}: ${orphans} row(s) point at a missing ${target} row; constraint not added (npm run check-integrity)`);
    else await addForeignKey(sequelize, relation);
  }
}

export async function down(queryInterface) {
  for (const relation of RELATIONS) await queryInterface.removeConstraint(relation[0], nameOf(relation)).catch(() => {});
}
