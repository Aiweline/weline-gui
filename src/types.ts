export type Direction = 'ltr' | 'rtl';
export type ViewId =
  | 'dashboard'
  | 'fleet'
  | 'instances'
  | 'websites'
  | 'sites'
  | 'console'
  | 'terminal'
  | 'panel'
  | 'updates'
  | 'settings';

export interface ClientConnection {
  mode: 'local' | 'remote';
  agentUrl: string;
  token: string;
  setupComplete: boolean;
}

export type SshKeyStorage = 'os_keychain' | 'encrypted_vault' | 'session_only';

export interface SshPrivateKeyRef {
  storage: SshKeyStorage;
  keyId: string;
  publicKeyComment?: string;
  fingerprintSha256?: string;
}

/** Operator machine profile: agent + bound project + optional Framework API + SSH key ref (never PEM). */
export interface HostProfile {
  id: string;
  name: string;
  kind: 'local' | 'remote';
  agentUrl: string;
  agentToken: string;
  /** Bound Weline project root on this host agent; switching hosts activates this project. */
  frameworkRoot?: string;
  phpBinary?: string;
  siteBaseUrl?: string;
  apiUsername?: string;
  apiLoginPath?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshPrivateKeyRef?: SshPrivateKeyRef;
  hostKeyFingerprint?: string;
  setupComplete?: boolean;
}

export interface FrameworkAuthTokens {
  accessToken: string;
  refreshToken: string;
  expireTime?: number;
  username?: string;
}

export interface PublicConfig {
  frameworkRoot: string;
  phpBinary: string;
  listen: string;
  githubRepository?: string | null;
  adminUrl?: string | null;
  siteUrls: string[];
  language: string;
  refreshSeconds: number;
  configured: boolean;
}

export interface DiscoveredProject {
  name: string;
  frameworkRoot: string;
  phpBinary: string;
  githubRepository?: string | null;
  adminUrl?: string | null;
  siteUrls: string[];
  running: boolean;
  source: string;
}

export interface DiskMetrics {
  name: string;
  mountPoint: string;
  totalBytes: number;
  availableBytes: number;
}

export interface HostMetrics {
  hostname: string;
  osName: string;
  osVersion: string;
  cpuUsagePercent: number;
  cpuCores: number;
  loadAverage: [number, number, number];
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  uptimeSeconds: number;
  disks: DiskMetrics[];
  networkReceivedBytes: number;
  networkTransmittedBytes: number;
}

export interface ProcessMetrics {
  pid: number;
  parentPid?: number | null;
  name: string;
  role: string;
  status: string;
  cpuUsagePercent: number;
  memoryBytes: number;
  command: string;
  startedAtEpoch: number;
}

export interface WebsiteRecord {
  websiteId: number;
  name: string;
  code: string;
  url: string;
  defaultCurrency?: string;
  defaultLanguage?: string;
  defaultTimezone?: string;
  scope?: string;
}

export interface DomainPoolRecord {
  poolId: number;
  domain: string;
  rootDomain?: string;
  status?: string;
  httpsStatus?: string;
  siteReady?: number;
  siteCreated?: number;
}

export interface CreateWebsiteRequest {
  name: string;
  url?: string;
  code?: string;
  poolId?: number;
}

export interface WlsInstance {
  name: string;
  kind: string;
  status: string;
  isRunning: boolean;
  pid?: number | null;
  host: string;
  port: number;
  workerCount: number;
  daemon: boolean;
  startedAt: string;
  runningTime: string;
  url: string;
  workerPort?: number;
  edgeHttpPort?: number;
  edgeHttpsPort?: number;
  topology?: string;
  topologyLabel?: string;
  edgeFace?: string;
  edgePid?: number | null;
  edgeOwner?: string;
  edgeOwnerSelf?: boolean;
  workerDirect?: boolean;
  publicHost?: string;
  publicOrigin?: string;
  portSummary?: string;
}

export interface CertificateInfo {
  host: string;
  port: number;
  subject: string;
  issuer: string;
  serial: string;
  fingerprintSha256: string;
  notBefore: string;
  notAfter: string;
  daysRemaining: number;
  validNow: boolean;
}

export interface SiteStatus {
  url: string;
  host: string;
  port: number;
  source: string;
  certificate?: CertificateInfo | null;
  certificateError?: string | null;
}

export interface CertificateSiteReference {
  domain: string;
  websiteId: number;
  source: string;
  label: string;
}

export interface DeleteCertificateRequest {
  domain: string;
  confirm?: boolean;
}

export interface DeleteCertificateResult {
  success: boolean;
  needsConfirmation: boolean;
  domain: string;
  message: string;
  referencingSites: CertificateSiteReference[];
  phase?: string | null;
}

export interface DashboardSnapshot {
  generatedAt: string;
  agentVersion: string;
  frameworkRoot: string;
  host: HostMetrics;
  instances: WlsInstance[];
  processes: ProcessMetrics[];
  sites: SiteStatus[];
  adminUrl?: string | null;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface ConsoleCommandItem {
  name: string;
  tip: string;
  module: string;
  group: string;
}

export interface ConsoleCommandGroup {
  id: string;
  label: string;
  commands: ConsoleCommandItem[];
}

export interface ConsoleCommandCatalog {
  groups: ConsoleCommandGroup[];
  commands: ConsoleCommandItem[];
  count: number;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  publishedAt?: string | null;
  notes: string;
  repository: string;
}

