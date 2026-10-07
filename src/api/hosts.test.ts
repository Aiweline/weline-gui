import { beforeEach, describe, expect, it } from 'vitest';
import {
  connectionFromProfile,
  createBlankRemoteHost,
  describeHostDisplay,
  getActiveHost,
  loadHosts,
  profileFromConnection,
  projectNameFromRoot,
  removeHost,
  setActiveHostId,
  upsertHost,
} from './hosts';

function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => { map.set(key, String(value)); },
    removeItem: (key: string) => { map.delete(key); },
    clear: () => { map.clear(); },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

describe('hosts profiles', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('migrates legacy connection into a host profile', () => {
    localStorage.setItem('weline.connection', JSON.stringify({
      mode: 'local',
      agentUrl: 'http://127.0.0.1:17640',
      token: 'abc',
      setupComplete: true,
    }));
    const hosts = loadHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0].kind).toBe('local');
    expect(hosts[0].agentToken).toBe('abc');
    expect(getActiveHost().id).toBe(hosts[0].id);
  });

  it('keeps tokens isolated per profile when switching', () => {
    const local = profileFromConnection({
      mode: 'local',
      agentUrl: 'http://127.0.0.1:17640',
      token: 'local-token',
      setupComplete: true,
    }, 'Local');
    const remote = createBlankRemoteHost('Remote');
    remote.agentUrl = 'https://remote.example:17640';
    remote.agentToken = 'remote-token';
    remote.setupComplete = true;
    const withLocal = upsertHost(local, []);
    upsertHost(remote, withLocal);
    setActiveHostId(remote.id);
    const active = getActiveHost();
    expect(active.agentToken).toBe('remote-token');
    expect(connectionFromProfile(active).token).toBe('remote-token');
  });

  it('never drops the last host on remove', () => {
    const only = createBlankRemoteHost('Only');
    const seeded = upsertHost(only, []);
    const next = removeHost(only.id, seeded);
    expect(next).toHaveLength(1);
  });

  it('describes location and project for the host chip', () => {
    expect(projectNameFromRoot('/Users/weline/Project/Official/框架')).toBe('框架');
    const local = profileFromConnection({
      mode: 'local',
      agentUrl: 'http://127.0.0.1:17640',
      token: 't',
      setupComplete: true,
    }, 'Local');
    const display = describeHostDisplay(local, {
      local: '本机',
      remote: '远程',
      unknownProject: '未配置项目',
    }, '/Users/weline/Project/Official/框架');
    expect(display.primary).toBe('框架');
    expect(display.secondary).toContain('本机');
    expect(display.optionLabel).toContain('框架');
  });
});

