/**
 * Backend adapters for other teams' APIs (Pod 1). The browser never calls
 * them directly: our routes call these, normalise the data, and turn any
 * failure into a clear 503 the UI can show as "service unavailable".
 *
 * Configure with env vars (all optional — unset means "not connected yet"):
 *   COURSE_CATALOG_URL   base URL, e.g. https://course-catalog.onrender.com
 *   ENROLLMENT_URL       base URL
 *   TIMETABLE_URL        base URL
 *   GRADES_URL           base URL
 * Paths can be overridden if a team uses different ones (see PATHS below).
 *
 * Auth: by default the signed-in user's Identity token is forwarded as
 * `Authorization: Bearer` so the other team can check it with POST /tokens/verify.
 * If a team issues its own tokens instead, put a service token they give us in
 *   COURSE_CATALOG_TOKEN / ENROLLMENT_TOKEN / TIMETABLE_TOKEN / GRADES_TOKEN
 * and that is sent instead (server-side only, never to the browser).
 */

const SERVICES = {
  catalog: { env: 'COURSE_CATALOG_URL', tokenEnv: 'COURSE_CATALOG_TOKEN', name: process.env.COURSE_CATALOG_NAME || 'Course Catalog (Team 02)' },
  enrollment: { env: 'ENROLLMENT_URL', tokenEnv: 'ENROLLMENT_TOKEN', name: process.env.ENROLLMENT_NAME || 'Enrollment (Team 03)' },
  timetable: { env: 'TIMETABLE_URL', tokenEnv: 'TIMETABLE_TOKEN', name: process.env.TIMETABLE_NAME || 'Timetable & Room (Team 04)' },
  grades: { env: 'GRADES_URL', tokenEnv: 'GRADES_TOKEN', name: process.env.GRADES_NAME || 'Grades service' },
};

const PATHS = {
  courses: process.env.COURSE_CATALOG_COURSES_PATH || '/courses',
  course: process.env.COURSE_CATALOG_COURSE_PATH || '/courses/{code}',
  sections: process.env.COURSE_CATALOG_SECTIONS_PATH || '/courses/{code}/sections',
  register: process.env.ENROLLMENT_REGISTER_PATH || '/enrollments',
  enrollmentStatus: process.env.ENROLLMENT_STATUS_PATH || '/students/{studentId}/enrollments',
  timetable: process.env.TIMETABLE_PATH || '/timetable/{studentId}',
  grades: process.env.GRADES_PATH || '/grades/{studentId}',
};

const TIMEOUT_MS = Number(process.env.EXTERNAL_TIMEOUT_MS || 20000); // Render free tier can take a while to wake

class ExternalError extends Error {
  constructor(service, code, status, message, upstreamStatus) {
    super(message);
    this.service = service; this.code = code; this.status = status; this.upstreamStatus = upstreamStatus;
  }
  toJSON() {
    return { error: this.message, code: this.code, service: SERVICES[this.service].name, upstreamStatus: this.upstreamStatus };
  }
}

const baseUrl = (svc) => (process.env[SERVICES[svc].env] || '').replace(/\/+$/, '');
const configured = (svc) => !!baseUrl(svc);
const fill = (path, vars) => path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k] ?? ''));

function status() {
  return Object.fromEntries(Object.entries(SERVICES).map(([k, v]) => [k, { name: v.name, configured: configured(k) }]));
}

async function call(svc, path, { method = 'GET', body, token, query } = {}) {
  const base = baseUrl(svc);
  token = (process.env[SERVICES[svc].tokenEnv] || '').trim() || token; // team-issued service token wins
  const name = SERVICES[svc].name;
  if (!base) throw new ExternalError(svc, 'service_not_configured', 503, `${name} is not connected yet`);
  const url = new URL(base + path);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && v !== '' && url.searchParams.set(k, v));
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ExternalError(svc, 'service_unavailable', 503, `${name} is unavailable right now`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
  if (res.status >= 500) throw new ExternalError(svc, 'service_unavailable', 503, `${name} is unavailable right now`, res.status);
  if (res.status === 401 || (res.status === 403 && svc === 'catalog')) { // our credentials were refused
    throw new ExternalError(svc, 'service_auth_failed', 502, `${name} rejected Student Identity's credentials`, res.status);
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${name} rejected the request`;
    throw new ExternalError(svc, 'upstream_rejected', res.status === 404 ? 404 : res.status === 401 || res.status === 403 ? 403 : 409, msg, res.status);
  }
  if (text && data === null) throw new ExternalError(svc, 'service_unavailable', 503, `${name} returned an unexpected response`, res.status);
  return data;
}

// ---------- normalisers (accept the common shapes other teams might use) ----------
const listOf = (d, ...keys) => (Array.isArray(d) ? d : keys.map((k) => d && d[k]).find(Array.isArray) || []);
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function normCourse(c = {}) {
  const code = c.code || c.courseCode || c.course_code || c.id || null;
  const prereqRaw = c.prerequisites ?? c.prereqs ?? c.prerequisite ?? [];
  const prerequisites = (Array.isArray(prereqRaw) ? prereqRaw : String(prereqRaw).split(/[,;]\s*/))
    .map((p) => (typeof p === 'string' ? p : p && (p.code || p.courseCode || p.prerequisiteCode || p.requires || (p.course && p.course.code) || p.requiredCourseCode || p.prerequisiteCourseId || p.courseId)))
    .filter(Boolean);
  const capacity = num(c.capacity ?? c.maxSeats ?? c.max_seats);
  const enrolled = num(c.enrolled ?? c.enrolledCount ?? c.enrolled_count);
  let seatsLeft = num(c.seatsLeft ?? c.seats_left ?? c.availableSeats ?? c.available_seats);
  if (seatsLeft === null && capacity !== null && enrolled !== null) seatsLeft = Math.max(0, capacity - enrolled);
  const ins = c.instructor ?? c.instructors ?? c.lecturer;
  const nameOf = (i) => (typeof i === 'string' ? i : i && (i.displayName || i.name || i.fullName));
  const instructor = Array.isArray(ins) ? ins.map(nameOf).filter(Boolean).join(', ') || null
    : typeof ins === 'object' && ins ? nameOf(ins) || null : ins || null;
  return {
    id: c.id || null,
    code,
    status: c.status || null,      // draft | published | archived (Team 02)
    level: c.level || null,
    title: c.title || c.name || c.courseName || c.course_name || code,
    credits: num(c.credits ?? c.credit ?? c.units),
    description: c.description || c.summary || c.aiSummary || '',
    instructor,
    faculty: c.faculty || c.department || c.school || null,
    prerequisites,
    capacity,
    seatsLeft,
    sections: listOf(c.sections, 'sections').map(normSection),
  };
}

function normSection(s = {}) {
  return {
    id: s.id || s.section || s.sectionId || s.section_id || null,
    day: s.day || s.weekday || null,
    start: s.start || s.startTime || s.start_time || null,
    end: s.end || s.endTime || s.end_time || null,
    room: s.room || s.location || null,
    seatsLeft: num(s.seatsLeft ?? s.seats_left ?? s.availableSeats),
    instructor: s.instructor || null,
  };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function normDay(d) {
  if (d === null || d === undefined) return null;
  if (typeof d === 'number') return DAYS[d % 7];
  const s = String(d).trim().slice(0, 3).toLowerCase();
  const i = DAYS.findIndex((x) => x.toLowerCase() === s);
  if (i >= 0) return DAYS[i];
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : DAYS[date.getDay()];
}

function normClass(e = {}) {
  return {
    courseCode: e.courseCode || e.course_code || e.code || (e.course && (e.course.code || e.course)) || null,
    title: e.title || e.courseName || e.name || (e.course && e.course.title) || null,
    day: normDay(e.day ?? e.weekday ?? e.dayOfWeek ?? e.date),
    start: e.start || e.startTime || e.start_time || null,
    end: e.end || e.endTime || e.end_time || null,
    room: e.room || e.location || e.roomName || null,
    section: e.section || e.sectionId || null,
  };
}

// Common Thai university letter scale.
const POINTS = { A: 4, 'B+': 3.5, B: 3, 'C+': 2.5, C: 2, 'D+': 1.5, D: 1, F: 0 };
function normGrades(data) {
  const rows = listOf(data, 'grades', 'courses', 'results', 'data').map((g) => ({
    term: String(g.term || g.semester || g.academicTerm || 'Unknown term'),
    courseCode: g.courseCode || g.course_code || g.code || null,
    title: g.title || g.courseName || g.name || null,
    credits: num(g.credits ?? g.credit),
    grade: g.grade != null ? String(g.grade).toUpperCase() : null,
  }));
  const gpa = (list) => {
    const counted = list.filter((r) => r.grade in POINTS && r.credits);
    const credits = counted.reduce((a, r) => a + r.credits, 0);
    return { credits, gpa: credits ? Math.round((counted.reduce((a, r) => a + POINTS[r.grade] * r.credits, 0) / credits) * 100) / 100 : null };
  };
  const terms = [...new Set(rows.map((r) => r.term))].map((term) => {
    const courses = rows.filter((r) => r.term === term);
    return { term, courses, ...gpa(courses) };
  });
  return { terms, cumulative: gpa(rows) };
}

// ---------- operations used by the routes ----------
async function listCourses({ q, token } = {}) {
  const data = await call('catalog', PATHS.courses, { token, query: { q, limit: 100 } });
  return listOf(data, 'courses', 'data', 'items', 'results').map(normCourse);
}

async function getCourse(code, { token } = {}) {
  let data;
  try {
    data = await call('catalog', fill(PATHS.course, { code }), { token });
  } catch (err) {
    // Some catalogs look courses up by internal id (e.g. crs_…), not code.
    if (!(err instanceof ExternalError) || err.status !== 404) throw err;
    const match = (await listCourses({ q: code, token })).find((c) => c.code === code && c.id && c.id !== code);
    if (!match) throw err;
    data = await call('catalog', fill(PATHS.course, { code: match.id }), { token });
  }
  const course = normCourse((data && (data.course || data.data)) || data);
  if (course.prerequisites.some((p) => /^crs_/.test(p))) {
    try {
      const byId = Object.fromEntries((await listCourses({ token })).filter((c) => c.id).map((c) => [c.id, c.code]));
      course.prerequisites = course.prerequisites.map((p) => byId[p] || p);
    } catch (e) { /* keep ids */ }
  }
  if (!course.sections.length) {
    try {
      const s = await call('catalog', fill(PATHS.sections, { code: course.id || code }), { token });
      course.sections = listOf(s, 'sections', 'data').map(normSection);
    } catch (e) { /* sections are optional */ }
  }
  return course;
}

async function register({ studentId, courseCode, section, token }) {
  const data = await call('enrollment', PATHS.register, { method: 'POST', token, body: { studentId, courseCode, section } });
  const status = String((data && (data.status || data.state || data.result)) || 'submitted').toLowerCase();
  return { status, message: (data && (data.message || data.reason)) || null, raw: data };
}

async function enrollmentStatus(studentId, { token } = {}) {
  const data = await call('enrollment', fill(PATHS.enrollmentStatus, { studentId }), { token });
  if (data && typeof data.enrolled === 'boolean') return data.enrolled;
  return listOf(data, 'enrollments', 'data', 'courses').some((e) => !e.status || /enrol|approv|active|confirm/i.test(e.status));
}

async function timetable(studentId, { token } = {}) {
  const data = await call('timetable', fill(PATHS.timetable, { studentId }), { token });
  return listOf(data, 'entries', 'classes', 'schedule', 'timetable', 'data').map(normClass);
}

async function grades(studentId, { token } = {}) {
  return normGrades(await call('grades', fill(PATHS.grades, { studentId }), { token }));
}

module.exports = {
  ExternalError, status, configured,
  listCourses, getCourse, register, enrollmentStatus, timetable, grades,
  // exported for tests
  normCourse, normClass, normGrades, DAYS,
};
