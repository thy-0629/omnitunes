import { buildServer } from './app.js';
import { config } from './config/env.js';
import { installProxySupport } from './utils/proxy.js';

async function main(): Promise<void> {
  // Honor HTTP(S)_PROXY for outbound source-adapter calls (undici fetch
  // ignores those env vars by default). No-op when no proxy is set.
  installProxySupport();

  const app = await buildServer();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
