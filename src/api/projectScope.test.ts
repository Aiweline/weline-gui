import { describe, expect, it, vi } from 'vitest';
import { activateHostProject } from './projectScope';
import type { AgentTransport } from './transport';
import type { HostProfile, PublicConfig } from '../types';

function config(root: string): PublicConfig {
  return {
    frameworkRoot: root,
    phpBinary: 'php',
    listen: '127.0.0.1:17640',
    siteUrls: [],
    language: 'zh-CN',
    refreshSeconds: 3,
    configured: true,
  };
}

describe('activateHostProject', () => {
  it('no-ops when profile has no bound project', async () => {
    const current = config('/a/框架');
    const saveConfig = vi.fn();
    const transport = {
      config: vi.fn(async () => current),
      saveConfig,
    } as unknown as AgentTransport;
    const profile = { id: '1', name: 'Local', kind: 'local', agentUrl: 'http://127.0.0.1:17640', agentToken: 't' } as HostProfile;
    const next = await activateHostProject(transport, profile, current);
    expect(next.frameworkRoot).toBe('/a/框架');
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it('switches agent project when host profile points elsewhere', async () => {
    const current = config('/a/框架');
    const saveed = config('/b/框架GUI');
    const saveConfig = vi.fn(async () => saveed);
    const transport = {
      config: vi.fn(async () => current),
      saveConfig,
    } as unknown as AgentTransport;
    const profile = {
      id: '2',
      name: 'GUI',
      kind: 'local',
      agentUrl: 'http://127.0.0.1:17640',
      agentToken: 't',
      frameworkRoot: '/b/框架GUI',
      phpBinary: '/usr/bin/php',
    } as HostProfile;
    const next = await activateHostProject(transport, profile, current);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({
      frameworkRoot: '/b/框架GUI',
      phpBinary: '/usr/bin/php',
      configured: true,
    }));
    expect(next.frameworkRoot).toBe('/b/框架GUI');
  });
});
