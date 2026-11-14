
import { Router } from 'express';
import { randomUUID } from 'crypto';

import { requireAuth } from '../middleware/authMiddleware.js';
import { getAuthenticatedSupabaseClient } from '../config/supabase.js';

import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  checkObjectExists
} from '../services/s3Service.js';

const router = Router();

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function safeFileName(name = 'image.jpg') {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}

// Reusable complaint ownership verification
async function verifyComplaint(db, complaintId, req) {
  const { data: complaint, error } = await db
    .from('complaints')
    .select('id, citizen_id, complaint_code')
    .eq('id', complaintId)
    .maybeSingle();

  if (error) {
    console.error('[UPLOAD] Complaint lookup error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      complaintId,
      authenticatedUser: req.user.id
    });

    throw new Error(`Complaint lookup failed: ${error.message}`);
  }

  if (!complaint) {
    console.error('[UPLOAD DEBUG] Complaint not visible to authenticated user:', {
      authenticatedUser: req.user.id,
      complaintId,
      userRole: req.user.role
    });

    return null;
  }

  if (
    req.user.role === 'citizen' &&
    complaint.citizen_id !== req.user.id
  ) {
    return false;
  }

  return complaint;
}


// ============================================================
// 1. GENERATE S3 PRESIGNED UPLOAD URL
// POST /api/uploads/presign
// ============================================================

router.post('/presign', requireAuth, async (req, res) => {
  try {
    const { complaintId, fileName, contentType } = req.body;

    console.log('[UPLOAD DEBUG]', {
      authenticatedUser: req.user.id,
      complaintId,
      userRole: req.user.role,
      fileName,
      contentType
    });

    if (!complaintId || !fileName || !contentType) {
      return res.status(400).json({
        success: false,
        error: 'complaintId, fileName and contentType are required.'
      });
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Only JPEG, PNG and WEBP images are supported.'
      });
    }

    const db = getAuthenticatedSupabaseClient(req.token);

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Supabase is not configured.'
      });
    }

    const complaint = await verifyComplaint(db, complaintId, req);

    if (complaint === null) {
      return res.status(404).json({
        success: false,
        error: 'Complaint not found or not visible under current Supabase permissions.'
      });
    }

    if (complaint === false) {
      return res.status(403).json({
        success: false,
        error: 'You cannot upload files to another citizen’s complaint.'
      });
    }

    const objectKey =
      `complaints/${complaintId}/${randomUUID()}-${safeFileName(fileName)}`;

    const result = await getPresignedUploadUrl({
      objectKey,
      contentType,
      metadata: {
        'complaint-id': complaintId,
        'uploaded-by': req.user.id
      }
    });

    console.log('[UPLOAD] Presigned URL generated:', {
      complaintId,
      objectKey,
      user: req.user.id
    });

    return res.status(200).json({
      success: true,
      message: 'Upload URL generated successfully.',
      complaintId,
      complaintCode: complaint.complaint_code,
      uploadUrl: result.uploadUrl,
      objectKey: result.objectKey,
      expiresIn: result.expiresIn
    });

  } catch (error) {
    console.error('[UPLOAD] Presign error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate upload URL.',
      details: error.message
    });
  }
});


// ============================================================
// 2. CONFIRM S3 UPLOAD AND SAVE ATTACHMENT
// POST /api/uploads/confirm
// ============================================================

router.post('/confirm', requireAuth, async (req, res) => {
  try {
    const {
      complaintId,
      objectKey,
      fileName,
      contentType
    } = req.body;

    console.log('[UPLOAD CONFIRM DEBUG]', {
      authenticatedUser: req.user.id,
      complaintId,
      userRole: req.user.role,
      objectKey,
      fileName,
      contentType
    });

    if (!complaintId || !objectKey || !fileName) {
      return res.status(400).json({
        success: false,
        error: 'complaintId, objectKey and fileName are required.'
      });
    }

    const expectedPrefix = `complaints/${complaintId}/`;

    if (!objectKey.startsWith(expectedPrefix)) {
      return res.status(403).json({
        success: false,
        error: 'Invalid S3 object key.'
      });
    }

    const db = getAuthenticatedSupabaseClient(req.token);

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Supabase is not configured.'
      });
    }

    const complaint = await verifyComplaint(db, complaintId, req);

    if (complaint === null) {
      return res.status(404).json({
        success: false,
        error: 'Complaint not found or not visible under current Supabase permissions.'
      });
    }

    if (complaint === false) {
      return res.status(403).json({
        success: false,
        error: 'You cannot modify another citizen’s complaint.'
      });
    }

    // Verify object in AWS S3
    const {
      exists,
      contentLength,
      contentType: actualType
    } = await checkObjectExists({ objectKey });

    if (!exists) {
      return res.status(400).json({
        success: false,
        error: 'Image does not exist in the S3 bucket.'
      });
    }

    if (contentLength > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: 'Image exceeds the 10 MB limit.'
      });
    }

    if (
      !ALLOWED_TYPES.includes(actualType) ||
      (contentType && actualType !== contentType)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Uploaded image content type is invalid.'
      });
    }

    // Check for duplicate attachment
    const { data: existing, error: existingError } = await db
      .from('complaint_attachments')
      .select('id, s3_object_key')
      .eq('complaint_id', complaintId)
      .eq('s3_object_key', objectKey)
      .maybeSingle();

    if (existingError) {
      console.error('[UPLOAD] Duplicate check error:', existingError);
      throw existingError;
    }

    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Attachment already registered.',
        attachment: existing,
        complaintCode: complaint.complaint_code
      });
    }

    // Save attachment information in Supabase
    const { data: attachment, error: insertError } = await db
      .from('complaint_attachments')
      .insert({
        complaint_id: complaintId,
        uploaded_by: req.user.id,
        s3_object_key: objectKey,
        attachment_type: 'issue',
        file_name: safeFileName(fileName),
        file_size_bytes: contentLength
      })
      .select()
      .single();

    if (insertError) {
      console.error('[UPLOAD] Attachment insert error:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        complaintId,
        authenticatedUser: req.user.id
      });

      return res.status(500).json({
        success: false,
        error: 'Image uploaded to S3, but attachment registration failed.',
        details: insertError.message,
        code: insertError.code
      });
    }

    console.log('[UPLOAD] Attachment registered successfully:', {
      attachmentId: attachment.id,
      complaintId,
      user: req.user.id,
      objectKey
    });

    return res.status(201).json({
      success: true,
      message: 'Image uploaded and registered successfully.',
      complaintCode: complaint.complaint_code,
      attachment
    });

  } catch (error) {
    console.error('[UPLOAD] Confirm error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to confirm image upload.',
      details: error.message
    });
  }
});


// ============================================================
// 3. GENERATE TEMPORARY DOWNLOAD URL
// GET /api/uploads/download?objectKey=...
// ============================================================

router.get('/download', requireAuth, async (req, res) => {
  try {
    const { objectKey } = req.query;

    if (!objectKey) {
      return res.status(400).json({
        success: false,
        error: 'objectKey is required.'
      });
    }

    const db = getAuthenticatedSupabaseClient(req.token);

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Supabase is not configured.'
      });
    }

    const { data: attachment, error } = await db
      .from('complaint_attachments')
      .select('complaint_id, s3_object_key')
      .eq('s3_object_key', objectKey)
      .maybeSingle();

    if (error) {
      console.error('[DOWNLOAD] Attachment lookup error:', error);
      throw error;
    }

    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found or access denied.'
      });
    }

    const complaint = await verifyComplaint(
      db,
      attachment.complaint_id,
      req
    );

    if (!complaint) {
      return res.status(403).json({
        success: false,
        error: 'You cannot access this attachment.'
      });
    }

    const result = await getPresignedDownloadUrl({ objectKey });

    return res.status(200).json({
      success: true,
      downloadUrl: result.downloadUrl,
      expiresIn: result.expiresIn
    });

  } catch (error) {
    console.error('[DOWNLOAD] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to generate download URL.',
      details: error.message
    });
  }
});

export default router;
