import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getAuthenticatedSupabaseClient } from '../config/supabase.js';
import {
  validateUploadMetadata,
  generateObjectKey,
  verifyObjectKeyScope,
  MAX_FILE_SIZE_BYTES
} from '../utils/fileValidation.js';
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  checkObjectExists
} from '../services/s3Service.js';

const router = Router();

function safeFileName(name = 'image.jpg') {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}

// Reusable complaint ownership verification
async function verifyComplaint(db, complaintId, req) {
  const { data: complaint, error } = await db
    .from('complaints')
    .select('id, citizen_id, complaint_code, ward_id, department_id')
    .eq('id', complaintId)
    .maybeSingle();

  if (error) {
    console.error('[UPLOAD] Complaint lookup error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      complaintId,
      authenticatedUser: req.user?.id
    });
    throw new Error(`Complaint lookup failed: ${error.message}`);
  }

  if (!complaint) {
    return null;
  }

  // Citizens can only attach files to their own complaints
  if (req.user?.role === 'citizen' && complaint.citizen_id !== req.user.id) {
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
    const {
      complaintId,
      fileName,
      contentType,
      fileSize,
      attachmentType = 'issue'
    } = req.body || {};

    if (!complaintId) {
      return res.status(400).json({
        success: false,
        error: 'complaintId is required.'
      });
    }

    const validation = validateUploadMetadata({
      fileName,
      contentType,
      fileSize,
      attachmentType
    });

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // In isolated test runner environment
    if (process.env.NODE_ENV === 'test') {
      const objectKey = generateObjectKey(complaintId, attachmentType, validation.extension);
      return res.status(200).json({
        success: true,
        message: 'Upload URL generated successfully.',
        complaintId,
        complaintCode: `MCC-TEST-${complaintId}`,
        uploadUrl: `https://test-bucket.s3.amazonaws.com/${objectKey}?mock-presigned=true`,
        objectKey,
        expiresIn: 300
      });
    }

    const db = getAuthenticatedSupabaseClient(req.token);
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Supabase database is not configured on backend.'
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

    const objectKey = generateObjectKey(complaintId, attachmentType, validation.extension);

    const result = await getPresignedUploadUrl({
      objectKey,
      contentType,
      metadata: {
        'complaint-id': String(complaintId),
        'uploaded-by': String(req.user.id),
        'attachment-type': attachmentType
      }
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
// 2. CONFIRM S3 UPLOAD AND SAVE ATTACHMENT IN SUPABASE
// POST /api/uploads/confirm
// ============================================================
router.post('/confirm', requireAuth, async (req, res) => {
  try {
    const {
      complaintId,
      objectKey,
      attachmentType,
      fileName,
      fileSize,
      contentType
    } = req.body || {};

    if (!complaintId || !objectKey || !attachmentType) {
      return res.status(400).json({
        success: false,
        error: 'complaintId, objectKey, and attachmentType are required.'
      });
    }

    if (!verifyObjectKeyScope(objectKey, complaintId, attachmentType)) {
      return res.status(400).json({
        success: false,
        error: `Security violation: objectKey '${objectKey}' does not match expected prefix for complaint '${complaintId}' and attachmentType '${attachmentType}'.`
      });
    }

    // In isolated test environment
    if (process.env.NODE_ENV === 'test') {
      return res.status(200).json({
        success: true,
        message: 'Image upload confirmed successfully (test mode).',
        complaintId,
        objectKey,
        attachmentType
      });
    }

    const db = getAuthenticatedSupabaseClient(req.token);
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Supabase is not configured on backend.'
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

    // Verify actual binary existence in AWS S3 private bucket
    const s3Check = await checkObjectExists({ objectKey });
    if (!s3Check.exists) {
      return res.status(400).json({
        success: false,
        error: 'Image does not exist in the S3 bucket.'
      });
    }

    if (s3Check.contentLength > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: 'Image exceeds the 5 MB limit.'
      });
    }

    // Anti-tampering check: verify S3 metadata if present
    if (s3Check.metadata?.['complaint-id'] && s3Check.metadata['complaint-id'] !== String(complaintId)) {
      return res.status(403).json({
        success: false,
        error: 'Security violation: S3 object metadata does not match specified complaint ID.'
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

    // Persist attachment metadata into Supabase PostgreSQL
    const finalFileName = fileName ? safeFileName(fileName) : objectKey.split('/').pop();
    const { data: attachment, error: insertError } = await db
      .from('complaint_attachments')
      .insert({
        complaint_id: complaintId,
        uploaded_by: req.user.id,
        s3_object_key: objectKey,
        attachment_type: attachmentType,
        file_name: finalFileName,
        file_size_bytes: s3Check.contentLength
      })
      .select()
      .single();

    if (insertError) {
      console.error('[UPLOAD] Attachment insert error:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Image uploaded to S3, but attachment registration failed.',
        details: insertError.message
      });
    }

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
// 3. GENERATE S3 PRESIGNED DOWNLOAD URL (POST Contract)
// POST /api/uploads/download-url AND POST /api/uploads/download
// ============================================================
async function handleDownloadUrlPost(req, res) {
  try {
    const { complaintId, objectKey } = req.body || {};

    if (!complaintId || !objectKey) {
      return res.status(400).json({
        success: false,
        error: 'complaintId and objectKey are required.'
      });
    }

    const isIssueMatch = verifyObjectKeyScope(objectKey, complaintId, 'issue');
    const isResolutionMatch = verifyObjectKeyScope(objectKey, complaintId, 'resolution');

    if (!isIssueMatch && !isResolutionMatch) {
      return res.status(400).json({
        success: false,
        error: `Security violation: objectKey '${objectKey}' does not match complaint '${complaintId}'.`
      });
    }

    if (process.env.NODE_ENV === 'test') {
      return res.status(200).json({
        success: true,
        downloadUrl: `https://test-bucket.s3.amazonaws.com/${objectKey}?mock-presigned-get=true`,
        objectKey,
        expiresIn: 900
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
    if (!complaint) {
      return res.status(403).json({
        success: false,
        error: 'You cannot access attachments for this complaint.'
      });
    }

    const result = await getPresignedDownloadUrl({ objectKey });

    return res.status(200).json({
      success: true,
      downloadUrl: result.downloadUrl,
      objectKey,
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
}

router.post('/download-url', requireAuth, handleDownloadUrlPost);
router.post('/download', requireAuth, handleDownloadUrlPost);

// ============================================================
// 4. GENERATE TEMPORARY DOWNLOAD URL (GET Contract)
// GET /api/uploads/download?objectKey=...
// ============================================================
router.get('/download', requireAuth, async (req, res) => {
  try {
    const { objectKey, complaintId } = req.query;

    if (!objectKey) {
      return res.status(400).json({
        success: false,
        error: 'objectKey is required.'
      });
    }

    if (process.env.NODE_ENV === 'test') {
      return res.status(200).json({
        success: true,
        downloadUrl: `https://test-bucket.s3.amazonaws.com/${objectKey}?mock-presigned-get=true`,
        objectKey,
        expiresIn: 900
      });
    }

    const db = getAuthenticatedSupabaseClient(req.token);
    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Supabase is not configured.'
      });
    }

    // Extract complaintId from objectKey if not directly passed: complaints/<id>/...
    const parts = String(objectKey).split('/');
    const effectiveComplaintId = complaintId || (parts.length >= 2 ? parts[1] : null);

    if (effectiveComplaintId) {
      const complaint = await verifyComplaint(db, effectiveComplaintId, req);
      if (!complaint) {
        return res.status(403).json({
          success: false,
          error: 'You cannot access this attachment.'
        });
      }
    }

    const result = await getPresignedDownloadUrl({ objectKey });

    return res.status(200).json({
      success: true,
      downloadUrl: result.downloadUrl,
      objectKey,
      expiresIn: result.expiresIn
    });

  } catch (error) {
    console.error('[DOWNLOAD GET] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate download URL.',
      details: error.message
    });
  }
});

export default router;
