import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { assertSafeKey } from './keys.js';

/**
 * S3-compatible driver (AWS S3, MinIO, R2, GCS-interop). The bucket MUST be private (no public ACL/policy):
 * all access is through short-lived presigned URLs. If CDN_BASE_URL is set, downloads still use presigned
 * URLs on the S3 endpoint; a CDN (CloudFront signed URLs/cookies) is a deployment-side addition, not done here.
 * Credentials come from the standard AWS provider chain / env (never from code).
 */
export const createS3Driver = ({ bucket, region, endpoint, forcePathStyle, prefix = '' }) => {
  if (!bucket) throw new Error('S3_BUCKET is required for STORAGE_DRIVER=s3');
  const client = new S3Client({ region, ...(endpoint ? { endpoint } : {}), ...(forcePathStyle ? { forcePathStyle: true } : {}) });
  const k = (key) => `${prefix}${assertSafeKey(key)}`;

  return {
    name: 's3',
    client,
    async putObject(key, body, { contentType } = {}) {
      if (Buffer.isBuffer(body) || typeof body === 'string') await client.send(new PutObjectCommand({ Bucket: bucket, Key: k(key), Body: body, ContentType: contentType }));
      else await new Upload({ client, params: { Bucket: bucket, Key: k(key), Body: body, ContentType: contentType } }).done(); // streams, multipart under the hood
    },
    async headObject(key) {
      try { const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: k(key) })); return { size: r.ContentLength }; } catch { return null; }
    },
    /** Stream an object to a local file (used by workers on another node than the one that received the upload). */
    async downloadToFile(key, dest) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: k(key) }));
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await pipeline(r.Body, fs.createWriteStream(dest));
    },
    async deleteObject(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: k(key) })); },
    /** Everything stored under one folder, including copies the database no longer points at. */
    async deleteFolder(folder) {
      const Prefix = `${k(folder)}/`;
      let ContinuationToken;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
        for (const { Key } of page.Contents || []) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
    },
    getSignedDownloadUrl(key, { expiresSec = 300, filename } = {}) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucket, Key: k(key),
        ...(filename ? { ResponseContentDisposition: `attachment; filename="${String(filename).replace(/[^\w.\- ]/g, '_')}"` } : {}),
      }), { expiresIn: expiresSec });
    },
    /** Browser PUTs the file straight to storage (bypasses Node). Size/type are pinned by the signature. */
    getSignedUploadUrl(key, { contentType, expiresSec = 900 } = {}) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: k(key), ContentType: contentType }), { expiresIn: expiresSec, signableHeaders: new Set(['content-type']) });
    },
    // Multipart for large recordings: client uploads parts in parallel to presigned part URLs
    async createMultipart(key, { contentType } = {}) {
      const r = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: k(key), ContentType: contentType }));
      return { uploadId: r.UploadId };
    },
    getSignedPartUrl(key, uploadId, partNumber, { expiresSec = 900 } = {}) {
      return getSignedUrl(client, new UploadPartCommand({ Bucket: bucket, Key: k(key), UploadId: uploadId, PartNumber: partNumber }), { expiresIn: expiresSec });
    },
    async completeMultipart(key, uploadId, parts) {
      await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: k(key), UploadId: uploadId, MultipartUpload: { Parts: parts.map((p) => ({ ETag: p.etag, PartNumber: p.partNumber })) } }));
    },
    async abortMultipart(key, uploadId) { await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: k(key), UploadId: uploadId })); },
  };
};
