process.env.NODE_ENV = 'test';

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';

describe('MCC Backend API Endpoints', () => {
  let server;
  let baseUrl;

  const mockCitizen = JSON.stringify({
    id: 'test-citizen-uuid-1',
    email: 'citizen.mysuru@example.com',
    role: 'citizen',
    name: 'Mysuru Citizen Test'
  });

  const mockOfficer = JSON.stringify({
    id: 'test-officer-uuid-2',
    email: 'officer.water@mcc.gov.in',
    role: 'field_officer',
    name: 'Executive Engineer Test'
  });

  before(async () => {
    // Spin up server on an ephemeral free port
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('GET /api/health', () => {
    test('Returns 200 OK with service details and cloud integration flags', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.service, 'Mysuru Civic Connect (MCC) Cloud Backend');
      assert.equal(data.version, '1.0.0');
      assert.ok(data.timestamp);
      assert.ok(data.cloudIntegrations);
      assert.ok('awsS3' in data.cloudIntegrations);
      assert.ok('supabase' in data.cloudIntegrations);
    });
  });

  describe('POST /api/uploads/presign Authentication & Validation', () => {
    test('Rejects request without Authorization header (401)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId: 'comp-101',
          fileName: 'pothole.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Missing or malformed Authorization header/);
    });

    test('Rejects request with non-Bearer Authorization header (401)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic dXNlcjpwYXNz'
        },
        body: JSON.stringify({ complaintId: 'comp-101' })
      });

      assert.equal(res.status, 401);
    });

    test('Rejects request with empty Bearer token (401)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer '
        },
        body: JSON.stringify({ complaintId: 'comp-101' })
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Bearer token is empty/);
    });

    test('Rejects missing complaintId when authenticated (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-mock-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          fileName: 'pothole.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /complaintId is required/);
    });

    test('Rejects invalid file extension (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-mock-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101',
          fileName: 'malicious_script.sh',
          contentType: 'image/jpeg',
          fileSize: 1024,
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Unsupported file extension/);
    });

    test('Rejects unsupported MIME type (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-mock-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101',
          fileName: 'document.pdf',
          contentType: 'application/pdf',
          fileSize: 1024,
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Unsupported content type/);
    });

    test('Rejects file size exceeding 5 MB (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-mock-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101',
          fileName: 'huge.jpg',
          contentType: 'image/jpeg',
          fileSize: 6 * 1024 * 1024,
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /exceeds the 5 MB limit/);
    });
  });

  describe('POST /api/uploads/confirm Validation & Security Scope', () => {
    test('Rejects unauthenticated confirm request (401)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId: 'comp-101',
          objectKey: 'complaints/comp-101/1700-abc.jpg',
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 401);
    });

    test('Rejects missing required fields (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101'
          // objectKey and attachmentType missing
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /complaintId, objectKey, and attachmentType are required/);
    });

    test('Rejects mismatched objectKey (security violation: ID tampering) (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101',
          objectKey: 'complaints/comp-999/1700-evil.jpg', // tampering complaint ID
          attachmentType: 'issue'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Security violation: objectKey/);
    });

    test('Rejects mismatched objectKey folder type (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          'x-test-mock-user': mockOfficer
        },
        body: JSON.stringify({
          complaintId: 'comp-101',
          objectKey: 'resolutions/comp-101/1700-fixed.jpg',
          attachmentType: 'issue' // mismatched folder
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Security violation: objectKey/);
    });
  });

  describe('POST /api/uploads/download-url Validation', () => {
    test('Rejects unauthenticated download-url request (401)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/download-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId: 'comp-101',
          objectKey: 'complaints/comp-101/photo.jpg'
        })
      });

      assert.equal(res.status, 401);
    });

    test('Rejects missing complaintId or objectKey (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/download-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /complaintId and objectKey are required/);
    });

    test('Rejects objectKey that does not belong to complaintId (400)', async () => {
      const res = await fetch(`${baseUrl}/api/uploads/download-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
          'x-test-mock-user': mockCitizen
        },
        body: JSON.stringify({
          complaintId: 'comp-101',
          objectKey: 'complaints/comp-different/photo.jpg'
        })
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Security violation/);
    });
  });

  describe('404 & Routing', () => {
    test('Returns 404 for undefined endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/non-existent-route`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.error, 'Not Found');
    });
  });

});
