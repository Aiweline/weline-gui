import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isLoopbackHost,
  resolveLocalBootstrap,
  type LocalBootstrapResult,
} from './transport';
import type { ClientConnection } from '../types';

const seedLocal: ClientConnection = {
  mode: 'local',
  agentUrl: 'http://127.0.0.1:17640',
  token: '',
  setupComplete: false,
};

describe('isLoopbackHost', () => {
  it('accepts loopback hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
  });

  it('rejects non-loopback hosts', () => {
    expect(isLoopbackHost('example.com')).toBe(false);
    expect(isLoopbackHost('192.168.1.1')).toBe(false);
  });
});

describe('resolveLocalBootstrap', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    vi.stubGlobal('window', {
      location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:17640' },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    if (originalLocalStorage) {
      vi.stubGlobal('localStorage', originalLocalStorage);
    }
  });

  it('returns offline when local-session cannot be reached', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('Failed to fetch');
    }) as typeof fetch;
    const result = await resolveLocalBootstrap(seedLocal);
    expect(result.status).toBe('offline');
  });

  it('returns needs_setup when agent is reachable but not configured', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/local-session')) {
        return new Response(JSON.stringify({
          agentUrl: 'http://127.0.0.1:17640',
          token: 'test-token',
          listen: '127.0.0.1:17640',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/config')) {
        return new Response(JSON.stringify({
          frameworkRoot: '',
          phpBinary: 'php',
          listen: '127.0.0.1:17640',
          siteUrls: [],
          language: 'zh-CN',
          refreshSeconds: 3,
          configured: false,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const result: LocalBootstrapResult = await resolveLocalBootstrap(seedLocal);
    expect(result.status).toBe('needs_setup');
  });

  it('returns resumed when agent config is already complete', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/local-session')) {
        return new Response(JSON.stringify({
          agentUrl: 'http://127.0.0.1:17640',
          token: 'test-token',
          listen: '127.0.0.1:17640',
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.includes('/config')) {
        return new Response(JSON.stringify({
          frameworkRoot: '/Users/weline/Project/Official/框架',
          phpBinary: 'php',
          listen: '127.0.0.1:17640',
          siteUrls: ['https://example.test'],
          language: 'zh-CN',
          refreshSeconds: 3,
          configured: true,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const result = await resolveLocalBootstrap(seedLocal);
    expect(result.status).toBe('resumed');
    if (result.status === 'resumed') {
      expect(result.connection.setupComplete).toBe(true);
      expect(result.connection.token).toBe('test-token');
      expect(result.config.frameworkRoot).toContain('框架');
    }
  });

  it('returns needs_setup for remote non-loopback clients', async () => {
    vi.stubGlobal('window', {
      location: { hostname: 'example.com', origin: 'https://example.com' },
    });
    const result = await resolveLocalBootstrap({
      mode: 'remote',
      agentUrl: 'https://example.com:17640',
      token: '',
      setupComplete: false,
    });
    expect(result.status).toBe('needs_setup');
  });
});
