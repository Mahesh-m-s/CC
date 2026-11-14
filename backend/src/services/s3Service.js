import { PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, AWS_S3_BUCKET, isAwsConfigured } from '../config/aws.js';

// Expiry times in seconds
export const UPLOAD_URL_EXPIRY_SECONDS = 300; // 5 minutes
export const DOWNLOAD_URL_EXPIRY_SECONDS = 900; // 15 minutes

/**
 * Generates a short-lived presigned PUT URL for direct browser-to-S3 upload.
 */
export async function getPresignedUploadUrl({ objectKey, contentType, metadata = {} }) {
  if (!isAwsConfigured()) {
    throw new Error('AWS S3 is not configured on the backend. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in backend/.env.');
  }

  const putParams = {
    Bucket: AWS_S3_BUCKET,
    Key: objectKey,
    ContentType: contentType
  };

  if (metadata && Object.keys(metadata).length > 0) {
    putParams.Metadata = metadata;
  }

  const command = new PutObjectCommand(putParams);

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS
  });

  return {
    uploadUrl,
    objectKey,
    bucket: AWS_S3_BUCKET,
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS
  };
}

/**
 * Generates a short-lived presigned GET URL for viewing private complaint images.
 */
export async function getPresignedDownloadUrl({ objectKey }) {
  if (!isAwsConfigured()) {
    throw new Error('AWS S3 is not configured on the backend. Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in backend/.env.');
  }

  const command = new GetObjectCommand({
    Bucket: AWS_S3_BUCKET,
    Key: objectKey
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS
  });

  return {
    downloadUrl,
    objectKey,
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS
  };
}

/**
 * Checks whether an object actually exists in the S3 bucket using HeadObjectCommand.
 * Prevents phantom attachment records in the database.
 */
export async function checkObjectExists({ objectKey }) {
  if (!isAwsConfigured()) {
    throw new Error('AWS S3 is not configured on the backend.');
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: objectKey
    });
    const headResult = await s3Client.send(command);
    return {
      exists: true,
      contentLength: headResult.ContentLength,
      contentType: headResult.ContentType,
      lastModified: headResult.LastModified,
      metadata: headResult.Metadata || {}
    };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw err;
  }
}

