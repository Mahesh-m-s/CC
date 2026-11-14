import crypto from 'node:crypto';
import path from 'node:path';

// Max file size: 5 MB
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Permitted image MIME types
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

// Permitted extensions
export const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp'
]);

// Permitted attachment types
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  'issue',
  'resolution'
]);

/**
 * Validates file upload metadata before generating presigned URL.
 * Returns { valid: boolean, error?: string, extension?: string }
 */
export function validateUploadMetadata({ fileName, contentType, fileSize, attachmentType }) {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'A valid fileName string is required.' };
  }

  if (!contentType || typeof contentType !== 'string') {
    return { valid: false, error: 'A valid contentType MIME string is required.' };
  }

  const normalizedContentType = contentType.toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedContentType)) {
    return { 
      valid: false, 
      error: `Unsupported content type '${contentType}'. Only JPG, JPEG, PNG, and WEBP images are accepted.` 
    };
  }

  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { 
      valid: false, 
      error: `Unsupported file extension '${ext}'. Accepted extensions: .jpg, .jpeg, .png, .webp.` 
    };
  }

  if (typeof fileSize === 'number') {
    if (fileSize <= 0) {
      return { valid: false, error: 'File size must be greater than 0 bytes.' };
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return { 
        valid: false, 
        error: `File size exceeds the 5 MB limit. Provided size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB.` 
      };
    }
  }

  if (!attachmentType || !ALLOWED_ATTACHMENT_TYPES.has(attachmentType)) {
    return { 
      valid: false, 
      error: `Invalid attachmentType '${attachmentType}'. Must be either 'issue' or 'resolution'.` 
    };
  }

  return { 
    valid: true, 
    extension: ext || (normalizedContentType === 'image/png' ? '.png' : (normalizedContentType === 'image/webp' ? '.webp' : '.jpg'))
  };
}

/**
 * Generates an isolated, collision-free S3 object key matching the requested format:
 * complaints/<complaint-id>/<timestamp>-<random>.<ext>
 * resolutions/<complaint-id>/<timestamp>-<random>.<ext>
 */
export function generateObjectKey(complaintId, attachmentType, extension) {
  const folder = attachmentType === 'resolution' ? 'resolutions' : 'complaints';
  const cleanComplaintId = String(complaintId).replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const cleanExt = extension.startsWith('.') ? extension : `.${extension}`;

  return `${folder}/${cleanComplaintId}/${timestamp}-${randomSuffix}${cleanExt}`;
}

/**
 * Verifies that an objectKey strictly belongs to a specific complaint ID and attachmentType folder.
 */
export function verifyObjectKeyScope(objectKey, complaintId, attachmentType) {
  if (!objectKey || typeof objectKey !== 'string') return false;
  const folder = attachmentType === 'resolution' ? 'resolutions' : 'complaints';
  const cleanComplaintId = String(complaintId).replace(/[^a-zA-Z0-9_-]/g, '');
  const prefix = `${folder}/${cleanComplaintId}/`;
  return objectKey.startsWith(prefix);
}

