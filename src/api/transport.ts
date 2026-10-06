import type {
  ClientConnection,
  CommandResult,
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
  isFrontendOnlyOrigin,
  normalizeDiscoveredProjects,
  waitForTauri,
} from './projects';

const CONNECTION_KEY = 'weline.connection';

export function loadConnection(): ClientConnection {
  const mobilePlatform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const fallback: ClientConnection = {
    // Mobile sandboxes cannot host PHP/WLS, so packaged mobile apps start as
    // remote clients while desktop Tauri builds manage the local framework.
    mode: isTauri() && !mobilePlatform ? 'local' : 'remote',
    agentUrl: window.location.origin.startsWith('http') ? window.location.origin : DEFAULT_LOCAL_AGENT_URL,
    token: '',
    setupComplete: false,
  };
  try {
    const saved = localStorage.getItem(CONNECTION_KEY);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveConnection(connection: ClientConnection): void {
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(connection));
}

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export class AgentTransport {
  constructor(private readonly connection: ClientConnection) {}

  async config(): Promise<PublicConfig> {
    if (await this.preferTauri()) return this.invoke('get_public_config');
    return this.request('/api/v1/config');
  }

  async saveConfig(config: PublicConfig): Promise<PublicConfig> {
    if (await this.preferTauri()) return this.invoke('save_public_config', { config });
    return this.request('/api/v1/config', { method: 'PUT', body: JSON.stringify(config) });
  }

  async snapshot(): Promise<DashboardSnapshot> {
    if (await this.preferTauri()) return this.invoke('get_snapshot');
    return this.request('/api/v1/snapshot');
  }

  async control(action: string, instance?: string): Promise<CommandResult> {
    const request = { action, instance: instance || null };
    if (await this.preferTauri()) return this.invoke('control_wls', { request });
    return this.request('/api/v1/wls/control', { method: 'POST', body: JSON.stringify(request) });
  }

  async command(command: string): Promise<CommandResult> {
    if (await this.preferTauri()) return this.invoke('run_framework_command', { command });
    return this.request('/api/v1/console', { method: 'POST', body: JSON.stringify({ command }) });
  }

  async update(): Promise<UpdateInfo> {
    if (await this.preferTauri()) return this.invoke('check_for_update');
    return this.request('/api/v1/update');
  }

  async scanProjects(): Promise<DiscoveredProject[]> {
    if (this.connection.mode === 'local') {
      await waitForTauri();
      if (isTauri()) {
        return normalizeDiscoveredProjects(await this.invoke('scan_local_projects'));
      }
      // Browser 本机与桌面同一条 API：先打当前页同源（Vite 开发中间件或 agent 托管 UI），
      // 失败再回退本机 agent，避免再把 SPA HTML 当成项目列表。
      return this.scanLocalOverHttp();
    }
    return normalizeDiscoveredProjects(await this.request('/api/v1/projects/scan'));
  }

  private async scanLocalOverHttp(): Promise<DiscoveredProject[]> {
    const pageOrigin = window.location.origin.replace(/\/$/, '');
    const configured = (this.connection.agentUrl || '').replace(/\/$/, '');
    const bases = [pageOrigin];
    if (configured && configured !== pageOrigin) bases.push(configured);
    if (!bases.includes(DEFAULT_LOCAL_AGENT_URL)) bases.push(DEFAULT_LOCAL_AGENT_URL);

    let lastError: unknown;
    for (const base of bases) {
      try {
        return normalizeDiscoveredProjects(await this.requestFrom(base, '/api/v1/projects/scan'));
      } catch (reason) {
        lastError = reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        if (message === 'LOCAL_SCAN_SPA_FALLBACK' || message === 'LOCAL_SCAN_INVALID_PAYLOAD') {
          continue;
        }
        if (/Failed to fetch|NetworkError|Load failed|ECONNREFUSED/i.test(message)) {
          continue;
        }
        // Auth / agent business errors: try next base only when this base was SPA-like.
        if (base === pageOrigin && isFrontendOnlyOrigin(base)) continue;
        throw reason;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'LOCAL_SCAN_INVALID_PAYLOAD'));
  }

  async websites(): Promise<WebsiteRecord[]> {
    if (await this.preferTauri()) return this.invoke('list_websites');
    return this.request('/api/v1/websites');
  }

  async domainPool(): Promise<DomainPoolRecord[]> {
    if (await this.preferTauri()) return this.invoke('list_domain_pool');
    return this.request('/api/v1/websites/domain-pool');
  }

  async createWebsite(request: CreateWebsiteRequest): Promise<WebsiteRecord> {
    if (await this.preferTauri()) return this.invoke('create_website', { request });
    return this.request('/api/v1/websites', { method: 'POST', body: JSON.stringify(request) });
  }

  async deleteCertificate(request: DeleteCertificateRequest): Promise<DeleteCertificateResult> {
    if (await this.preferTauri()) return this.invoke('delete_certificate', { request });
    return this.request('/api/v1/certificates/delete', { method: 'POST', body: JSON.stringify(request) });
  }

  async openExternal(url: string): Promise<void> {
    if (await this.preferTauri()) {
      await this.invoke('open_external_url', { url });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private async preferTauri(): Promise<boolean> {
    if (this.connection.mode !== 'local') return false;
    await waitForTauri(400);
    return isTauri();
  }

  private resolveRequestBase(): string {
    const configured = (this.connection.agentUrl || '').replace(/\/$/, '');
    return configured || window.location.origin || DEFAULT_LOCAL_AGENT_URL;
  }

  private async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    return this.requestFrom(this.resolveRequestBase(), path, init);
  }

  private async requestFrom<T>(base: string, path: string, init: RequestInit = {}): Promise<T> {
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
