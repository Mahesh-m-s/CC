import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDownloadUrlForAttachment } from '../services/complaintService';
import { Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';

/**
 * SecureS3Image Component
 * Fetches an authenticated, short-lived presigned GET URL from the Express backend
 * to securely render private AWS S3 complaint and resolution photos in the browser.
 */
export default function SecureS3Image({
  complaintId,
  objectKey,
  alt = 'Civic Attachment',
  fallbackSrc = null,
  style = {},
  className = ''
}) {
  const { token } = useAuth();
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSignedUrl() {
      // 1. If an explicit objectKey is provided, request temporary presigned URL from backend
      if (complaintId && objectKey) {
        setLoading(true);
        setError(false);
        try {
          const signedUrl = await getDownloadUrlForAttachment(complaintId, objectKey, token);
          if (active) {
            if (signedUrl) {
              setImageUrl(signedUrl);
            } else if (fallbackSrc) {
              setImageUrl(fallbackSrc);
            } else {
              setError(true);
            }
          }
        } catch (err) {
          console.warn('[SecureS3Image] Presigned download error:', err.message);
          if (active) {
            if (fallbackSrc) setImageUrl(fallbackSrc);
            else setError(true);
          }
        } finally {
          if (active) setLoading(false);
        }
        return;
      }

      // 2. Direct fallback URL (for demo images or public placeholders)
      if (fallbackSrc) {
        setImageUrl(fallbackSrc);
        setLoading(false);
        return;
      }

      setLoading(false);
      setError(true);
    }

    loadSignedUrl();

    return () => {
      active = false;
    };
  }, [complaintId, objectKey, token, fallbackSrc]);

  if (loading) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5efe1',
        color: '#4b5e28',
        gap: '6px',
        fontSize: '0.76rem',
        fontWeight: 600,
        ...style
      }} className={className}>
        <Loader2 size={20} className="animate-spin" />
        <span>Authenticating S3 URL...</span>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        color: '#94a3b8',
        gap: '6px',
        fontSize: '0.78rem',
        ...style
      }} className={className}>
        <ImageIcon size={28} />
        <span>Photo unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        ...style
      }}
      className={className}
      onError={() => {
        if (fallbackSrc && imageUrl !== fallbackSrc) {
          setImageUrl(fallbackSrc);
        } else {
          setError(true);
        }
      }}
    />
  );
}

