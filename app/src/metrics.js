const client = require('prom-client');

function createMetricsRegistry() {
  const register = new client.Registry();
  register.setDefaultLabels({ app: 'securecare' });
  client.collectDefaultMetrics({ register });

  const httpRequestsTotal = new client.Counter({
    name: 'securecare_http_requests_total',
    help: 'Total HTTP requests processed by SecureCare',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });

  const httpRequestDurationSeconds = new client.Histogram({
    name: 'securecare_http_request_duration_seconds',
    help: 'HTTP request latency distribution in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [register],
  });

  const authLoginAttemptsTotal = new client.Counter({
    name: 'securecare_auth_login_attempts_total',
    help: 'Authentication login attempts partitioned by outcome',
    labelNames: ['outcome'],
    registers: [register],
  });

  const unauthorizedAccessTotal = new client.Counter({
    name: 'securecare_unauthorized_access_total',
    help: 'Total 401/403 unauthorized or forbidden access attempts',
    labelNames: ['route', 'status_code'],
    registers: [register],
  });

  const patientsTotal = new client.Gauge({
    name: 'securecare_patients_total',
    help: 'Current number of synthetic patient records',
    registers: [register],
  });

  const appointmentsTotal = new client.Gauge({
    name: 'securecare_appointments_total',
    help: 'Current number of synthetic appointment records',
    registers: [register],
  });

  return {
    register,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    authLoginAttemptsTotal,
    unauthorizedAccessTotal,
    patientsTotal,
    appointmentsTotal,
  };
}

module.exports = { createMetricsRegistry };

