const { createApp } = require('./app');

const { app, config } = createApp();

const server = app.listen(config.port, '0.0.0.0', () => {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'server_started',
      service: config.appName,
      port: config.port,
      nodeEnv: config.nodeEnv,
    })}\n`
  );
});

function shutdown(signal) {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'server_shutting_down',
      signal,
    })}\n`
  );
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

