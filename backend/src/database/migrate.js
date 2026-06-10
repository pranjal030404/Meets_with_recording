import { sequelize } from './index.js';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, 'migrations');

async function runMigrations() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    const queryInterface = sequelize.getQueryInterface();

    const migrationFiles = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`Running migration: ${file}`);
      const migration = await import(`file://${path.join(migrationsDir, file)}`);
      await migration.up(queryInterface, sequelize.Sequelize);
      console.log(`Completed migration: ${file}`);
    }

    console.log('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
