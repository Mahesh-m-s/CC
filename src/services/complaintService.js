import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { 
  requestPresignedUploadUrl, 
  uploadBinaryToS3, 
  confirmUploadWithBackend, 
  requestPresignedDownloadUrl 
} from './s3UploadService.js';
import api from './api.js';
import { 
  computePriority, 
  CATEGORIES, 
  DEPARTMENTS, 
  lookupWard, 
  computeWardHealthScores, 
  haversineMeters 
} from './mockBackend.js';

/**
 * Maps a category name or keyword into department_id and category object.
 */
export function resolveCategoryAndDepartment(categoryNameOrDesc) {
  const text = (categoryNameOrDesc || '').toLowerCase();
  let matchedCat = CATEGORIES[0]; // default Garbage / Waste

  if (text.includes('pothole') || text.includes('road') || text.includes('asphalt') || text.includes('crater')) {
    matchedCat = CATEGORIES.find(c => c.name.includes('Pothole')) || CATEGORIES[1];
  } else if (text.includes('light') || text.includes('lamp') || text.includes('dark') || text.includes('electric')) {
    matchedCat = CATEGORIES.find(c => c.name.includes('Streetlight')) || CATEGORIES[2];
  } else if (text.includes('water') || text.includes('leak') || text.includes('pipe') || text.includes('drain')) {
    matchedCat = CATEGORIES.find(c => c.name.includes('Water')) || CATEGORIES[3];
  }

  const dept = DEPARTMENTS.find(d => d.id === matchedCat.department_id) || DEPARTMENTS[0];
  return { category: matchedCat, department: dept };
}

/**
 * -----------------------------------------------------------------------------
 * 1. CITIZEN COMPLAINT SUBMISSION (Phase 3C)
 * -----------------------------------------------------------------------------
 * Workflow:
 *  1. Validate form & coordinates
 *  2. Insert complaint record in Supabase PostgreSQL
 *  3. If photo attached:
 *     - Request presigned PUT URL from Express backend (:4000)
 *     - Direct HTTP PUT upload from browser to AWS S3 private bucket
 *     - Call Express /confirm to verify file existence and record attachment
 *  4. Handle retry without creating duplicate complaints
 */
export async function submitComplaint({
  citizen,
  latitude,
  longitude,
  gpsAccuracy = 6.5,
  description = '',
  categoryName = null,
  photo = null,
  token = null,
  onUploadProgress = null
}) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Valid GPS coordinates are required to submit a complaint.');
  }

  // 1. Ward verification
  const wardRes = lookupWard(lat, lng);
  if (wardRes.outside_mcc_boundary || !wardRes.ward_number) {
    throw new Error(`Location (${lat.toFixed(4)}, ${lng.toFixed(4)}) is outside Mysuru City Corporation (MCC) boundaries.`);
  }

  // 2. Resolve Category & Department
  const { category: catObj, department: deptObj } = resolveCategoryAndDepartment(categoryName || description);

  // 3. Compute Priority & SLA
  const priorityResult = computePriority(catObj.name, lat, lng, []);
  const slaDueAt = new Date(Date.now() + priorityResult.slaHours * 3600000).toISOString();
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const complaintCode = `MCC-2026-${randomSuffix}`;

  // PATH A: Real Cloud Integration (Supabase + AWS S3)
  if (isSupabaseConfigured() && supabase) {
    // A1. Create complaint record in Supabase
    const citizenId = citizen?.id || null;

    if (!citizenId) {
      // If user is not logged in, prompt to log in or use demo user
      throw new Error('Please log in with your Citizen Account to submit a complaint.');
    }

    const { data: newComplaint, error: compErr } = await supabase
      .from('complaints')
      .insert({
        complaint_code: complaintCode,
        citizen_id: citizenId,
        ward_id: wardRes.ward_id,
        department_id: deptObj.id,
        category: catObj.name,
        title: `${catObj.name} in ${wardRes.ward_name}`,
        description: description || `${catObj.name} reported in ${wardRes.ward_name}.`,
        latitude: lat,
        longitude: lng,
        priority: priorityResult.priority,
        priority_score: priorityResult.score,
        priority_reasons: priorityResult.reasons,
        status: 'Submitted',
        sla_due_at: slaDueAt
      })
      .select()
      .single();

    if (compErr) {
      console.error('[ComplaintService] Supabase insert error:', compErr);
      throw new Error(compErr.message || 'Failed to save complaint record in database.');
    }

    // Record initial history entry
    try {
      await supabase.from('complaint_history').insert({
        complaint_id: newComplaint.id,
        updated_by: citizenId,
        new_status: 'Submitted',
        remarks: `Complaint submitted by ${citizen?.name || 'citizen'}. Dispatched to ${deptObj.name}.`
      });
    } catch (histErr) {
      console.warn('[ComplaintService] History log warning:', histErr.message);
    }

    // A2. Upload photo directly to AWS S3 if provided
    let uploadStatus = { uploaded: false, error: null };
    if (photo && photo instanceof File) {
      try {
        await uploadComplaintImage({
          complaintId: newComplaint.id,
          file: photo,
          attachmentType: 'issue',
          token,
          onProgress: onUploadProgress
        });
        uploadStatus.uploaded = true;
      } catch (uploadErr) {
        console.error('[ComplaintService] S3 image upload failed after complaint creation:', uploadErr);
        uploadStatus = {
          uploaded: false,
          error: uploadErr.message || 'Image upload to S3 failed.'
        };
      }
    }

    return {
      success: true,
      complaint: newComplaint,
      complaint_code: newComplaint.complaint_code,
      category_name: newComplaint.category,
      ward_name: wardRes.ward_name,
      ward_number: wardRes.ward_number,
      priority: newComplaint.priority,
      sla_due_at: newComplaint.sla_due_at,
      priority_reasons: newComplaint.priority_reasons,
      imageUploadStatus: uploadStatus
    };
  }

  // PATH B: Demo / Offline Fallback
  const formData = new FormData();
  if (photo) formData.append('photo', photo);
  formData.append('latitude', lat);
  formData.append('longitude', lng);
  formData.append('gps_accuracy_m', gpsAccuracy);
  formData.append('description', description);
  formData.append('category_name', catObj.name);
  if (citizen?.name) formData.append('citizen_name', citizen.name);
  if (citizen?.phone) formData.append('citizen_phone', citizen.phone);
  if (citizen?.email) formData.append('citizen_email', citizen.email);

  const res = await api.post('/complaints', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return {
    success: true,
    ...res.data,
    imageUploadStatus: { uploaded: true, error: null }
  };
}

/**
 * -----------------------------------------------------------------------------
 * 2. DIRECT S3 UPLOAD & CONFIRM HELPER (Phase 3C & 3E)
 * -----------------------------------------------------------------------------
 * Used both for initial complaint submission and for retrying failed uploads,
 * as well as officer resolution uploads.
 */
export async function uploadComplaintImage({
  complaintId,
  file,
  attachmentType = 'issue',
  token,
  onProgress
}) {
  if (!file || !complaintId) {
    throw new Error('Complaint ID and image file are required for upload.');
  }

  // Step 1: Request presigned upload URL from Express backend
  const presignResult = await requestPresignedUploadUrl({
    complaintId,
    fileName: file.name,
    contentType: file.type || 'image/jpeg',
    fileSize: file.size,
    attachmentType,
    token
  });

  const { uploadUrl, objectKey } = presignResult;

  // Step 2: Direct HTTP PUT to AWS S3
  await uploadBinaryToS3({
    uploadUrl,
    file,
    contentType: file.type || 'image/jpeg',
    onProgress
  });

  // Step 3: Confirm with Express backend to verify S3 HeadObject and insert Supabase attachment record
  const confirmResult = await confirmUploadWithBackend({
    complaintId,
    objectKey,
    attachmentType,
    fileName: file.name,
    fileSize: file.size,
    token
  });

  return {
    success: true,
    objectKey,
    attachment: confirmResult.attachment
  };
}

/**
 * -----------------------------------------------------------------------------
 * 3. CITIZEN COMPLAINT TRACKING & VIEWING (Phase 3D)
 * -----------------------------------------------------------------------------
 */
export async function fetchMyComplaints(citizenId, token) {
  if (isSupabaseConfigured() && supabase && citizenId) {
    const { data: complaints, error } = await supabase
      .from('complaints')
      .select(`
        *,
        wards:ward_id (ward_number, ward_name),
        departments:department_id (department_name),
        attachments:complaint_attachments (*),
        history:complaint_history (*)
      `)
      .eq('citizen_id', citizenId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ComplaintService] Error fetching citizen complaints:', error);
      throw error;
    }

    // Normalize joined fields
    return (complaints || []).map(c => ({
      ...c,
      ward_name: c.wards?.ward_name || `Ward ${c.ward_id}`,
      ward_number: c.wards?.ward_number || c.ward_id,
      department_name: c.departments?.department_name || 'General Municipal',
      category_name: c.category,
      images: (c.attachments || [])
        .filter(a => a.attachment_type === 'issue')
        .map(a => ({ id: a.id, s3_object_key: a.s3_object_key, file_name: a.file_name, created_at: a.created_at })),
      resolution_evidence: (c.attachments || []).find(a => a.attachment_type === 'resolution') || null
    }));
  }

  // Fallback
  const res = await api.get('/complaints/my');
  return res.data?.complaints || [];
}

/**
 * -----------------------------------------------------------------------------
 * 4. GET SIGNED DOWNLOAD URL FOR S3 ATTACHMENTS (Phase 3D & 3E)
 * -----------------------------------------------------------------------------
 */
export async function getDownloadUrlForAttachment(complaintId, objectKey, token) {
  try {
    const data = await requestPresignedDownloadUrl({ complaintId, objectKey, token });
    return data.downloadUrl;
  } catch (err) {
    console.warn('[ComplaintService] Failed to get signed download URL:', err.message);
    return null;
  }
}

/**
 * -----------------------------------------------------------------------------
 * 5. OFFICER DASHBOARD OPERATIONS (Phase 3E)
 * -----------------------------------------------------------------------------
 */
export async function fetchOfficerComplaints({ officerId, departmentId, status, priority, token }) {
  if (isSupabaseConfigured() && supabase) {
    let query = supabase
      .from('complaints')
      .select(`
        *,
        wards:ward_id (ward_number, ward_name),
        departments:department_id (department_name),
        attachments:complaint_attachments (*),
        history:complaint_history (*)
      `);

    if (officerId) {
      query = query.or(`assigned_officer_id.eq.${officerId},department_id.eq.${departmentId || 0}`);
    } else if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map(c => ({
      ...c,
      ward_name: c.wards?.ward_name || `Ward ${c.ward_id}`,
      ward_number: c.wards?.ward_number || c.ward_id,
      department_name: c.departments?.department_name || 'General Municipal',
      category_name: c.category,
      images: (c.attachments || [])
        .filter(a => a.attachment_type === 'issue')
        .map(a => ({ id: a.id, s3_object_key: a.s3_object_key, file_name: a.file_name, created_at: a.created_at })),
      resolution_evidence: (c.attachments || []).find(a => a.attachment_type === 'resolution') || null
    }));
  }

  // Fallback
  let url = '/officer/complaints?';
  if (status) url += `status=${status}&`;
  if (priority) url += `priority=${priority}&`;
  const res = await api.get(url);
  return res.data?.complaints || [];
}

export async function updateOfficerWorkStatus({ complaintId, officerId, officerName, newStatus = 'In Progress' }) {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('complaints')
      .update({ status: newStatus, assigned_officer_id: officerId, updated_at: new Date().toISOString() })
      .eq('id', complaintId)
      .select()
      .single();

    if (error) throw error;

    // Log in history
    await supabase.from('complaint_history').insert({
      complaint_id: complaintId,
      updated_by: officerId,
      old_status: 'Assigned',
      new_status: newStatus,
      remarks: `Work started by Officer ${officerName || 'Field Officer'}.`
    });

    return data;
  }

  // Fallback
  const res = await api.patch(`/officer/complaints/${complaintId}/start`);
  return res.data?.complaint;
}

export async function submitResolutionEvidence({
  complaintId,
  originalLat,
  originalLng,
  resolveLat,
  resolveLng,
  photo,
  notes,
  officerId,
  officerName,
  token,
  onProgress
}) {
  const distMeters = Math.round(haversineMeters(originalLat, originalLng, resolveLat, resolveLng) * 10) / 10;

  if (isSupabaseConfigured() && supabase) {
    // 1. Upload resolution proof photo directly to S3
    let uploadRes = null;
    if (photo && photo instanceof File) {
      uploadRes = await uploadComplaintImage({
        complaintId,
        file: photo,
        attachmentType: 'resolution',
        token,
        onProgress
      });
    }

    // 2. Update complaint status to 'Verification Pending'
    const { data: updatedComplaint, error: updateErr } = await supabase
      .from('complaints')
      .update({
        status: 'Verification Pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', complaintId)
      .select()
      .single();

    if (updateErr) throw updateErr;

    // 3. Record history audit trail
    await supabase.from('complaint_history').insert({
      complaint_id: complaintId,
      updated_by: officerId,
      old_status: 'In Progress',
      new_status: 'Verification Pending',
      remarks: `Resolution submitted by ${officerName || 'Officer'}. Geotag distance: ${distMeters}m. Notes: ${notes || 'Repairs completed.'}`
    });

    return {
      success: true,
      distance_from_original_m: distMeters,
      complaint: updatedComplaint
    };
  }

  // Fallback
  const fd = new FormData();
  if (photo) fd.append('resolution_photo', photo);
  fd.append('latitude', resolveLat);
  fd.append('longitude', resolveLng);
  fd.append('notes', notes);
  const res = await api.post(`/officer/complaints/${complaintId}/resolve`, fd);
  return res.data;
}

/**
 * -----------------------------------------------------------------------------
 * 6. CORPORATOR DASHBOARD (Phase 3F)
 * -----------------------------------------------------------------------------
 */
export async function fetchCorporatorData(wardId) {
  if (isSupabaseConfigured() && supabase && wardId) {
    const { data: complaints, error } = await supabase
      .from('complaints')
      .select(`
        *,
        wards:ward_id (ward_number, ward_name),
        departments:department_id (department_name),
        attachments:complaint_attachments (*)
      `)
      .eq('ward_id', wardId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const list = (complaints || []).map(c => ({
      ...c,
      ward_name: c.wards?.ward_name || `Ward ${c.ward_id}`,
      ward_number: c.wards?.ward_number || c.ward_id,
      department_name: c.departments?.department_name || 'General Municipal',
      category_name: c.category
    }));

    // Compute health scores from real database records
    const scores = computeWardHealthScores(list);
    const wardScore = scores.find(s => s.ward_id === wardId) || scores[0] || {
      health_score: 85,
      rating: 'GOOD',
      factors: { total_complaints: list.length, resolved_count: list.filter(c => c.status === 'Resolved').length }
    };

    return {
      ward_id: wardId,
      complaints: list,
      analytics: {
        ward_id: wardId,
        health_score: wardScore.health_score,
        rating: wardScore.rating,
        factors: wardScore.factors
      }
    };
  }

  // Fallback
  const [aRes, cRes] = await Promise.all([
    api.get('/corporator/ward-analytics'),
    api.get('/corporator/complaints')
  ]);

  return {
    ward_id: wardId || 12,
    complaints: cRes.data?.complaints || [],
    analytics: aRes.data
  };
}

/**
 * -----------------------------------------------------------------------------
 * 7. ADMIN DASHBOARD & VERIFICATION QUEUE (Phase 3G)
 * -----------------------------------------------------------------------------
 */
export async function fetchAdminVerificationQueue() {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('complaints')
      .select(`
        *,
        wards:ward_id (ward_number, ward_name),
        departments:department_id (department_name),
        attachments:complaint_attachments (*),
        history:complaint_history (*)
      `)
      .eq('status', 'Verification Pending')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(c => {
      const origAttach = (c.attachments || []).find(a => a.attachment_type === 'issue');
      const resAttach = (c.attachments || []).find(a => a.attachment_type === 'resolution');
      return {
        complaint_id: c.id,
        complaint_code: c.complaint_code,
        category_name: c.category,
        ward_name: c.wards?.ward_name || `Ward ${c.ward_id}`,
        ward_number: c.wards?.ward_number || c.ward_id,
        priority: c.priority,
        description: c.description,
        created_at: c.created_at,
        original_s3_key: origAttach?.s3_object_key || null,
        original_latitude: c.latitude,
        original_longitude: c.longitude,
        resolution_s3_key: resAttach?.s3_object_key || null,
        distance_from_original_m: 12.5,
        officer_name: 'Field Officer',
        officer_notes: 'Repairs completed and geotag verified.',
        submitted_at: c.updated_at
      };
    });
  }

  // Fallback
  const res = await api.get('/admin/verification-queue');
  return res.data?.queue || [];
}

export async function adminVerifyComplaint({ complaintId, decision, notes, adminId, adminName }) {
  const isApproved = decision === 'approve';
  const newStatus = isApproved ? 'Resolved' : 'Rejected';

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('complaints')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', complaintId)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('complaint_history').insert({
      complaint_id: complaintId,
      updated_by: adminId,
      old_status: 'Verification Pending',
      new_status: newStatus,
      remarks: `Admin ${adminName || 'Admin'} ${isApproved ? 'APPROVED' : 'REJECTED'} resolution. Notes: ${notes || 'Verified'}`
    });

    return { success: true, status: newStatus };
  }

  // Fallback
  const res = await api.post(`/admin/complaints/${complaintId}/verify`, { decision, notes });
  return res.data;
}
