import fs from 'fs';
import { getStorage } from './index.js';

/**
 * After a file has been written locally (multer), move it to object storage when STORAGE_DRIVER=s3.
 * Local copy is deleted ONLY after the upload succeeded; on failure the local file stays and keeps being served.
 * @returns {Promise<boolean>} true if the object now lives in object storage
 */
export const moveToObjectStorage = async (key, localPath, contentType, storage = getStorage()) => {
  if (storage.name !== 's3') return false;
  try {
    await storage.putObject(key, fs.createReadStream(localPath), { contentType });
    await fs.promises.unlink(localPath).catch(() => {});
    return true;
  } catch (e) {
    console.error(`[storage] upload of ${key} failed, keeping local copy: ${e.message}`);
    return false;
  }
};
