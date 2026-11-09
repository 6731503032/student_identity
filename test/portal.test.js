// Portal pages: suspension, staff password reset, public verify, external
// adapters (with a mock Course Catalog / Enrollment / Timetable / Grades
// server), admin APIs, announcements and profile photo/faculty.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { tables, reset, start, stop, api, token, settle } = require('./helpers');

const STUDENT = '6731500001'; // seeded in helpers.js
const staff = () => token('staff-1', 'staff');

// ---- mock external services (one server, routed by path) ----
let mock, mockUrl, down = false;
before(async () => {
  await start();
  mock = http.createServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (down) return send(502, { error: 'bad gateway' });
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/courses') {
        return send(200, { courses: [
          { courseCode: 'SE101', name: 'Intro to SE', credits: 3, capacity: 40, enrolled: 38, prerequisites: [{ code: 'CS100' }], instructor: { name: 'Dr. A' } },
          { code: 'SE201', title: 'Software Architecture', credits: 3, seatsLeft: 0 },
        ] });
      }
      if (u.pathname === '/courses/SE101') return send(200, { courseCode: 'SE101', name: 'Intro to SE', sections: [{ section: '1', day: 'Monday', startTime: '09:00', endTime: '12:00', room: 'C4' }] });
      if (u.pathname === '/courses/NOPE') return send(404, { error: 'Course not found' });
      if (u.pathname === '/enrollments' && req.method === 'POST') {
        const b = JSON.parse(body || '{}');
        mock.lastAuth = req.headers.authorization;
        if (b.courseCode === 'SE101') return send(200, { status: 'rejected', reason: 'Prerequisite CS100 not met' });
        return send(201, { status: 'approved' });
      }
      if (u.pathname === `/students/${STUDENT}/enrollments`) return send(200, { enrolled: true });
      if (u.pathname === `/timetable/${STUDENT}`) return send(200, { entries: [{ course_code: 'SE201', courseName: 'Software Architecture', day: 2, start: '13:00', end: '16:00', location: 'E2-301' }] });
      if (u.pathname === `/grades/${STUDENT}`) {
        return send(200, [
          { term: '1/2568', courseCode: 'SE101', credits: 3, grade: 'A' },
          { term: '1/2568', courseCode: 'MA101', credits: 3, grade: 'B+' },
          { term: '2/2568', courseCode: 'SE201', credits: 3, grade: 'C' },
          { term: '2/2568', courseCode: 'PE100', credits: 1, grade: 'S' },
        ]);
      }
      send(404, { error: 'not found' });
    });
  });
  await new Promise((r) => mock.listen(0, r));
  mockUrl = `http://127.0.0.1:${mock.address().port}`;
});
after(async () => { await stop(); await new Promise((r) => mock.close(r)); });
beforeEach(() => {
  reset(); down = false;
  for (const k of ['COURSE_CATALOG_URL', 'ENROLLMENT_URL', 'TIMETABLE_URL', 'GRADES_URL']) delete process.env[k];
});
const connectAll = () => { for (const k of ['COURSE_CATALOG_URL', 'ENROLLMENT_URL', 'TIMETABLE_URL', 'GRADES_URL']) process.env[k] = mockUrl; };

async function signup(id = '6731503029', password = 'secret123') {
  const r = await api('POST', '/auth/signup', { body: { studentId: id, firstName: 'Bee', lastName: 'Test', email: `${id}@lamduan.mfu.ac.th`, password, faculty: 'School of IT' } });
  assert.equal(r.status, 201);
  return r.body.token;
}

describe('suspension & staff password reset', () => {
  test('suspended users are blocked everywhere; reactivation restores access', async () => {
    const t = await signup();
    assert.equal((await api('POST', '/admin/users/6731503029/suspend', { token: token(STUDENT, 'student') })).status, 403, 'students cannot suspend');
    assert.equal((await api('POST', '/admin/users/6731503029/suspend', { token: staff() })).status, 200);

    assert.equal((await api('GET', '/me', { token: t })).status, 403, 'existing token stops working');
    assert.equal((await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'secret123' } })).status, 403);
    assert.deepEqual((await api('POST', '/tokens/verify', { body: { token: t } })).body, { valid: false, reason: 'suspended' });

    assert.equal((await api('POST', '/admin/users/6731503029/reactivate', { token: staff() })).status, 200);
    assert.equal((await api('GET', '/me', { token: t })).status, 200);
    await settle();
    assert.ok(tables.notifications.some((n) => n.subject === '6731503029' && n.kind === 'suspended'));
  });

  test('staff reset gives a temporary password that works once the old one stops', async () => {
    await signup();
    const r = await api('POST', '/admin/users/6731503029/reset-password', { token: staff() });
    assert.equal(r.status, 200);
    assert.equal(r.body.temporaryPassword.length, 8);
    assert.equal((await api('POST', '/auth/login', { body: { studentId: '6731503029', password: 'secret123' } })).status, 401);
    assert.equal((await api('POST', '/auth/login', { body: { studentId: '6731503029', password: r.body.temporaryPassword } })).status, 200);
  });
});

describe('public verify (QR)', () => {
  test('code shows only valid/enrolled; forged codes fail; suspended is invalid', async () => {
    await signup();
    const qr = await api('GET', '/me/verify-qr', { token: token('6731503029', 'student') });
    assert.equal(qr.status, 200);
    assert.match(qr.body.svg, /^<svg/);
    const code = qr.body.url.split('#/v/')[1];

    const ok = await api('GET', `/verify/${code}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body).sort(), ['checkedAt', 'enrolled', 'valid'], 'no name, ID or email leaks');
    assert.equal(ok.body.valid, true);
    assert.equal(ok.body.enrolled, null, 'unknown while Enrollment is not connected');

    const forged = `${Buffer.from(STUDENT).toString('base64url')}.${code.split('.')[1]}`;
    assert.equal((await api('GET', `/verify/${forged}`)).status, 404);

    await api('POST', '/admin/users/6731503029/suspend', { token: staff() });
    assert.equal((await api('GET', `/verify/${code}`)).body.valid, false);
  });

  test('enrolled comes from the Enrollment service when connected', async () => {
    connectAll();
    const qr = await api('GET', '/me/verify-qr', { token: token(STUDENT, 'student') });
    const r = await api('GET', `/verify/${qr.body.url.split('#/v/')[1]}`);
    assert.deepEqual([r.body.valid, r.body.enrolled], [true, true]);
  });
});

describe('external adapters', () => {
  test('not connected → 503 service_not_configured; down → 503 service_unavailable', async () => {
    const t = token(STUDENT, 'student');
    const r = await api('GET', '/catalog/courses', { token: t });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'service_not_configured');
    connectAll(); down = true;
    for (const path of ['/catalog/courses', '/me/timetable', '/me/grades']) {
      const d = await api('GET', path, { token: t });
      assert.equal(d.status, 503, path);
      assert.equal(d.body.code, 'service_unavailable', path);
    }
  });

  test('courses are normalised from other teams\' shapes', async () => {
    connectAll();
    const r = await api('GET', '/catalog/courses?q=SE', { token: token(STUDENT, 'student') });
    assert.equal(r.status, 200);
    const [se101, se201] = r.body.courses;
    assert.deepEqual([se101.code, se101.title, se101.seatsLeft, se101.prerequisites, se101.instructor], ['SE101', 'Intro to SE', 2, ['CS100'], 'Dr. A']);
    assert.equal(se201.seatsLeft, 0);
    const d = await api('GET', '/catalog/courses/SE101', { token: token(STUDENT, 'student') });
    assert.deepEqual(d.body.course.sections[0], { id: '1', day: 'Monday', start: '09:00', end: '12:00', room: 'C4', seatsLeft: null, instructor: null });
    assert.equal((await api('GET', '/catalog/courses/NOPE', { token: token(STUDENT, 'student') })).status, 404);
  });

  test('registration forwards the user token; rejection → 409 + alert, approval → 200 + alert', async () => {
    connectAll();
    const t = token(STUDENT, 'student');
    const rej = await api('POST', '/catalog/courses/SE101/register', { token: t, body: {} });
    assert.equal(rej.status, 409);
    assert.equal(rej.body.message, 'Prerequisite CS100 not met');
    assert.equal(mock.lastAuth, `Bearer ${t}`, 'other team can verify the user with /tokens/verify');
    assert.equal((await api('POST', '/catalog/courses/SE201/register', { token: t, body: {} })).status, 200);
    assert.equal((await api('POST', '/catalog/courses/SE201/register', { token: staff(), body: {} })).status, 403, 'only students register');
    const n = await api('GET', '/me/notifications', { token: t });
    assert.equal(n.body.unread, 2);
    assert.deepEqual(n.body.notifications.map((x) => x.kind).sort(), ['enrollment_rejected', 'enrollment_update']);
  });

  test('timetable days and GPA are computed', async () => {
    connectAll();
    const t = token(STUDENT, 'student');
    const tt = await api('GET', '/me/timetable', { token: t });
    assert.deepEqual(tt.body.classes[0], { courseCode: 'SE201', title: 'Software Architecture', day: 'Tue', start: '13:00', end: '16:00', room: 'E2-301', section: null });
    const g = await api('GET', '/me/grades', { token: t });
    assert.equal(g.body.terms[0].gpa, 3.75);
    assert.equal(g.body.terms[1].gpa, 2, 'S/U grades are not counted');
    assert.equal(g.body.cumulative.gpa, 3.17);
    assert.equal(g.body.cumulative.credits, 9);
  });
});

describe('admin, announcements, profile', () => {
  test('admin APIs are staff-only and report counts, users and audit', async () => {
    await signup();
    const s = token(STUDENT, 'student');
    for (const p of ['/admin/stats', '/admin/users', '/admin/audit']) assert.equal((await api('GET', p, { token: s })).status, 403, p);
    const stats = await api('GET', '/admin/stats', { token: staff() });
    assert.equal(stats.body.students, 2);
    assert.equal(stats.body.accounts, 1);
    const users = await api('GET', '/admin/users?q=bee', { token: staff() });
    assert.deepEqual(users.body.map((u) => [u.subject, u.role, u.suspended]), [['6731503029', 'student', false]]);
    await settle();
    const log = await api('GET', '/admin/audit?action=signup', { token: staff() });
    assert.ok(log.body.length >= 1 && log.body.every((e) => e.action === 'signup'));
  });

  test('alert settings hide the matching alerts', async () => {
    connectAll();
    const t = token(STUDENT, 'student');
    await api('POST', '/catalog/courses/SE201/register', { token: t, body: {} });
    await api('PUT', '/roles/' + STUDENT, { token: staff(), body: { role: 'instructor' } });
    await settle();
    assert.equal((await api('GET', '/me/notifications', { token: t })).body.notifications.length, 2);
    await api('PUT', '/me/settings', { token: t, body: { notifyEnrollment: false } });
    const n = await api('GET', '/me/notifications', { token: t });
    assert.deepEqual(n.body.notifications.map((x) => x.kind), ['role_changed']);
  });

  test('announcements: staff post, everyone reads', async () => {
    assert.equal((await api('POST', '/announcements', { token: token(STUDENT, 'student'), body: { title: 'x' } })).status, 403);
    assert.equal((await api('POST', '/announcements', { token: staff(), body: { title: '' } })).status, 400);
    assert.equal((await api('POST', '/announcements', { token: staff(), body: { title: 'Exam week', body: 'Good luck' } })).status, 201);
    const list = await api('GET', '/announcements', { token: token(STUDENT, 'student') });
    assert.equal(list.body[0].title, 'Exam week');
  });

  test('faculty and photo are saved; photo never goes to the webhook or student list', async () => {
    const t = token(STUDENT, 'student');
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(400);
    const ok = await api('PATCH', '/me', { token: t, body: { faculty: 'School of IT', photo } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.faculty, 'School of IT');
    assert.ok(!JSON.stringify(ok.body._webhookDebug || {}).includes('base64'), 'photo is not published');
    assert.equal((await api('PATCH', '/me', { token: t, body: { photo: 'javascript:alert(1)' } })).status, 400);
    const list = await api('GET', '/students', { token: staff() });
    assert.equal(list.body[0].hasPhoto, true);
    assert.ok(!('photo' in list.body[0]));
    const set = await api('PUT', '/me/settings', { token: t, body: { notifyAnnouncements: false } });
    assert.equal(set.body.notifyAnnouncements, false);
    assert.equal((await api('PUT', '/me/settings', { token: t, body: { hack: true } })).status, 400);
  });
});
