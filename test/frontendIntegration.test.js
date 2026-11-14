import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { 
  registerNewUser, 
  authenticateUser, 
  normalizeIdentifier 
} from '../src/utils/authValidator.js';
import { 
  resolveCategoryAndDepartment 
} from '../src/services/complaintService.js';
import { 
  lookupWard, 
  computePriority, 
  runDBSCAN, 
  computeWardHealthScores, 
  haversineMeters 
} from '../src/services/mockBackend.js';
import { 
  validateUploadMetadata, 
  generateObjectKey, 
  verifyObjectKeyScope 
} from '../backend/src/utils/fileValidation.js';

describe('Phase 3: Frontend Integration & Cloud Logic Verification', () => {

  describe('3A: Citizen Registration & Role Integrity', () => {
    test('Public registration always creates a citizen role (no privilege escalation)', () => {
      const reg = registerNewUser({
        name: 'Suresh Kumar',
        email: 'suresh.mysuru@example.com',
        phone: '9880011223',
        password: 'Password@123',
        ward_id: 12,
        ward_name: 'J P Nagar'
      });

      assert.equal(reg.success, true);
      assert.equal(reg.user.role, 'citizen');
      assert.equal(reg.user.badge, 'Citizen');
      assert.notEqual(reg.user.role, 'admin');
      assert.notEqual(reg.user.role, 'field_officer');
    });

    test('Rejects registration with invalid email or short password', () => {
      const invalidEmail = registerNewUser({
        name: 'Ramesh',
        email: 'not-an-email',
        phone: '9880011223',
        password: 'Password@123'
      });
      assert.equal(invalidEmail.success, false);
      assert.match(invalidEmail.error, /valid email address/);

      const shortPass = registerNewUser({
        name: 'Ramesh',
        email: 'ramesh@example.com',
        phone: '9880011223',
        password: '123'
      });
      assert.equal(shortPass.success, false);
      assert.match(shortPass.error, /at least 6 characters/);
    });

    test('Rejects registration with invalid mobile phone number', () => {
      const badPhone = registerNewUser({
        name: 'Ramesh',
        email: 'ramesh@example.com',
        phone: '12345',
        password: 'Password@123'
      });
      assert.equal(badPhone.success, false);
      assert.match(badPhone.error, /10-digit mobile number/);
    });
  });

  describe('3B: Staff Authentication & Role-Based Access Control', () => {
    test('MCC Administrator logs in with Admin role', () => {
      const res = authenticateUser('admin@mcc.gov.in', 'Admin@123');
      assert.equal(res.success, true);
      assert.equal(res.user.role, 'admin');
      assert.equal(res.user.badge, 'Admin');
    });

    test('Department Field Officers authenticate to their respective departments', () => {
      const roads = authenticateUser('roads', 'Officer@123');
      assert.equal(roads.success, true);
      assert.equal(roads.user.role, 'field_officer');
      assert.equal(roads.user.department_id, 2);

      const swm = authenticateUser('swm', 'Officer@123');
      assert.equal(swm.success, true);
      assert.equal(swm.user.role, 'field_officer');
      assert.equal(swm.user.department_id, 1);
    });

    test('Ward Corporators authenticate with designated ward scoping', () => {
      const corp12 = authenticateUser('ward12', 'Corporator@123');
      assert.equal(corp12.success, true);
      assert.equal(corp12.user.role, 'corporator');
      assert.equal(corp12.user.ward_id, 12);
    });
  });

  describe('3C: Automatic Category & Department Dispatch Resolution', () => {
    test('Resolves pothole issues to Roads & Infrastructure (dept 2)', () => {
      const { category, department } = resolveCategoryAndDepartment('Huge pothole on Sayyaji Rao road');
      assert.match(category.name, /Pothole/);
      assert.equal(department.id, 2);
    });

    test('Resolves streetlight issues to Electrical & Street Lighting (dept 3)', () => {
      const { category, department } = resolveCategoryAndDepartment('Streetlight pole dark near junction');
      assert.match(category.name, /Streetlight/);
      assert.equal(department.id, 3);
    });

    test('Resolves water leakage to Water Supply & Sewerage (dept 4)', () => {
      const { category, department } = resolveCategoryAndDepartment('Drinking water pipe burst and leaking');
      assert.match(category.name, /Water/);
      assert.equal(department.id, 4);
    });

    test('Resolves garbage issues to Solid Waste Management (dept 1)', () => {
      const { category, department } = resolveCategoryAndDepartment('Garbage overflow on street corner');
      assert.match(category.name, /Garbage/);
      assert.equal(department.id, 1);
    });
  });

  describe('3D: Authentic Mysuru GIS & Point-in-Polygon Boundary Verification', () => {
    test('Validates GPS inside authentic Mysuru ward (Agrahara / Palace area)', () => {
      const res = lookupWard(12.3051, 76.6551);
      assert.equal(res.outside_mcc_boundary, false);
      assert.ok(res.ward_number > 0);
      assert.ok(res.ward_name);
    });

    test('Flags GPS coordinates far outside Mysuru boundary (e.g. Bengaluru)', () => {
      const res = lookupWard(12.9716, 77.5946); // Bengaluru coordinates
      assert.equal(res.outside_mcc_boundary, true);
    });
  });

  describe('3E: S3 Direct Upload Scoping & Anti-Tampering', () => {
    test('Generates isolated S3 object keys matching complaints/<id>/<filename>', () => {
      const issueKey = generateObjectKey('uuid-101', 'issue', '.jpg');
      assert.ok(verifyObjectKeyScope(issueKey, 'uuid-101', 'issue'));
      assert.match(issueKey, /^complaints\/uuid-101\/\d+-[a-f0-9]{12}\.jpg$/);
    });

    test('Generates resolution S3 keys matching resolutions/<id>/<filename>', () => {
      const resKey = generateObjectKey('uuid-202', 'resolution', '.png');
      assert.ok(verifyObjectKeyScope(resKey, 'uuid-202', 'resolution'));
      assert.match(resKey, /^resolutions\/uuid-202\/\d+-[a-f0-9]{12}\.png$/);
    });

    test('Rejects S3 objectKey scope tampering across complaints', () => {
      const key = 'complaints/uuid-999/1700-photo.jpg';
      assert.equal(verifyObjectKeyScope(key, 'uuid-101', 'issue'), false);
    });
  });

  describe('3F: Spatial DBSCAN & Ward Civic Health Index Preservation', () => {
    test('Calculates Haversine distance in meters accurately for geotags', () => {
      // 0.001 degree of latitude is approximately 111 meters
      const dist = haversineMeters(12.3000, 76.6500, 12.3010, 76.6500);
      assert.ok(dist >= 105 && dist <= 115, `Expected ~111m, got ${dist}`);
    });

    test('DBSCAN groups nearby complaints into active civic hotspots', () => {
      const testComplaints = [
        { id: 1, latitude: 12.3000, longitude: 76.6500, category_name: 'Pothole', status: 'Submitted' },
        { id: 2, latitude: 12.3002, longitude: 76.6501, category_name: 'Pothole', status: 'Submitted' },
        { id: 3, latitude: 12.3001, longitude: 76.6502, category_name: 'Pothole', status: 'Submitted' }
      ];
      const hotspots = runDBSCAN(testComplaints);
      assert.ok(Array.isArray(hotspots));
      assert.ok(hotspots.length > 0);
      assert.equal(hotspots[0].complaint_count, 3);
    });

    test('Ward Civic Health Score correctly penalizes overdue and high priority issues', () => {
      const mockComplaints = [
        { id: 1, ward_id: 12, ward_number: 12, ward_name: 'J P Nagar', status: 'RESOLVED', priority: 'LOW', sla_due_at: new Date().toISOString() },
        { id: 2, ward_id: 12, ward_number: 12, ward_name: 'J P Nagar', status: 'OVERDUE', priority: 'HIGH', sla_due_at: new Date(Date.now() - 3600000).toISOString() }
      ];
      const scores = computeWardHealthScores(mockComplaints);
      assert.ok(Array.isArray(scores));
      const ward12 = scores.find(s => s.ward_id === 12);
      assert.ok(ward12);
      assert.ok(ward12.health_score < 100, 'Score should be penalized due to overdue complaint');
      assert.equal(ward12.factors.overdue_count, 1);
    });
  });

});

