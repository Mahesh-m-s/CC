/**
 * S3 Upload & Download Client Service for Mysuru Civic Connect.
 * Connects the React frontend to the Express backend (:4000) for
 * presigned URL acquisition, direct browser-to-S3 uploads, and verification.
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' ? process.env : {});
export const PRODUCTION_BACKEND_URL = 'https://mcc-backend-1uqx.onrender.com';

export function getApiBaseUrl() {
  if (env.VITE_API_BASE_URL) {
    return env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('onrender.com')) {
    return PRODUCTION_BACKEND_URL;
  }
  return 'http://localhost:4000';
}

/**
 * 1. Requests a short-lived presigned PUT URL from Express backend.
 * Includes automatic retry with sleep warm-up in case the Render backend free tier instance is spinning up.
 */
export async function requestPresignedUploadUrl({
  complaintId,
  fileName,
  contentType,
  fileSize,
  attachmentType = 'issue',
  token,
  retries = 2
}) {
  const baseUrl = getApiBaseUrl();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/uploads/presign`, {
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
    } catch (err) {
      lastError = err;
      const isNetworkError = err.name === 'TypeError' || err.message?.includes('Failed to fetch');
      if (isNetworkError && attempt < retries) {
        console.warn(`[S3 Upload] Presign attempt ${attempt + 1} failed. Pinging backend warm-up and retrying in 3s...`);
        fetch(`${baseUrl}/health`).catch(() => {});
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      break;
    }
  }

  if (lastError && (lastError.name === 'TypeError' || lastError.message?.includes('Failed to fetch'))) {
    throw new Error(
      `Cannot connect to backend (${baseUrl}). Render's free tier spins down inactive servers after 15 minutes; please wait 30-50 seconds for it to wake up and try again.`
    );
  }
  throw lastError;
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
  token,
  retries = 2
}) {
  const baseUrl = getApiBaseUrl();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/uploads/confirm`, {
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
    } catch (err) {
      lastError = err;
      const isNetworkError = err.name === 'TypeError' || err.message?.includes('Failed to fetch');
      if (isNetworkError && attempt < retries) {
        console.warn(`[S3 Upload] Confirm attempt ${attempt + 1} failed. Retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      break;
    }
  }

  if (lastError && (lastError.name === 'TypeError' || lastError.message?.includes('Failed to fetch'))) {
    throw new Error(
      `Cannot confirm upload with backend (${baseUrl}). Please check backend status and retry.`
    );
  }
  throw lastError;
}

/**
 * 4. Requests a short-lived presigned GET URL from Express backend to view private S3 images.
 */
export async function requestPresignedDownloadUrl({ complaintId, objectKey, token, retries = 1 }) {
  const baseUrl = getApiBaseUrl();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/uploads/download-url`, {
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
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      break;
    }
  }

  throw lastError;
}
