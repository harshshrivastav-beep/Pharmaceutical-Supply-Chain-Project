import { app } from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`Backend listening at http://127.0.0.1:${env.port}`);
});

server.on('error', (error) => {
  console.error(`Backend could not start: ${error.message}`);
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
