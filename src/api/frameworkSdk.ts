import type { FrameworkAuthTokens } from '../types';

const TOKEN_PREFIX = 'weline.framework.tokens.';

export interface FrameworkLoginRequest {
  baseUrl: string;
  username: string;
  password: string;
  /** Default: /api/api/rest/v1/auth/login */
  loginPath?: string;
}

export interface FrameworkSdkOptions {
  profileId: string;
  baseUrl: string;
  loginPath?: string;
  refreshPath?: string;
}

function normalizeBase(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  const base = normalizeBase(baseUrl);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function loadFrameworkTokens(profileId: string): FrameworkAuthTokens | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_PREFIX + profileId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FrameworkAuthTokens;
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveFrameworkTokens(profileId: string, tokens: FrameworkAuthTokens): void {
  sessionStorage.setItem(TOKEN_PREFIX + profileId, JSON.stringify(tokens));
}

export function clearFrameworkTokens(profileId: string): void {
  sessionStorage.removeItem(TOKEN_PREFIX + profileId);
}

function unwrapApiPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  if (root.data && typeof root.data === 'object') {
    return root.data as Record<string, unknown>;
  }
  return root;
}

export class FrameworkApiSdk {
  constructor(private options: FrameworkSdkOptions) {}

  get profileId(): string {
    return this.options.profileId;
  }

  get tokens(): FrameworkAuthTokens | null {
    return loadFrameworkTokens(this.options.profileId);
  }

  async login(username: string, password: string): Promise<FrameworkAuthTokens> {
    const loginPath = this.options.loginPath || '/api/api/rest/v1/auth/login';
    const response = await fetch(joinUrl(this.options.baseUrl, loginPath), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : response.statusText;
      throw new Error(message || 'Framework API login failed');
    }
    const data = unwrapApiPayload(payload);
    const accessToken = String(data.access_token || '');
    const refreshToken = String(data.refresh_token || '');
    if (!accessToken) {
      throw new Error('Framework API login response missing access_token');
    }
    const user = data.user && typeof data.user === 'object'
      ? (data.user as { username?: string })
      : undefined;
    const tokens: FrameworkAuthTokens = {
      accessToken,
      refreshToken,
      expireTime: typeof data.expire_time === 'number' ? data.expire_time : undefined,
      username: user?.username || username,
    };
    saveFrameworkTokens(this.options.profileId, tokens);
    return tokens;
  }

  async refresh(): Promise<FrameworkAuthTokens> {
    const current = this.tokens;
    if (!current?.refreshToken) {
      throw new Error('No refresh token');
    }
    const refreshPath = this.options.refreshPath || '/api/api/rest/v1/auth/refresh';
    const response = await fetch(joinUrl(this.options.baseUrl, refreshPath), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: current.refreshToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      clearFrameworkTokens(this.options.profileId);
      throw new Error('Framework API refresh failed');
    }
    const data = unwrapApiPayload(payload);
    const tokens: FrameworkAuthTokens = {
      accessToken: String(data.access_token || ''),
      refreshToken: String(data.refresh_token || current.refreshToken),
      expireTime: typeof data.expire_time === 'number' ? data.expire_time : current.expireTime,
      username: current.username,
    };
    if (!tokens.accessToken) {
      clearFrameworkTokens(this.options.profileId);
      throw new Error('Framework API refresh missing access_token');
    }
    saveFrameworkTokens(this.options.profileId, tokens);
    return tokens;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let tokens = this.tokens;
    if (!tokens?.accessToken) {
      throw new Error('Framework API not logged in');
    }
    const run = async (accessToken: string) => {
      const response = await fetch(joinUrl(this.options.baseUrl, path), {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...init.headers,
        },
      });
      const contentType = response.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();
      return { response, payload };
    };

    let { response, payload } = await run(tokens.accessToken);
    if (response.status === 401 && tokens.refreshToken) {
      tokens = await this.refresh();
      ({ response, payload } = await run(tokens.accessToken));
    }
    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : String(payload || response.statusText);
      throw new Error(message);
    }
    return payload as T;
  }
}

export async function loginFrameworkApi(request: FrameworkLoginRequest): Promise<FrameworkAuthTokens> {
  const sdk = new FrameworkApiSdk({
    profileId: '_adhoc',
    baseUrl: request.baseUrl,
    loginPath: request.loginPath,
  });
  return sdk.login(request.username, request.password);
}
