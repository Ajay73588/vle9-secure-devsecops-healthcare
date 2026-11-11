const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { loadConfig } = require('./config');
const { createMetricsRegistry } = require('./metrics');
const { HealthcareStore } = require('./store');
const {
  ALLOWED_APPT_STATUSES,
  hashSecretValue,
  verifySecretValue,
  signAuthToken,
  verifyAuthToken,
  parseCookies,
  sanitizeCleanText,
  validatePatientInput,
  validateAppointmentInput,
} = require('./security');

const AUTH_COOKIE_NAME = 'securecare_session';

function safeLog(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function createApp(overrideConfig = null) {
  const config = overrideConfig || loadConfig();
  const metrics = createMetricsRegistry();
  const store = new HealthcareStore();

  // Hash configured user credentials at startup; never store plaintext passwords in memory
  const userDirectory = new Map();
  for (const user of config.users) {
    userDirectory.set(user.username, {
      username: user.username,
      passwordHash: hashSecretValue(user.password),
      role: user.role,
      displayName: user.displayName,
    });
  }

  // Simple sliding-window login attempt limiter per IP
  const loginAttemptsByIp = new Map();
  const LOGIN_WINDOW_MS = 60_000;
  const LOGIN_MAX_ATTEMPTS = 30;

  function syncInventoryMetrics() {
    metrics.patientsTotal.set(store.patients.length);
    metrics.appointmentsTotal.set(store.appointments.length);
  }
  syncInventoryMetrics();

  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      strictTransportSecurity: config.cookieSecure
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    })
  );

  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    next();
  });

  app.use(express.json({ limit: '16kb', strict: true }));

  // Prometheus HTTP instrumentation
  app.use((req, res, next) => {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/metrics') {
        return;
      }
      const routeLabel = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
      const statusStr = String(res.statusCode);
      const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;
      metrics.httpRequestsTotal.inc({
        method: req.method,
        route: routeLabel,
        status_code: statusStr,
      });
      metrics.httpRequestDurationSeconds.observe(
        {
          method: req.method,
          route: routeLabel,
          status_code: statusStr,
        },
        durationSec
      );
    });
    next();
  });

  function extractToken(req) {
    const authHeader = req.get('authorization');
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const cookies = parseCookies(req.get('cookie'));
    return cookies[AUTH_COOKIE_NAME] || null;
  }

  function requireAuth(req, res, next) {
    const token = extractToken(req);
    const claims = token ? verifyAuthToken(token, config.jwtSecret) : null;
    if (!claims) {
      metrics.unauthorizedAccessTotal.inc({ route: req.path, status_code: '401' });
      safeLog('warn', 'unauthorized_access_attempt', {
        method: req.method,
        path: req.path,
        statusCode: 401,
      });
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = {
      username: claims.sub,
      role: claims.role,
      displayName: claims.displayName,
    };
    return next();
  }

  function requireRoles(allowedRoles) {
    return (req, res, next) => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        metrics.unauthorizedAccessTotal.inc({ route: req.path, status_code: '403' });
        safeLog('warn', 'forbidden_access_attempt', {
          method: req.method,
          path: req.path,
          role: req.user?.role || 'anonymous',
          statusCode: 403,
        });
        return res.status(403).json({ error: 'Insufficient role permissions for this operation' });
      }
      return next();
    };
  }

  function checkLoginRateLimit(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const history = (loginAttemptsByIp.get(ip) || []).filter((ts) => now - ts < LOGIN_WINDOW_MS);
    if (history.length >= LOGIN_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many login attempts; please wait 60 seconds' });
    }
    history.push(now);
    loginAttemptsByIp.set(ip, history);
    return next();
  }

  // Health & Monitoring Endpoints
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: config.appName,
      environment: config.nodeEnv,
      syntheticDataOnly: true,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get('/ready', (_req, res) => {
    res.status(200).json({
      status: 'ready',
      patientsLoaded: store.patients.length,
      appointmentsLoaded: store.appointments.length,
    });
  });

  app.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.status(200).send(await metrics.register.metrics());
  });

  // Authentication Endpoints
  app.post('/api/auth/login', checkLoginRateLimit, (req, res) => {
    const username = sanitizeCleanText(req.body?.username, 64);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password || password.length > 128) {
      metrics.authLoginAttemptsTotal.inc({ outcome: 'failure' });
      return res.status(400).json({ error: 'Valid username and password are required' });
    }

    const user = userDirectory.get(username);
    if (!user || !verifySecretValue(password, user.passwordHash)) {
      metrics.authLoginAttemptsTotal.inc({ outcome: 'failure' });
      metrics.unauthorizedAccessTotal.inc({ route: '/api/auth/login', status_code: '401' });
      safeLog('warn', 'login_failed', { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    metrics.authLoginAttemptsTotal.inc({ outcome: 'success' });
    const token = signAuthToken(
      {
        sub: user.username,
        role: user.role,
        displayName: user.displayName,
      },
      config.jwtSecret,
      config.tokenTtlSeconds
    );

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      maxAge: config.tokenTtlSeconds * 1000,
      path: '/',
    });

    safeLog('info', 'login_succeeded', { username: user.username, role: user.role });

    return res.status(200).json({
      user: {
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
      token,
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      path: '/',
    });
    res.status(200).json({ status: 'signed_out' });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.status(200).json({ user: req.user });
  });

  // Healthcare Dashboard & Synthetic Records APIs
  app.get('/api/dashboard/summary', requireAuth, (_req, res) => {
    res.status(200).json(store.getSummary());
  });

  app.get('/api/patients', requireAuth, (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 64) : '';
    res.status(200).json({
      patients: store.listPatients(q),
      syntheticDataOnly: true,
    });
  });

  app.get('/api/patients/:id', requireAuth, (req, res) => {
    const id = sanitizeCleanText(req.params.id, 16);
    if (!id || !/^SC-\d{4,6}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }
    const patient = store.getPatientById(id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient record not found' });
    }
    return res.status(200).json({ patient });
  });

  app.post('/api/patients', requireAuth, requireRoles(['admin', 'doctor']), (req, res) => {
    const validated = validatePatientInput(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    const created = store.createPatient(validated.value);
    syncInventoryMetrics();
    safeLog('info', 'patient_created', {
      patientId: created.id,
      actor: req.user.username,
      role: req.user.role,
    });
    return res.status(201).json({ patient: created });
  });

  app.patch('/api/patients/:id', requireAuth, requireRoles(['admin', 'doctor']), (req, res) => {
    const id = sanitizeCleanText(req.params.id, 16);
    if (!id || !/^SC-\d{4,6}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }
    const existing = store.getPatientById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Patient record not found' });
    }
    const merged = {
      fullName: req.body?.fullName ?? existing.fullName,
      age: req.body?.age ?? existing.age,
      gender: req.body?.gender ?? existing.gender,
      bloodGroup: req.body?.bloodGroup ?? existing.bloodGroup,
      department: req.body?.department ?? existing.department,
      maskedContact: req.body?.maskedContact ?? existing.maskedContact,
      summaryNote: req.body?.summaryNote ?? existing.summaryNote,
    };
    const validated = validatePatientInput(merged);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    const updated = store.updatePatient(id, validated.value);
    safeLog('info', 'patient_updated', { patientId: id, actor: req.user.username });
    return res.status(200).json({ patient: updated });
  });

  app.delete('/api/patients/:id', requireAuth, requireRoles(['admin']), (req, res) => {
    const id = sanitizeCleanText(req.params.id, 16);
    if (!id || !/^SC-\d{4,6}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid patient ID format' });
    }
    const removed = store.deletePatient(id);
    if (!removed) {
      return res.status(404).json({ error: 'Patient record not found' });
    }
    syncInventoryMetrics();
    safeLog('info', 'patient_deleted', { patientId: id, actor: req.user.username });
    return res.status(200).json({ deleted: id });
  });

  app.get('/api/appointments', requireAuth, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    if (status && !ALLOWED_APPT_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid appointment status filter' });
    }
    return res.status(200).json({ appointments: store.listAppointments(status) });
  });

  app.post('/api/appointments', requireAuth, requireRoles(['admin', 'doctor', 'nurse']), (req, res) => {
    const validated = validateAppointmentInput(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    const created = store.createAppointment(validated.value);
    if (!created) {
      return res.status(404).json({ error: 'Referenced patient ID does not exist' });
    }
    syncInventoryMetrics();
    safeLog('info', 'appointment_created', {
      appointmentId: created.id,
      patientId: created.patientId,
      actor: req.user.username,
    });
    return res.status(201).json({ appointment: created });
  });

  app.patch(
    '/api/appointments/:id/status',
    requireAuth,
    requireRoles(['admin', 'doctor', 'nurse']),
    (req, res) => {
      const id = sanitizeCleanText(req.params.id, 16);
      if (!id || !/^APT-\d{4,6}$/.test(id)) {
        return res.status(400).json({ error: 'Invalid appointment ID format' });
      }
      const nextStatus = req.body?.status;
      if (!ALLOWED_APPT_STATUSES.has(nextStatus)) {
        return res.status(400).json({ error: 'Invalid appointment status value' });
      }
      const updated = store.updateAppointmentStatus(id, nextStatus);
      if (!updated) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      safeLog('info', 'appointment_status_updated', {
        appointmentId: id,
        status: nextStatus,
        actor: req.user.username,
      });
      return res.status(200).json({ appointment: updated });
    }
  );

  // Serve hardened static frontend
  app.use(express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'deny' }));

  // Malformed JSON / Payload error handler
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON request payload' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request payload exceeds 16KB limit' });
    }
    safeLog('error', 'unhandled_server_error', {
      method: req.method,
      path: req.path,
      message: err?.message || 'Internal error',
    });
    return res.status(500).json({ error: 'Internal server error' });
  });

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    return res.status(404).type('text/plain').send('Not Found');
  });

  return { app, config, store, metrics };
}

module.exports = { createApp };

