// The 7 tests required by PRD — Student Identity (Team 01):
// sign-in, role check, consent grant/revoke, token expiry, profile validation,
// service scope, audit event.   Run: npm test
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { tables, reset, start, stop, api, token, settle } = require('./helpers');

before(start);
after(stop);
beforeEach(reset);

const STUDENT = '6731500001'; // seeded in helpers.js

describe('1. sign-in', () => {
  test('sign up returns a working token; login checks the password', async () => {
    const signup = await api('POST', '/auth/signup', {
      body: { studentId: '6731503029', firstName: 'Bee', lastName: 'Test', email: 'bee@lamduan.mfu.ac.th', password: 'secret123' },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.role, 'student');

    const me = await api('GET', '/me', { token: signup.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.student_id, '6731503029');
    assert.ok(!JSON.stringify(tables.accounts).includes('secret123'), 'password must not be stored in plain text');

    assert.equal((await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'wrong-pass' } })).status, 401);
    const login = await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'secret123' } });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const t = login.body.token;
    assert.equal((await api('POST', '/auth/change-password', { token: t, body: { currentPassword: 'wrong-pass', newPassword: 'newsecret1' } })).status, 400, 'wrong current password is 400, not 401, so the client is not signed out');
    assert.equal((await api('POST', '/auth/change-password', { token: t, body: { currentPassword: 'secret123', newPassword: 'short' } })).status, 400);
    assert.equal((await api('POST', '/auth/change-password', { token: t, body: { currentPassword: 'secret123', newPassword: 'newsecret1' } })).status, 204);
    assert.equal((await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'secret123' } })).status, 401, 'old password stops working');
    assert.equal((await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'newsecret1' } })).status, 200);

    const dup = await api('POST', '/auth/signup', {
      body: { studentId: '6731503029', firstName: 'X', lastName: 'Y', email: 'x@y.com', password: 'secret123' },
    });
    assert.equal(dup.status, 409);
  });
});

describe('2. role check', () => {
  test('only staff can create students; instructors read but cannot delete', async () => {
    const body = { studentId: '6731509999', firstName: 'New', lastName: 'Kid', email: 'new@lamduan.mfu.ac.th' };
    assert.equal((await api('POST', '/students', { token: token(STUDENT, 'student'), body })).status, 403);
    assert.equal((await api('POST', '/students', { token: token('staff-1', 'staff'), body })).status, 201);

    const instructor = token('ins-1', 'instructor');
    assert.equal((await api('GET', '/students', { token: instructor })).status, 200);
    assert.equal((await api('DELETE', `/students/${STUDENT}`, { token: instructor })).status, 403);
    assert.equal((await api('GET', '/students/6731509999', { token: token(STUDENT, 'student') })).status, 403,
      'a student cannot read someone else\'s profile');
  });

  test('a role assigned by staff is carried into the next sign-in token', async () => {
    await api('POST', '/auth/signup', {
      body: { studentId: '6731503029', firstName: 'Bee', lastName: 'Test', email: 'bee@lamduan.mfu.ac.th', password: 'secret123' },
    });
    assert.equal((await api('PUT', '/roles/6731503029', { token: token(STUDENT, 'student'), body: { role: 'staff' } })).status, 403);
    assert.equal((await api('PUT', '/roles/6731503029', { token: token('staff-1', 'staff'), body: { role: 'staff' } })).status, 200);
    const login = await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'secret123' } });
    const verify = await api('POST', '/tokens/verify', { body: { token: login.body.token } });
    assert.equal(verify.body.role, 'staff');
  });
});

describe('3. consent grant/revoke', () => {
  test('claims are denied until the student grants consent, and denied again after revoke', async () => {
    const svc = token('internship-service', 'service', ['profile:read']);
    const student = token(STUDENT, 'student');
    const claims = () => api('GET', `/students/${STUDENT}/claims`, { token: svc });

    assert.equal((await claims()).status, 403);

    const grant = await api('PUT', '/me/consents/internship-service', { token: student, body: { scopes: ['profile:read'] } });
    assert.equal(grant.status, 200);
    const ok = await claims();
    assert.equal(ok.status, 200);
    assert.equal(ok.body.studentId, STUDENT);

    assert.equal((await api('DELETE', '/me/consents/internship-service', { token: student })).status, 204);
    assert.equal((await claims()).status, 403);

    const bad = await api('PUT', '/me/consents/internship-service', { token: student, body: { scopes: ['admin:all'] } });
    assert.equal(bad.status, 400, 'unknown scopes cannot be granted');
  });
});

describe('4. token expiry', () => {
  test('expired and tampered tokens are rejected', async () => {
    const expired = token(STUDENT, 'student', [], { expiresIn: -10 });
    assert.equal((await api('GET', '/me', { token: expired })).status, 401);
    assert.deepEqual((await api('POST', '/tokens/verify', { body: { token: expired } })).body, { valid: false });

    const good = token(STUDENT, 'student');
    const tampered = good.slice(0, -2) + (good.endsWith('aa') ? 'bb' : 'aa');
    assert.equal((await api('GET', '/me', { token: tampered })).status, 401);
    assert.equal((await api('GET', '/me')).status, 401, 'no token at all');

    const verify = await api('POST', '/tokens/verify', { body: { token: good } });
    assert.equal(verify.body.valid, true);
    assert.ok(new Date(verify.body.expiresAt) > new Date());
  });
});

describe('5. profile validation', () => {
  test('PATCH /me rejects locked fields and bad values, accepts valid edits', async () => {
    const t = token(STUDENT, 'student');
    const patch = (body) => api('PATCH', '/me', { token: t, body });

    const locked = await patch({ student_id: '0000000000' });
    assert.equal(locked.status, 400);
    assert.ok(locked.body.fields.student_id);
    assert.equal((await patch({ email: 'not-an-email' })).status, 400);
    assert.equal((await patch({ age: 500 })).status, 400);
    assert.equal((await patch({ first_name: '   ' })).status, 400);
    assert.equal((await patch({})).status, 400);
    assert.equal(tables.students[0].student_id, STUDENT, 'nothing changed after rejected edits');

    const ok = await patch({ first_name: 'Annie', age: 21 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.first_name, 'Annie');
    assert.equal(ok.body.age, 21);

    const signup = await api('POST', '/auth/signup', { body: { studentId: '12', email: 'x', password: 'a' } });
    assert.equal(signup.status, 400);
    assert.deepEqual(Object.keys(signup.body.fields).sort(), ['email', 'firstName', 'lastName', 'password', 'studentId']);
  });
});

describe('6. service scope', () => {
  test('claims need the profile:read scope even when consent exists', async () => {
    tables.consents.push({ student_id: STUDENT, grantee_id: 'internship-service', scopes: ['profile:read'] });

    const noScope = token('internship-service', 'service', []);
    const r1 = await api('GET', `/students/${STUDENT}/claims`, { token: noScope });
    assert.equal(r1.status, 403);
    assert.match(r1.body.error, /profile:read/);

    const otherService = token('job-board', 'service', ['profile:read']);
    assert.equal((await api('GET', `/students/${STUDENT}/claims`, { token: otherService })).status, 403,
      'consent is per service, not shared');

    const withScope = token('internship-service', 'service', ['profile:read']);
    assert.equal((await api('GET', `/students/${STUDENT}/claims`, { token: withScope })).status, 200);
  });
});

describe('7. audit event', () => {
  test('allowed and denied access are both written to the audit log', async () => {
    const svc = token('internship-service', 'service', ['profile:read']);
    await api('GET', `/students/${STUDENT}/claims`, { token: svc }); // denied: no consent
    await api('PUT', '/me/consents/internship-service', { token: token(STUDENT, 'student'), body: { scopes: ['profile:read'] } });
    await api('GET', `/students/${STUDENT}/claims`, { token: svc }); // allowed
    await api('POST', '/auth/login', { body: { studentId: STUDENT, password: 'nope-nope' } }); // denied login
    await settle();

    const find = (action, result) => tables.audit_events.find((e) => e.action === action && e.result === result);
    const denied = find('read_claims', 'deny:no_consent');
    assert.ok(denied, 'deny event recorded');
    assert.equal(denied.actor, 'internship-service');
    assert.equal(denied.resource, `/students/${STUDENT}/claims`);
    assert.ok(find('grant_consent', 'allow:profile:read'), 'consent grant recorded');
    assert.ok(find('read_claims', 'allow'), 'allow event recorded');
    assert.ok(find('login', 'deny:bad_credentials'), 'failed login recorded');
  });
});

describe('8. service API key (extra)', () => {
  test('staff issues a key and can copy it again; the key reads claims only with consent; bad key is 401', async () => {
    const created = await api('POST', '/service-clients', { token: token('staff-1', 'staff'), body: { name: 'job-board' } });
    assert.equal(created.status, 201);
    const key = created.body.apiKey;
    assert.match(key, /^sik_/);
    assert.ok(!JSON.stringify(tables.service_clients).includes(key), 'key is never stored in plain text');
    const listed = (await api('GET', '/dev/service-clients')).body.records;
    assert.equal(listed.some((r) => 'api_key_hash' in r || 'api_key_enc' in r), false, 'hash/ciphertext never leave the server');

    const copy = await api('GET', `/service-clients/${created.body.id}/key`, { token: token('staff-1', 'staff') });
    assert.equal(copy.status, 200);
    assert.equal(copy.body.apiKey, key, 'staff can copy the same key again later');
    assert.equal((await api('GET', `/service-clients/${created.body.id}/key`, { token: token(STUDENT, 'student') })).status, 403);

    const claims = () => api('GET', `/students/${STUDENT}/claims`, { headers: { 'X-API-Key': key } });
    assert.equal((await claims()).status, 403, 'no consent yet');
    await api('PUT', '/me/consents/job-board', { token: token(STUDENT, 'student'), body: { scopes: ['profile:read'] } });
    const ok = await claims();
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.claims.name, { first: 'Ann', last: 'Lee' });
    assert.equal(ok.body.claims.profileComplete, true);
    assert.ok(!('email' in ok.body.claims), 'private fields are not shared');

    assert.equal((await api('GET', `/students/${STUDENT}/claims`, { headers: { 'X-API-Key': 'sik_wrong' } })).status, 401);
    const rotated = await api('POST', `/service-clients/${created.body.id}/keys`, { token: token('staff-1', 'staff') });
    assert.equal(rotated.status, 201);
    assert.equal((await claims()).status, 401, 'old key stops working after rotation');
    assert.equal((await api('GET', `/students/${STUDENT}/claims`, { headers: { 'X-API-Key': rotated.body.apiKey } })).status, 200);
  });
});
