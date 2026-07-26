import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Make the global `fetch` honor HTTP_PROXY / HTTPS_PROXY / NO_PROXY.
 *
 * Node's built-in fetch (undici) ignores proxy env vars by default, which
 * breaks outbound source-adapter calls (archive.org, bilibili) on machines
 * that reach the internet through a local proxy. `EnvHttpProxyAgent` reads
 * the standard env vars itself, including NO_PROXY exclusions (localhost
 * keeps working for integration scripts).
 *
 * Call once at process startup (server.ts). Kept out of the adapters so
 * unit tests with injected `fetchFn` are unaffected.
 */
export function installProxySupport(): void {
  if (!process.env['HTTP_PROXY'] && !process.env['HTTPS_PROXY'] && !process.env['ALL_PROXY']) {
    return;
  }
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
