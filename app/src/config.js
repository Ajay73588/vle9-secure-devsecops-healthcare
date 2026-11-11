const crypto = require('node:crypto');

function requireSecret(envMap, key, allowEphemeralTest) {
  const val = envMap[key];
  if (typeof val === 'string' && val.trim().length >= 12) {
    return val.trim();
  }
  if (allowEphemeralTest) {
    return crypto.randomBytes(24).toString('hex');
  }
  throw new Error(`Missing or weak required runtime secret environment variable: ${key}`);
}

function loadConfig(envMap = process.env) {
  const nodeEnv = (envMap.NODE_ENV || 'development').trim();
  const isTest = nodeEnv === 'test';
  const port = Number.parseInt(envMap.PORT || '3000', 10);

  if (Number.isNaN(port) || port < (isTest ? 0 : 1) || port > 65535) {
    throw new Error('Invalid PORT configuration');
  }

  return {
    appName: (envMap.APP_NAME || 'SecureCare').trim(),
    nodeEnv,
    port,
    logLevel: (envMap.LOG_LEVEL || 'info').trim(),
    cookieSecure: String(envMap.COOKIE_SECURE || 'false').toLowerCase() === 'true',
    jwtSecret: requireSecret(envMap, 'JWT_SECRET', isTest),
    tokenTtlSeconds: Number.parseInt(envMap.TOKEN_TTL_SECONDS || '3600', 10),
    users: [
      {
        username: (envMap.ADMIN_USERNAME || 'admin.securecare').trim(),
        password: requireSecret(envMap, 'ADMIN_PASS_ENV', isTest),
        role: 'admin',
        displayName: 'Chief Compliance Admin',
      },
      {
        username: (envMap.DOCTOR_USERNAME || 'dr.sharma').trim(),
        password: requireSecret(envMap, 'DOCTOR_PASS_ENV', isTest),
        role: 'doctor',
        displayName: 'Dr. Kavita Sharma',
      },
      {
        username: (envMap.NURSE_USERNAME || 'nurse.patel').trim(),
        password: requireSecret(envMap, 'NURSE_PASS_ENV', isTest),
        role: 'nurse',
        displayName: 'Nurse Rohan Patel',
      },
    ],
  };
}

module.exports = { loadConfig };
