import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  ALLOWED_ATTACHMENT_TYPES,
  validateUploadMetadata,
  generateObjectKey,
  verifyObjectKeyScope
} from '../src/utils/fileValidation.js';

describe('Backend File Validation & Key Generation Utilities', () => {

  describe('Constant Definitions', () => {
    test('MAX_FILE_SIZE_BYTES is exactly 5 MB', () => {
      assert.equal(MAX_FILE_SIZE_BYTES, 5 * 1024 * 1024);
    });

    test('Allowed MIME types include JPG, JPEG, PNG, WEBP', () => {
      assert.ok(ALLOWED_MIME_TYPES.has('image/jpeg'));
      assert.ok(ALLOWED_MIME_TYPES.has('image/png'));
      assert.ok(ALLOWED_MIME_TYPES.has('image/webp'));
      assert.ok(!ALLOWED_MIME_TYPES.has('application/pdf'));
      assert.ok(!ALLOWED_MIME_TYPES.has('image/gif'));
    });

    test('Allowed extensions include .jpg, .jpeg, .png, .webp', () => {
      assert.ok(ALLOWED_EXTENSIONS.has('.jpg'));
      assert.ok(ALLOWED_EXTENSIONS.has('.jpeg'));
      assert.ok(ALLOWED_EXTENSIONS.has('.png'));
      assert.ok(ALLOWED_EXTENSIONS.has('.webp'));
      assert.ok(!ALLOWED_EXTENSIONS.has('.exe'));
      assert.ok(!ALLOWED_EXTENSIONS.has('.svg'));
    });

    test('Allowed attachment types are only "issue" and "resolution"', () => {
      assert.ok(ALLOWED_ATTACHMENT_TYPES.has('issue'));
      assert.ok(ALLOWED_ATTACHMENT_TYPES.has('resolution'));
      assert.equal(ALLOWED_ATTACHMENT_TYPES.size, 2);
    });
  });

  describe('validateUploadMetadata()', () => {
    test('Accepts valid issue photo metadata', () => {
      const result = validateUploadMetadata({
        fileName: 'pothole_devaraja_market.jpg',
        contentType: 'image/jpeg',
        fileSize: 2.4 * 1024 * 1024,
        attachmentType: 'issue'
      });
      assert.equal(result.valid, true);
      assert.equal(result.extension, '.jpg');
      assert.equal(result.error, undefined);
    });

    test('Accepts valid resolution proof metadata with PNG', () => {
      const result = validateUploadMetadata({
        fileName: 'road_fixed.png',
        contentType: 'image/png',
        fileSize: 1024 * 1024,
        attachmentType: 'resolution'
      });
      assert.equal(result.valid, true);
      assert.equal(result.extension, '.png');
    });

    test('Accepts WEBP images', () => {
      const result = validateUploadMetadata({
        fileName: 'streetlight.webp',
        contentType: 'image/webp',
        fileSize: 500 * 1024,
        attachmentType: 'issue'
      });
      assert.equal(result.valid, true);
      assert.equal(result.extension, '.webp');
    });

    test('Rejects missing or invalid fileName', () => {
      const res1 = validateUploadMetadata({
        fileName: '',
        contentType: 'image/jpeg',
        fileSize: 1000,
        attachmentType: 'issue'
      });
      assert.equal(res1.valid, false);
      assert.match(res1.error, /fileName string is required/);
    });

    test('Rejects disallowed MIME types (e.g. application/pdf, image/svg+xml)', () => {
      const res = validateUploadMetadata({
        fileName: 'complaint.pdf',
        contentType: 'application/pdf',
        fileSize: 100000,
        attachmentType: 'issue'
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /Unsupported content type/);
    });

    test('Rejects disallowed file extensions (e.g. .exe, .sh, .bmp)', () => {
      const res = validateUploadMetadata({
        fileName: 'malicious.exe',
        contentType: 'image/jpeg',
        fileSize: 1000,
        attachmentType: 'issue'
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /Unsupported file extension/);
    });

    test('Rejects file size exceeding 5 MB limit', () => {
      const res = validateUploadMetadata({
        fileName: 'huge_photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 6 * 1024 * 1024, // 6 MB
        attachmentType: 'issue'
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /exceeds the 5 MB limit/);
    });

    test('Rejects file size of 0 or negative bytes', () => {
      const res = validateUploadMetadata({
        fileName: 'empty.jpg',
        contentType: 'image/jpeg',
        fileSize: 0,
        attachmentType: 'issue'
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /greater than 0 bytes/);
    });

    test('Rejects invalid attachment types', () => {
      const res = validateUploadMetadata({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1000,
        attachmentType: 'avatar'
      });
      assert.equal(res.valid, false);
      assert.match(res.error, /Invalid attachmentType/);
    });
  });

  describe('generateObjectKey()', () => {
    test('Generates key with complaints/ prefix for issue photos', () => {
      const key = generateObjectKey('comp-1234', 'issue', '.jpg');
      assert.match(key, /^complaints\/comp-1234\/\d+-[a-f0-9]{12}\.jpg$/);
    });

    test('Generates key with resolutions/ prefix for resolution proofs', () => {
      const key = generateObjectKey('uuid-5678', 'resolution', '.png');
      assert.match(key, /^resolutions\/uuid-5678\/\d+-[a-f0-9]{12}\.png$/);
    });

    test('Sanitizes complaintId to alphanumeric characters, dashes, and underscores', () => {
      const key = generateObjectKey('../../malicious/path', 'issue', '.webp');
      assert.ok(!key.includes('..'));
      assert.match(key, /^complaints\/maliciouspath\/\d+-[a-f0-9]{12}\.webp$/);
    });

    test('Generates distinct keys on successive calls (no collision)', () => {
      const key1 = generateObjectKey('comp-1', 'issue', '.jpg');
      const key2 = generateObjectKey('comp-1', 'issue', '.jpg');
      assert.notEqual(key1, key2);
    });
  });

  describe('verifyObjectKeyScope()', () => {
    test('Returns true when objectKey strictly matches complaint ID and issue folder', () => {
      const key = 'complaints/comp-101/1700000000-abcdef123456.jpg';
      assert.equal(verifyObjectKeyScope(key, 'comp-101', 'issue'), true);
    });

    test('Returns true when objectKey strictly matches complaint ID and resolution folder', () => {
      const key = 'resolutions/comp-101/1700000000-abcdef123456.jpg';
      assert.equal(verifyObjectKeyScope(key, 'comp-101', 'resolution'), true);
    });

    test('Returns false when folder does not match attachmentType', () => {
      const key = 'complaints/comp-101/1700000000-abcdef123456.jpg';
      assert.equal(verifyObjectKeyScope(key, 'comp-101', 'resolution'), false);
    });

    test('Returns false when complaint ID does not match (path injection prevention)', () => {
      const key = 'complaints/comp-202/1700000000-abcdef123456.jpg';
      assert.equal(verifyObjectKeyScope(key, 'comp-101', 'issue'), false);
    });

    test('Returns false on invalid or null objectKey', () => {
      assert.equal(verifyObjectKeyScope(null, 'comp-101', 'issue'), false);
      assert.equal(verifyObjectKeyScope('', 'comp-101', 'issue'), false);
    });
  });

});

