
import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

export const AWS_REGION =
  process.env.AWS_REGION || 'ap-southeast-1';

export const AWS_S3_BUCKET =
  process.env.AWS_S3_BUCKET || '';

export const AWS_ACCESS_KEY_ID =
  process.env.AWS_ACCESS_KEY_ID || '';

export const AWS_SECRET_ACCESS_KEY =
  process.env.AWS_SECRET_ACCESS_KEY || '';

export function isAwsConfigured() {
  return Boolean(
    AWS_REGION &&
    AWS_S3_BUCKET &&
    AWS_ACCESS_KEY_ID &&
    AWS_SECRET_ACCESS_KEY &&
    !AWS_ACCESS_KEY_ID.includes('your-aws')
  );
}

export const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: isAwsConfigured()
    ? {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    : undefined
});
