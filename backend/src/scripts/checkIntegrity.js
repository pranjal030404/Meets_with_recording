/**
 * Report rows that point at something missing:   npm run check-integrity
 * Repair them and add the constraints:           npm run check-integrity -- --fix     (back up first)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { sequelize } = await import('../database/index.js');
const { RELATIONS, hasForeignKey, tableExists, countOrphans, repairOrphans, addForeignKey } = await import('../database/relations.js');

const fix = process.argv.includes('--fix');
let open = 0;
for (const relation of RELATIONS) {
  const [table, column, target, onDelete] = relation;
  if (!(await tableExists(sequelize, table)) || await hasForeignKey(sequelize, relation)) continue;
  const orphans = await countOrphans(sequelize, relation);
  const what = onDelete === 'SET NULL' ? 'the reference would be cleared' : onDelete === 'CASCADE' ? 'the rows would be deleted' : 'needs your decision';
  if (orphans) console.log(`${table}.${column} -> ${target}: ${orphans} orphan(s), ${what}`);
  if (fix && (!orphans || await repairOrphans(sequelize, relation))) {
    await addForeignKey(sequelize, relation);
    console.log(`${table}.${column}: constraint added`);
  } else open += 1;
}
console.log(open ? `${open} constraint(s) still missing${fix ? '.' : '. Run with --fix after a backup.'}` : 'All constraints are in place.');
await sequelize.close();
process.exit(0);
