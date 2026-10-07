import type {
  ClientConnection,
  CommandResult,
  ConsoleCommandCatalog,
  CreateWebsiteRequest,
  DashboardSnapshot,
  DeleteCertificateRequest,
  DeleteCertificateResult,
  DiscoveredProject,
  DomainPoolRecord,
  PublicConfig,
  UpdateInfo,
  WebsiteRecord,
} from '../types';
import {
  DEFAULT_LOCAL_AGENT_URL,
  normalizeDiscoveredProjects,
  waitForTauri,
} from './projects';

const CONNECTION_KEY = 'weline.connection';

export interface LocalAgentEndpoint {
  agentUrl: string;
  token: string;
  listen: string;
}

export function isLoopbackHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

export function loadConnection(): ClientConnection {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mobilePlatform = /Android|iPhone|iPad|iPod/i.test(userAgent);
  // Loopback browser (agent-served dist / Vite) uses the same local Agent HTTP as desktop.
  // Only non-loopback browsers default to remote (need explicit URL + token).
  const preferLocal = (isTauri() && !mobilePlatform) || (!mobilePlatform && isLoopbackHost());
  const fallback: ClientConnection = {
    mode: preferLocal ? 'local' : 'remote',
    agentUrl: DEFAULT_LOCAL_AGENT_URL,
    token: '',
    setupComplete: false,
  };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const saved = localStorage.getItem(CONNECTION_KEY);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

export type LocalBootstrapStatus = 'resumed' | 'needs_setup' | 'offline';

export type LocalBootstrapResult =
  | { status: 'resumed'; connection: ClientConnection; config: PublicConfig }
  | { status: 'needs_setup' }
  | { status: 'offline'; reason?: string };

/**
 * Loopback authority is agent `config.configured` + frameworkRoot.
 * localStorage.setupComplete is only a cache after a successful resume.
 * Distinguishes offline (agent unreachable) from needs_setup (reachable but not configured).
 */
export async function resolveLocalBootstrap(
  seed: ClientConnection = loadConnection(),
): Promise<LocalBootstrapResult> {
  // Caller (App) skips bootstrap when setupComplete is already true.
  if (seed.mode === 'remote' && !isLoopbackHost()) {
    return { status: 'needs_setup' };
  }
  let endpoint: LocalAgentEndpoint;
  try {
    endpoint = await resolveLocalAgentEndpoint(seed.agentUrl || DEFAULT_LOCAL_AGENT_URL);
  } catch (reason) {
    return { status: 'offline', reason: reason instanceof Error ? reason.message : String(reason || '') };
  }
  try {
    const connection: ClientConnection = {
      ...seed,
      mode: 'local',
      agentUrl: endpoint.agentUrl,
      token: endpoint.token,
      setupComplete: false,
    };
    const transport = new AgentTransport(connection);
    const config = await transport.config();
    if (!config.configured || !String(config.frameworkRoot || '').trim()) {
      return { status: 'needs_setup' };
    }
    const finalized: ClientConnection = { ...connection, setupComplete: true };
    saveConnection(finalized);
    return { status: 'resumed', connection: finalized, config };
  } catch (reason) {
    return { status: 'offline', reason: reason instanceof Error ? reason.message : String(reason || '') };
  }
}

/** @deprecated Use resolveLocalBootstrap; kept for transitional imports. */
export async function tryResumeConfiguredLocalSession(
  seed: ClientConnection = loadConnection(),
): Promise<{ connection: ClientConnection; config: PublicConfig } | null> {
  const result = await resolveLocalBootstrap(seed);
  if (result.status !== 'resumed') return null;
  return { connection: result.connection, config: result.config };
}

export function saveConnection(connection: ClientConnection): void {
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Resolve loopback Agent HTTP endpoint + bearer token.
 * Desktop: Tauri inject via get_local_agent_endpoint (server already embedded).
 * Browser: GET /api/v1/local-session on the agent (Vite proxies /api in dev).
 */
export async function resolveLocalAgentEndpoint(
  preferredBase = DEFAULT_LOCAL_AGENT_URL,
): Promise<LocalAgentEndpoint> {
  await waitForTauri(800);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<LocalAgentEndpoint>('get_local_agent_endpoint');
  }

  const bases = [preferredBase.replace(/\/$/, '')];
  const pageOrigin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
  if (pageOrigin && !bases.includes(pageOrigin)) {
    bases.unshift(pageOrigin);
  }

  let lastError: unknown;
  for (const base of bases) {
    try {
      const response = await fetch(`${base}/api/v1/local-session`, {
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : response.statusText,
        );
      }
      const endpoint = payload as LocalAgentEndpoint;
      if (!endpoint?.token) {
        throw new Error('LOCAL_SESSION_INVALID');
      }
      // When Vite proxies /api, keep page origin so all calls stay same-origin.
      // Otherwise use the agent-advertised loopback URL.
      return {
        agentUrl: base === pageOrigin ? pageOrigin : (endpoint.agentUrl || base),
        token: endpoint.token,
        listen: endpoint.listen || '',
      };
    } catch (reason) {
      lastError = reason;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Unable to resolve local agent session');
}

export class AgentTransport {
  private sessionReady: Promise<void> | null = null;

  constructor(private connection: ClientConnection) {}

  /** Ensure local mode has agentUrl + token before any /api/v1 call. */
  async ensureSession(): Promise<ClientConnection> {
    if (this.connection.mode !== 'local') {
      return this.connection;
    }
    if (this.connection.token && this.connection.agentUrl) {
      return this.connection;
    }
    if (!this.sessionReady) {
      this.sessionReady = (async () => {
        const endpoint = await resolveLocalAgentEndpoint(
          this.connection.agentUrl || DEFAULT_LOCAL_AGENT_URL,
        );
        this.connection = {
          ...this.connection,
          mode: 'local',
          agentUrl: endpoint.agentUrl,
          token: endpoint.token,
        };
        saveConnection(this.connection);
      })();
    }
    await this.sessionReady;
    return this.connection;
  }

  async config(): Promise<PublicConfig> {
    return this.request('/api/v1/config');
  }

  async saveConfig(config: PublicConfig): Promise<PublicConfig> {
    return this.request('/api/v1/config', { method: 'PUT', body: JSON.stringify(config) });
  }

  async snapshot(): Promise<DashboardSnapshot> {
    return this.request('/api/v1/snapshot');
  }

  async control(action: string, instance?: string): Promise<CommandResult> {
    return this.request('/api/v1/wls/control', {
      method: 'POST',
      body: JSON.stringify({ action, instance: instance || null }),
    });
  }

  async command(command: string): Promise<CommandResult> {
    return this.request('/api/v1/console', {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  }

  async listConsoleCommands(): Promise<ConsoleCommandCatalog> {
    return this.request('/api/v1/console/commands');
  }

  async update(): Promise<UpdateInfo> {
    return this.request('/api/v1/update');
  }

  async scanProjects(): Promise<DiscoveredProject[]> {
    return normalizeDiscoveredProjects(await this.request('/api/v1/projects/scan'));
  }

  async websites(): Promise<WebsiteRecord[]> {
    return this.request('/api/v1/websites');
  }

  async domainPool(): Promise<DomainPoolRecord[]> {
    return this.request('/api/v1/websites/domain-pool');
  }

  async createWebsite(request: CreateWebsiteRequest): Promise<WebsiteRecord> {
    return this.request('/api/v1/websites', { method: 'POST', body: JSON.stringify(request) });
  }

  async deleteCertificate(request: DeleteCertificateRequest): Promise<DeleteCertificateResult> {
    return this.request('/api/v1/certificates/delete', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async openExternal(url: string): Promise<void> {
    if (this.connection.mode === 'local') {
      await this.request('/api/v1/open-external', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private resolveRequestBase(): string {
    const configured = (this.connection.agentUrl || '').replace(/\/$/, '');
    if (this.connection.mode === 'local') {
      // Prefer configured agent; in Vite dev, same-origin /api is proxied to the agent.
      if (configured) return configured;
      if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
        return window.location.origin;
      }
      return DEFAULT_LOCAL_AGENT_URL;
    }
    return configured || (typeof window !== 'undefined' ? window.location.origin : DEFAULT_LOCAL_AGENT_URL);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (this.connection.mode === 'local') {
      await this.ensureSession();
    }
    const base = this.resolveRequestBase();
    const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.connection.token}`,
        ...init.headers,
      },
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : String(payload || response.statusText);
      throw new Error(message);
    }
    return payload as T;
  }
}
