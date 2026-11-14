/**
 * S3 Upload & Download Client Service for Mysuru Civic Connect.
 * Connects the React frontend to the Express backend (:4000) for
 * presigned URL acquisition, direct browser-to-S3 uploads, and verification.
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? process.env : {});
const API_BASE_URL = (env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');

/**
 * 1. Requests a short-lived presigned PUT URL from Express backend.
 */
export async function requestPresignedUploadUrl({
  complaintId,
  fileName,
  contentType,
  fileSize,
  attachmentType = 'issue',
  token
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/uploads/presign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      complaintId,
      fileName,
      contentType,
      fileSize,
      attachmentType
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to get presigned upload URL (${response.status})`);
  }

  return data; // { success, uploadUrl, objectKey, bucket, expiresInSeconds }
}

/**
 * 2. Uploads raw binary image file directly from browser to AWS S3 using presigned PUT URL.
 * NOTE: The file travels directly to S3 without passing through Express.
 */
export async function uploadBinaryToS3({ uploadUrl, file, contentType, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.open('PUT', uploadUrl, true);
    // Explicitly set exact Content-Type negotiated with presigner
    xhr.setRequestHeader('Content-Type', contentType || file.type || 'image/jpeg');

    xhr.onload = () => {
      // S3 PUT returns 200 OK on success
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true, status: xhr.status });
      } else {
        console.error('[S3 Upload] HTTP error:', xhr.status, xhr.statusText, xhr.responseText);
        reject(new Error(`S3 direct upload failed with status ${xhr.status}: ${xhr.statusText || 'Upload rejected'}`));
      }
    };

    xhr.onerror = (e) => {
      console.error('[S3 Upload] Network / CORS error event:', e, 'ReadyState:', xhr.readyState, 'Status:', xhr.status);
      reject(new Error('Network error during direct S3 image upload. Check S3 CORS configuration in AWS Console.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('S3 image upload timed out. Please check your internet connection.'));
    };

    xhr.send(file);
  });
}

/**
 * 3. Confirms that the upload succeeded in S3, triggers backend HeadObject check,
 * and saves attachment metadata into Supabase PostgreSQL.
 */
export async function confirmUploadWithBackend({
  complaintId,
  objectKey,
  attachmentType = 'issue',
  fileName,
  fileSize,
  token
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/uploads/confirm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      complaintId,
      objectKey,
      attachmentType,
      fileName,
      fileSize
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to confirm upload (${response.status})`);
  }

  return data; // { success, message, attachment }
}

/**
 * 4. Requests a short-lived presigned GET URL from Express backend to view private S3 images.
 */
export async function requestPresignedDownloadUrl({ complaintId, objectKey, token }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api/uploads/download-url`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      complaintId,
      objectKey
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `Failed to get download URL (${response.status})`);
  }

  return data; // { success, downloadUrl, objectKey, expiresInSeconds }
}
