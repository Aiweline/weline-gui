import type { AgentTransport } from './transport';
import { normalizeFrameworkRoot } from './hosts';
import type { HostProfile, PublicConfig } from '../types';

/** Ensure the agent is pointed at this host profile's bound project before any project-scoped API. */
export async function activateHostProject(
  transport: AgentTransport,
  profile: HostProfile,
  current?: PublicConfig | null,
): Promise<PublicConfig> {
  const existing = current || await transport.config();
  const wantedRoot = normalizeFrameworkRoot(profile.frameworkRoot);
  const currentRoot = normalizeFrameworkRoot(existing.frameworkRoot);
  if (!wantedRoot || wantedRoot === currentRoot) {
    return existing;
  }
  const wantedPhp = String(profile.phpBinary || '').trim();
  return transport.saveConfig({
    ...existing,
    frameworkRoot: wantedRoot,
    phpBinary: wantedPhp || existing.phpBinary,
    configured: true,
  });
}
