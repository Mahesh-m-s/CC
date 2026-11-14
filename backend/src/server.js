import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import uploadRoutes from './routes/uploadRoutes.js';
import { isAwsConfigured, AWS_S3_BUCKET, AWS_REGION } from './config/aws.js';
import { isSupabaseConfigured, SUPABASE_URL } from './config/supabase.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// Permitted origins for local dev, Render, and CloudFront deployments
const configuredOrigins = FRONTEND_ORIGIN
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      origin.endsWith('.cloudfront.net')
    ) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-test-mock-user'],
  credentials: true
}));

// Express request body parsers (Must precede route definitions)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -----------------------------------------------------------------------------
// Health Check Endpoints (Supports both /health and /api/health for Render)
// -----------------------------------------------------------------------------
const healthHandler = (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Mysuru Civic Connect (MCC) Cloud Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    cloudIntegrations: {
      awsS3: {
        configured: isAwsConfigured(),
        bucket: AWS_S3_BUCKET || 'Not set',
        region: AWS_REGION
      },
      supabase: {
        configured: isSupabaseConfigured(),
        url: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 18)}...` : 'Not set'
      }
    }
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// -----------------------------------------------------------------------------
// Mount Uploads API Router
// -----------------------------------------------------------------------------
app.use('/api/uploads', uploadRoutes);

// -----------------------------------------------------------------------------
// 404 Handler
// -----------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    message: 'The requested API endpoint does not exist.'
  });
});

// -----------------------------------------------------------------------------
// Global Error Handler
// -----------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[ServerError]', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
});

// Start Server if executed directly and not running in test mode
const isMainModule = process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url));
if (isMainModule && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🏛️  MCC Cloud Backend running on http://0.0.0.0:${PORT}`);
    console.log(`📡 AWS S3 Configured: ${isAwsConfigured() ? '✅ YES (' + AWS_S3_BUCKET + ')' : '⚠️  NO (Set backend/.env)'}`);
    console.log(`🔐 Supabase Configured: ${isSupabaseConfigured() ? '✅ YES' : '⚠️  NO (Set backend/.env)'}`);
    console.log(`🌐 Allowed Frontend Origin: ${FRONTEND_ORIGIN}`);
    console.log(`=======================================================`);
  });
}

export default app;
