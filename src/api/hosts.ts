import { DEFAULT_LOCAL_AGENT_URL } from './projects';
import { isLoopbackHost, loadConnection, type LocalAgentEndpoint } from './transport';
import type { ClientConnection, HostProfile, SshPrivateKeyRef } from '../types';

const HOSTS_KEY = 'weline.hosts';
const ACTIVE_HOST_KEY = 'weline.activeHostId';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `host_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function connectionFromProfile(profile: HostProfile): ClientConnection {
  return {
    mode: profile.kind === 'local' ? 'local' : 'remote',
    agentUrl: profile.agentUrl || DEFAULT_LOCAL_AGENT_URL,
    token: profile.agentToken || '',
    setupComplete: Boolean(profile.setupComplete),
  };
}

export function profileFromConnection(
  connection: ClientConnection,
  name = 'Local',
): HostProfile {
  return {
    id: newId(),
    name,
    kind: connection.mode === 'local' ? 'local' : 'remote',
    agentUrl: connection.agentUrl || DEFAULT_LOCAL_AGENT_URL,
    agentToken: connection.token || '',
    setupComplete: connection.setupComplete,
  };
}

export function loadHosts(): HostProfile[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(HOSTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HostProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeProfile);
        }
      }
    }
  } catch {
    // fall through to migrate
  }
  const seed = profileFromConnection(loadConnection(), isLoopbackHost() ? 'Local' : 'Remote');
  saveHosts([seed]);
  setActiveHostId(seed.id);
  return [seed];
}

export function normalizeFrameworkRoot(path?: string | null): string {
  return String(path || '').trim().replace(/[/\\]+$/, '').replace(/\\/g, '/');
}

function normalizeProfile(profile: HostProfile): HostProfile {
  const frameworkRoot = normalizeFrameworkRoot(profile.frameworkRoot);
  const phpBinary = String(profile.phpBinary || '').trim();
  return {
    ...profile,
    id: profile.id || newId(),
    name: String(profile.name || 'Host').trim() || 'Host',
    kind: profile.kind === 'remote' ? 'remote' : 'local',
    agentUrl: String(profile.agentUrl || DEFAULT_LOCAL_AGENT_URL),
    agentToken: String(profile.agentToken || ''),
    frameworkRoot: frameworkRoot || undefined,
    phpBinary: phpBinary || undefined,
    sshPort: profile.sshPort && profile.sshPort > 0 ? profile.sshPort : 22,
  };
}

export function saveHosts(hosts: HostProfile[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(HOSTS_KEY, JSON.stringify(hosts.map(normalizeProfile)));
}

export function getActiveHostId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ACTIVE_HOST_KEY);
}

export function setActiveHostId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVE_HOST_KEY, id);
}

export function getActiveHost(hosts: HostProfile[] = loadHosts()): HostProfile {
  const activeId = getActiveHostId();
  const found = hosts.find((host) => host.id === activeId);
  if (found) return found;
  const first = hosts[0];
  if (first) {
    setActiveHostId(first.id);
    return first;
  }
  const seed = profileFromConnection(loadConnection());
  saveHosts([seed]);
  setActiveHostId(seed.id);
  return seed;
}

export function upsertHost(profile: HostProfile, hosts: HostProfile[] = loadHosts()): HostProfile[] {
  const next = normalizeProfile(profile);
  const index = hosts.findIndex((host) => host.id === next.id);
  const updated = index >= 0
    ? hosts.map((host, i) => (i === index ? next : host))
    : [...hosts, next];
  saveHosts(updated);
  return updated;
}

export function removeHost(id: string, hosts: HostProfile[] = loadHosts()): HostProfile[] {
  const updated = hosts.filter((host) => host.id !== id);
  if (updated.length === 0) {
    const seed = profileFromConnection(loadConnection());
    saveHosts([seed]);
    setActiveHostId(seed.id);
    return [seed];
  }
  saveHosts(updated);
  if (getActiveHostId() === id) {
    setActiveHostId(updated[0].id);
  }
  return updated;
}

export function applyLocalEndpoint(profile: HostProfile, endpoint: LocalAgentEndpoint): HostProfile {
  return {
    ...profile,
    kind: 'local',
    agentUrl: endpoint.agentUrl,
    agentToken: endpoint.token,
  };
}

export function withSshKeyRef(profile: HostProfile, ref: SshPrivateKeyRef | undefined): HostProfile {
  return { ...profile, sshPrivateKeyRef: ref };
}

export function createBlankRemoteHost(name = 'Remote'): HostProfile {
  return {
    id: newId(),
    name,
    kind: 'remote',
    agentUrl: '',
    agentToken: '',
    sshPort: 22,
    setupComplete: false,
  };
}

/** Basename of framework root → project label (e.g. …/框架 → 框架). */
export function projectNameFromRoot(frameworkRoot?: string | null): string {
  const trimmed = String(frameworkRoot || '').trim().replace(/[/\\]+$/, '');
  if (!trimmed) return '';
  const parts = trimmed.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || trimmed;
}

export function agentHostLabel(agentUrl?: string): string {
  const raw = String(agentUrl || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
    return url.hostname || raw;
  } catch {
    return raw.replace(/^https?:\/\//, '').split('/')[0] || raw;
  }
}

export interface HostDisplayParts {
  place: 'local' | 'remote';
  placeLabel: string;
  locationDetail: string;
  project: string;
  optionLabel: string;
  primary: string;
  secondary: string;
}

/** UI copy for host chip / select options: location + current project. */
export function describeHostDisplay(
  profile: HostProfile,
  labels: { local: string; remote: string; unknownProject: string },
  frameworkRoot?: string | null,
): HostDisplayParts {
  const place = profile.kind === 'local' ? 'local' : 'remote';
  const placeLabel = place === 'local' ? labels.local : labels.remote;
  const locationDetail = place === 'local'
    ? (agentHostLabel(profile.agentUrl) || '127.0.0.1')
    : (agentHostLabel(profile.agentUrl) || agentHostLabel(profile.siteBaseUrl) || profile.name || '');
  const fromRoot = projectNameFromRoot(frameworkRoot || profile.frameworkRoot);
  const genericName = !profile.name
    || /^local$/i.test(profile.name)
    || /^remote(\s+\d+)?$/i.test(profile.name)
    || /^远程(\s*\d+)?$/.test(profile.name);
  const project = fromRoot || (!genericName ? profile.name : '') || labels.unknownProject;
  const secondary = locationDetail ? `${placeLabel} · ${locationDetail}` : placeLabel;
  return {
    place,
    placeLabel,
    locationDetail,
    project,
    primary: project,
    secondary,
    optionLabel: `${secondary} · ${project}`,
  };
}

export type HostSwitcherOption = {
  host: HostProfile;
  display: HostDisplayParts;
};

/** Case-insensitive filter for the searchable host switcher menu. */
export function filterHostsForSwitcher(
  options: HostSwitcherOption[],
  query: string,
): HostSwitcherOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((row) => {
    const haystack = [
      row.display.primary,
      row.display.secondary,
      row.display.optionLabel,
      row.display.locationDetail,
      row.host.name,
      row.host.agentUrl,
      row.host.frameworkRoot,
      row.host.siteBaseUrl,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
