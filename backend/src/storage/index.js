import path from 'path';
import { fileURLToPath } from 'url';
import { createLocalDriver } from './localDriver.js';
import { createS3Driver } from './s3Driver.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let driver = null;

/** STORAGE_DRIVER=local (default) | s3. Lazily created so tests/CLI can set env first. */
export const getStorage = () => {
  if (driver) return driver;
  const kind = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if (kind === 's3') {
    driver = createS3Driver({
      bucket: process.env.S3_BUCKET, region: process.env.S3_REGION || 'us-east-1', endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', prefix: process.env.S3_PREFIX || '',
    });
  } else {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET required to sign local storage URLs');
    driver = createLocalDriver({ root: path.resolve(here, '../../uploads'), secret: `storage:${process.env.JWT_SECRET}` });
  }
  return driver;
};
export const _setStorageForTests = (d) => { driver = d; };
