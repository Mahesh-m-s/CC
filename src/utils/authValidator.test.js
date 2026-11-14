import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeIdentifier, 
  authenticateUser,
  registerNewUser,
  OFFICIAL_STAFF_ACCOUNTS 
} from './authValidator.js';

test('normalizeIdentifier correctly expands staff aliases', () => {
  assert.equal(normalizeIdentifier('admin'), 'admin@mcc.gov.in');
  assert.equal(normalizeIdentifier('engineer'), 'roads.officer@mcc.gov.in');
  assert.equal(normalizeIdentifier('roads'), 'roads.officer@mcc.gov.in');
  assert.equal(normalizeIdentifier('swm'), 'swm.officer@mcc.gov.in');
  assert.equal(normalizeIdentifier('elec'), 'elec.officer@mcc.gov.in');
  assert.equal(normalizeIdentifier('water'), 'water.officer@mcc.gov.in');
  assert.equal(normalizeIdentifier('jpnagar'), 'ward12.corporator@mcc.gov.in');
});

test('authenticateUser authenticates MCC Central Administrator', () => {
  const res = authenticateUser('admin@mcc.gov.in', 'Admin@123');
  assert.equal(res.success, true);
  assert.equal(res.user.role, 'admin');
  assert.equal(res.user.email, 'admin@mcc.gov.in');
  assert.equal(res.user.name, 'MCC Administrator');
});

test('registerNewUser successfully registers a new citizen and validates fields', () => {
  // Empty name failure
  const fail1 = registerNewUser({ name: '', email: 'test@example.com', phone: '9880011223', password: 'password123' });
  assert.equal(fail1.success, false);

  // Short password failure
  const fail2 = registerNewUser({ name: 'Ravi', email: 'test@example.com', phone: '9880011223', password: '123' });
  assert.equal(fail2.success, false);

  // Valid registration
  const valid = registerNewUser({
    name: 'Praveen Gowda',
    email: 'praveen@example.com',
    phone: '9880055443',
    password: 'CitizenSecure123',
    ward_id: 12,
    ward_name: 'J P Nagar'
  });
  assert.equal(valid.success, true);
  assert.equal(valid.user.role, 'citizen');
  assert.equal(valid.user.email, 'praveen@example.com');
  assert.equal(valid.user.name, 'Praveen Gowda');
  assert.equal(valid.user.ward_name, 'J P Nagar');
});

test('authenticateUser authenticates a newly registered citizen account', () => {
  const customUsers = [
    {
      id: 999,
      name: 'Ananya Sharma',
      email: 'ananya@gmail.com',
      phone: '9880077889',
      password: 'MyPassword123',
      role: 'citizen',
      ward_name: 'Agrahara'
    }
  ];

  // By email
  const emailLogin = authenticateUser('ananya@gmail.com', 'MyPassword123', customUsers);
  assert.equal(emailLogin.success, true);
  assert.equal(emailLogin.user.name, 'Ananya Sharma');
  assert.equal(emailLogin.user.role, 'citizen');

  // By phone
  const phoneLogin = authenticateUser('9880077889', 'MyPassword123', customUsers);
  assert.equal(phoneLogin.success, true);
  assert.equal(phoneLogin.user.email, 'ananya@gmail.com');

  // Wrong password
  const wrongPass = authenticateUser('ananya@gmail.com', 'WrongPass999', customUsers);
  assert.equal(wrongPass.success, false);
});
