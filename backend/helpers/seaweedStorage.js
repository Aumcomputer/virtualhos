const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

let s3Client = null;
let bucketChecked = false;

/**
 * Return true if SeaweedFS S3 endpoint and bucket are configured in env.
 */
function isSeaweedConfigured() {
  return Boolean(
    process.env.SEAWEEDFS_S3_ENDPOINT &&
    process.env.SEAWEEDFS_S3_BUCKET
  );
}

/**
 * Format an S3 SDK error with explicit Code, HTTP status, and message.
 */
function formatS3Error(err) {
  const code = err?.Code || err?.name || 'S3Error';
  const status = err?.$metadata?.httpStatusCode;
  const detail = err?.message || 'Unknown S3 error';
  const statusPart = status ? ` (HTTP ${status})` : '';
  return new Error(`${code}${statusPart}: ${detail}`);
}

/**
 * Lazily construct S3Client configured for SeaweedFS S3 Gateway (path-style).
 */
function getS3Client() {
  if (s3Client) return s3Client;
  const endpoint = process.env.SEAWEEDFS_S3_ENDPOINT;
  if (!endpoint) {
    throw new Error('SEAWEEDFS_S3_ENDPOINT is not configured');
  }
  s3Client = new S3Client({
    endpoint,
    region: process.env.SEAWEEDFS_S3_REGION || 'us-east-1',
    forcePathStyle: process.env.SEAWEEDFS_S3_FORCE_PATH_STYLE !== 'false',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: process.env.SEAWEEDFS_S3_ACCESS_KEY || 'anonymous',
      secretAccessKey: process.env.SEAWEEDFS_S3_SECRET_KEY || 'anonymous',
    },
  });
  return s3Client;
}

/**
 * Ensure the configured SeaweedFS bucket exists, creating it if missing.
 */
async function ensureBucketExists() {
  if (bucketChecked) return;
  const bucket = process.env.SEAWEEDFS_S3_BUCKET;
  if (!bucket) throw new Error('SEAWEEDFS_S3_BUCKET is not configured');
  const client = getS3Client();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    bucketChecked = true;
  } catch (err) {
    const statusCode = err?.$metadata?.httpStatusCode;
    if (statusCode === 404 || err?.name === 'NotFound' || err?.Code === 'NoSuchBucket') {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      bucketChecked = true;
    } else {
      throw err;
    }
  }
}

const MIME_EXT_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'text/plain': 'txt',
};

/**
 * Map a MIME type (or fallback filename) to a safe file extension without dot.
 */
function extensionFromMime(mime, fallbackFilename = '') {
  const cleanMime = String(mime || '').split(';')[0].trim().toLowerCase();
  if (MIME_EXT_MAP[cleanMime]) {
    return MIME_EXT_MAP[cleanMime];
  }
  if (fallbackFilename) {
    const ext = path.extname(fallbackFilename).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (ext) return ext;
  }
  return 'bin';
}

/**
 * Upload a media Buffer to SeaweedFS S3 Gateway under inbound/outbound YYYY/MM folder.
 */
async function uploadMediaBuffer(buffer, {
  direction = 'inbound',
  contentType = 'application/octet-stream',
  filename = '',
} = {}) {
  const bucket = process.env.SEAWEEDFS_S3_BUCKET;
  if (!bucket) throw new Error('SEAWEEDFS_S3_BUCKET is not configured');
  const client = getS3Client();
  const prefix = (process.env.SEAWEEDFS_S3_PREFIX || 'line-chat').replace(/^\/+|\/+$/g, '');

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const safeDir = direction === 'outbound' ? 'outbound' : 'inbound';
  const ext = extensionFromMime(contentType, filename);
  const key = `${prefix}/${safeDir}/${yyyy}/${mm}/${crypto.randomUUID()}.${ext}`;

  const putParams = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  };

  try {
    await client.send(new PutObjectCommand(putParams));
  } catch (err) {
    const statusCode = err?.$metadata?.httpStatusCode;
    if (err?.Code === 'NoSuchBucket' || err?.name === 'NoSuchBucket' || statusCode === 404) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        bucketChecked = true;
        await client.send(new PutObjectCommand(putParams));
      } catch (retryErr) {
        throw formatS3Error(retryErr);
      }
    } else {
      throw formatS3Error(err);
    }
  }

  return {
    key,
    contentType: contentType || 'application/octet-stream',
    size: buffer.length,
  };
}

/**
 * Retrieve a stored media object stream from SeaweedFS S3 Gateway.
 */
async function getMediaObject(key) {
  const client = getS3Client();
  const bucket = process.env.SEAWEEDFS_S3_BUCKET;
  if (!bucket) throw new Error('SEAWEEDFS_S3_BUCKET is not configured');
  try {
    const res = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));
    return {
      body: res.Body,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  } catch (err) {
    throw formatS3Error(err);
  }
}

function getMediaSigningSecret() {
  return process.env.LINE_CHANNEL_SECRET || process.env.JWT_SECRET || 'vhos-media-key';
}

/**
 * Create an HMAC-SHA256 hex signature authorizing LINE to fetch an outbound image.
 */
function signOutboundMediaId(messageId) {
  return crypto
    .createHmac('sha256', getMediaSigningSecret())
    .update(`outbound-media:${String(messageId)}`)
    .digest('hex');
}

/**
 * Verify an outbound media HMAC signature in constant time.
 */
function verifyOutboundMediaSig(messageId, sig) {
  if (!sig || typeof sig !== 'string') return false;
  const expected = signOutboundMediaId(messageId);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(sig.trim(), 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Build the HTTPS URL returned to LINE Messaging API for an outbound image message.
 */
function buildPublicOutboundMediaUrl(messageId) {
  const fallbackBase = `${(process.env.RBH_TELEMED_URL || 'https://telemed.rajburi.org').replace(/\/+$/, '')}/api/webhook`;
  const base = (process.env.LINE_WEBHOOK_PUBLIC_BASE_URL || fallbackBase).replace(/\/+$/, '');
  const sig = signOutboundMediaId(messageId);
  return `${base}/media/${encodeURIComponent(String(messageId))}?sig=${sig}`;
}

/**
 * Pipe an S3 GetObject result body safely to an Express response.
 */
async function pipeMediaObjectToResponse(res, obj, { fallbackSize = null, isHead = false } = {}) {
  const len = obj.contentLength ?? fallbackSize;
  if (len != null) {
    res.setHeader('Content-Length', String(Number(len)));
  }
  if (isHead) {
    return res.status(200).end();
  }
  if (obj.body && typeof obj.body.pipe === 'function') {
    obj.body.on('error', (streamErr) => {
      console.error('[seaweedStorage] Stream error:', streamErr.message);
      if (!res.headersSent) {
        res.status(502).end();
      } else {
        res.destroy();
      }
    });
    return obj.body.pipe(res);
  }
  const bytes = await obj.body.transformToByteArray();
  return res.send(Buffer.from(bytes));
}

module.exports = {
  isSeaweedConfigured,
  ensureBucketExists,
  extensionFromMime,
  uploadMediaBuffer,
  getMediaObject,
  signOutboundMediaId,
  verifyOutboundMediaSig,
  buildPublicOutboundMediaUrl,
  pipeMediaObjectToResponse,
};
