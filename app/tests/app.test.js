const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadConfig } = require('../src/config');
const { createApp } = require('../src/app');

describe('SecureCare Healthcare Application Security & Functional Suite', () => {
  let server;
  let baseUrl;
  let testEnv;

  before(async () => {
    testEnv = {
      NODE_ENV: 'test',
      PORT: '0',
      JWT_SECRET: crypto.randomBytes(24).toString('hex'),
      ADMIN_PASS_ENV: crypto.randomBytes(16).toString('hex'),
      DOCTOR_PASS_ENV: crypto.randomBytes(16).toString('hex'),
      NURSE_PASS_ENV: crypto.randomBytes(16).toString('hex'),
    };
    const cfg = loadConfig(testEnv);
    const { app } = createApp(cfg);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function loginAs(username, password) {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  it('exposes /health, /ready, and hardened security headers', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.equal(data.syntheticDataOnly, true);

    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
    assert.ok(res.headers.get('permissions-policy')?.includes('geolocation=()'));

    const readyRes = await fetch(`${baseUrl}/ready`);
    assert.equal(readyRes.status, 200);
  });

  it('denies unauthenticated access to patient records and tracks telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/patients`);
    assert.equal(res.status, 401);

    const badLogin = await loginAs('dr.sharma', 'wrong-secret-attempt');
    assert.equal(badLogin.status, 401);

    const metricsRes = await fetch(`${baseUrl}/metrics`);
    assert.equal(metricsRes.status, 200);
    const metricsText = await metricsRes.text();
    assert.match(metricsText, /securecare_unauthorized_access_total/);
    assert.match(metricsText, /securecare_auth_login_attempts_total\{outcome="failure",app="securecare"\}\s+1/);
  });

  it('enforces input validation and creates synthetic patient & appointment for doctor role', async () => {
    const login = await loginAs('dr.sharma', testEnv.DOCTOR_PASS_ENV);
    assert.equal(login.status, 200);
    const authHeader = { Authorization: `Bearer ${login.body.token}` };

    // Reject XSS payload in patient name
    const xssRes = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        fullName: '<script>alert(1)</script>',
        age: 35,
        gender: 'Female',
        bloodGroup: 'O+',
        department: 'Cardiology',
        maskedContact: 'XXXX-XX-1111',
        summaryNote: 'test',
      }),
    });
    assert.equal(xssRes.status, 400);

    // Create valid synthetic patient
    const createRes = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        fullName: 'Riya Bose (Synthetic)',
        age: 31,
        gender: 'Female',
        bloodGroup: 'B+',
        department: 'Cardiology',
        maskedContact: 'XXXX-XX-9988',
        summaryNote: 'Synthetic cardiology checkup',
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.ok(created.patient.id.startsWith('SC-'));

    // Create synthetic appointment for newly created patient
    const apptRes = await fetch(`${baseUrl}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        patientId: created.patient.id,
        clinician: 'Dr. Kavita Sharma',
        department: 'Cardiology',
        scheduledDate: '2026-11-20T11:30',
        reason: 'Synthetic follow-up',
      }),
    });
    assert.equal(apptRes.status, 201);
  });

  it('enforces least-privilege RBAC across nurse, doctor, and admin roles', async () => {
    const nurseLogin = await loginAs('nurse.patel', testEnv.NURSE_PASS_ENV);
    assert.equal(nurseLogin.status, 200);
    const nurseHeaders = { Authorization: `Bearer ${nurseLogin.body.token}` };

    // Nurse can list patients
    const listRes = await fetch(`${baseUrl}/api/patients`, { headers: nurseHeaders });
    assert.equal(listRes.status, 200);

    // Nurse cannot create patient (403)
    const forbidCreate = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...nurseHeaders },
      body: JSON.stringify({
        fullName: 'Blocked Create',
        age: 25,
        gender: 'Male',
        bloodGroup: 'O+',
        department: 'Cardiology',
        maskedContact: 'XXXX-XX-0000',
        summaryNote: 'test',
      }),
    });
    assert.equal(forbidCreate.status, 403);

    // Doctor cannot delete patient (403)
    const doctorLogin = await loginAs('dr.sharma', testEnv.DOCTOR_PASS_ENV);
    const forbidDelete = await fetch(`${baseUrl}/api/patients/SC-1006`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${doctorLogin.body.token}` },
    });
    assert.equal(forbidDelete.status, 403);

    // Admin can delete synthetic patient (200)
    const adminLogin = await loginAs('admin.securecare', testEnv.ADMIN_PASS_ENV);
    const allowDelete = await fetch(`${baseUrl}/api/patients/SC-1006`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    });
    assert.equal(allowDelete.status, 200);
  });

  it('supports dashboard summary, patient updates, appointment status workflow, cookie auth, and safe error handling', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'dr.sharma', password: testEnv.DOCTOR_PASS_ENV }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    const cookiePair = setCookie.split(';')[0];
    assert.ok(cookiePair.startsWith('securecare_session='));

    const cookieHeaders = { Cookie: cookiePair, 'Content-Type': 'application/json' };

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: cookieHeaders });
    assert.equal(meRes.status, 200);
    const meJson = await meRes.json();
    assert.equal(meJson.user.role, 'doctor');

    const summaryRes = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: cookieHeaders });
    assert.equal(summaryRes.status, 200);
    const summary = await summaryRes.json();
    assert.ok(summary.totalPatients >= 5);

    const patchPatient = await fetch(`${baseUrl}/api/patients/SC-1001`, {
      method: 'PATCH',
      headers: cookieHeaders,
      body: JSON.stringify({ summaryNote: 'Updated synthetic cardiology note' }),
    });
    assert.equal(patchPatient.status, 200);

    const getAppts = await fetch(`${baseUrl}/api/appointments?status=Scheduled`, { headers: cookieHeaders });
    assert.equal(getAppts.status, 200);

    const patchAppt = await fetch(`${baseUrl}/api/appointments/APT-5001/status`, {
      method: 'PATCH',
      headers: cookieHeaders,
      body: JSON.stringify({ status: 'Checked-In' }),
    });
    assert.equal(patchAppt.status, 200);

    const malformed = await fetch(`${baseUrl}/api/patients`, {
      method: 'POST',
      headers: cookieHeaders,
      body: '{bad-json',
    });
    assert.equal(malformed.status, 400);

    const notFound = await fetch(`${baseUrl}/api/unknown-route`, { headers: cookieHeaders });
    assert.equal(notFound.status, 404);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: cookieHeaders });
    assert.equal(logoutRes.status, 200);
  });
});
