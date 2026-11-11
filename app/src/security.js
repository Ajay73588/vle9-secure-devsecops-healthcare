const crypto = require('node:crypto');

const ALLOWED_GENDERS = new Set(['Female', 'Male', 'Non-Binary', 'Prefer Not to Say']);
const ALLOWED_BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const ALLOWED_DEPARTMENTS = new Set([
  'Cardiology',
  'General Medicine',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
  'Oncology',
]);
const ALLOWED_APPT_STATUSES = new Set(['Scheduled', 'Checked-In', 'Completed', 'Cancelled']);

function hashSecretValue(plainText) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainText, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifySecretValue(plainText, storedHash) {
  if (typeof plainText !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }
  const [salt, hexKey] = parts;
  const derivedBuf = crypto.scryptSync(plainText, salt, 64);
  const storedBuf = Buffer.from(hexKey, 'hex');
  if (derivedBuf.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(derivedBuf, storedBuf);
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function fromBase64Url(input) {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

function signAuthToken(payload, secret, ttlSeconds) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const nowSec = Math.floor(Date.now() / 1000);
  const body = toBase64Url(
    JSON.stringify({
      ...payload,
      iat: nowSec,
      exp: nowSec + ttlSeconds,
    })
  );
  const signingInput = `${header}.${body}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `${signingInput}.${sig}`;
}

function verifyAuthToken(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) {
    return null;
  }
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }
  const [header, body, sig] = segments;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (actualBuf.length !== expectedBuf.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fromBase64Url(body));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < nowSec) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0 || cookieHeader.length > 4096) {
    return cookies;
  }
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (key && key.length <= 64 && val.length <= 2048) {
        cookies[key] = decodeURIComponent(val);
      }
    }
  }
  return cookies;
}

function sanitizeCleanText(value, maxLen) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) {
    return null;
  }
  if (trimmed.includes('<') || trimmed.includes('>') || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function validatePatientInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid request payload' };
  }

  const fullName = sanitizeCleanText(body.fullName, 80);
  if (!fullName || !/^[A-Za-z][A-Za-z .'()-]{1,79}$/.test(fullName)) {
    return { error: 'Full name must contain 2-80 safe alphabetic characters' };
  }

  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    return { error: 'Age must be an integer between 0 and 120' };
  }

  if (!ALLOWED_GENDERS.has(body.gender)) {
    return { error: 'Invalid gender selection' };
  }

  if (!ALLOWED_BLOOD_GROUPS.has(body.bloodGroup)) {
    return { error: 'Invalid blood group selection' };
  }

  if (!ALLOWED_DEPARTMENTS.has(body.department)) {
    return { error: 'Invalid department selection' };
  }

  const maskedContact = sanitizeCleanText(body.maskedContact, 24);
  if (!maskedContact || !/^[X0-9+()-]{6,24}$/.test(maskedContact)) {
    return { error: 'Masked synthetic contact must be 6-24 safe phone mask characters' };
  }

  const summaryNote = sanitizeCleanText(body.summaryNote || 'Routine synthetic outpatient visit', 200);
  if (!summaryNote) {
    return { error: 'Summary note contains invalid characters or exceeds 200 chars' };
  }

  return {
    value: {
      fullName,
      age,
      gender: body.gender,
      bloodGroup: body.bloodGroup,
      department: body.department,
      maskedContact,
      summaryNote,
    },
  };
}

function validateAppointmentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Invalid appointment payload' };
  }

  const patientId = sanitizeCleanText(body.patientId, 16);
  if (!patientId || !/^SC-\d{4,6}$/.test(patientId)) {
    return { error: 'patientId must match format SC-1001' };
  }

  const clinician = sanitizeCleanText(body.clinician, 80);
  if (!clinician || !/^[A-Za-z][A-Za-z .'-]{2,79}$/.test(clinician)) {
    return { error: 'Clinician name must be 3-80 safe characters' };
  }

  if (!ALLOWED_DEPARTMENTS.has(body.department)) {
    return { error: 'Invalid department selection' };
  }

  const scheduledDate = sanitizeCleanText(body.scheduledDate, 20);
  if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledDate)) {
    return { error: 'scheduledDate must use YYYY-MM-DDTHH:MM format' };
  }

  const reason = sanitizeCleanText(body.reason, 160);
  if (!reason) {
    return { error: 'Reason must be 1-160 safe characters without HTML tags' };
  }

  return {
    value: {
      patientId,
      clinician,
      department: body.department,
      scheduledDate,
      reason,
    },
  };
}

module.exports = {
  ALLOWED_APPT_STATUSES,
  hashSecretValue,
  verifySecretValue,
  signAuthToken,
  verifyAuthToken,
  parseCookies,
  sanitizeCleanText,
  validatePatientInput,
  validateAppointmentInput,
};
