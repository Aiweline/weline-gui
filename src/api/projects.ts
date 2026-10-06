import type { DiscoveredProject } from '../types';

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item).trim()).filter(Boolean);
}

function asProject(value: unknown): DiscoveredProject | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const frameworkRoot = asString(row.frameworkRoot ?? row.framework_root).trim();
  if (!frameworkRoot) return null;
  const name = asString(row.name).trim() || frameworkRoot.split(/[\\/]/).filter(Boolean).at(-1) || 'Weline';
  return {
    name,
    frameworkRoot,
    phpBinary: asString(row.phpBinary ?? row.php_binary, 'php') || 'php',
    githubRepository: asString(row.githubRepository ?? row.github_repository) || null,
    adminUrl: asString(row.adminUrl ?? row.admin_url) || null,
    siteUrls: asStringList(row.siteUrls ?? row.site_urls),
    running: Boolean(row.running),
    source: asString(row.source, 'nearby') || 'nearby',
  };
}

/**
 * Agent / Tauri must return a JSON array of projects. Vite and other SPA hosts
 * may answer /api/* with HTML; never treat that as a project list.
 */
export function normalizeDiscoveredProjects(payload: unknown): DiscoveredProject[] {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
      throw new Error('LOCAL_SCAN_SPA_FALLBACK');
    }
    try {
      return normalizeDiscoveredProjects(JSON.parse(trimmed));
    } catch {
      throw new Error('LOCAL_SCAN_INVALID_PAYLOAD');
    }
  }

  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { projects?: unknown }).projects)
      ? (payload as { projects: unknown[] }).projects
      : null;

  if (!rows) {
    throw new Error('LOCAL_SCAN_INVALID_PAYLOAD');
  }

  return rows.map(asProject).filter((project): project is DiscoveredProject => Boolean(project));
}

export function isFrontendOnlyOrigin(candidate: string, pageOrigin = typeof window !== 'undefined' ? window.location.origin : ''): boolean {
  if (!candidate || !pageOrigin) return false;
  try {
    return new URL(candidate).origin === new URL(pageOrigin).origin;
  } catch {
    return false;
  }
}

export const DEFAULT_LOCAL_AGENT_URL = 'http://127.0.0.1:17640';

export async function waitForTauri(timeoutMs = 1500): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if ('__TAURI_INTERNALS__' in window) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    if ('__TAURI_INTERNALS__' in window) return true;
  }
  return '__TAURI_INTERNALS__' in window;
}
