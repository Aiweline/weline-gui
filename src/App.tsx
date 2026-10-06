import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentTransport, loadConnection, saveConnection } from './api/transport';
import { applyLocale } from './i18n';
import { localeCatalog, normalizeLocale } from './i18n/catalog';
import type {
  ClientConnection,
  CommandResult,
  DashboardSnapshot,
  DeleteCertificateResult,
  DiscoveredProject,
  DomainPoolRecord,
  PublicConfig,
  SiteStatus,
  UpdateInfo,
  ViewId,
  WebsiteRecord,
  WlsInstance,
} from './types';

const emptyConfig: PublicConfig = {
  frameworkRoot: '',
  phpBinary: 'php',
  listen: '127.0.0.1:17640',
  githubRepository: '',
  adminUrl: '',
  siteUrls: [],
  language: normalizeLocale(localStorage.getItem('weline.locale') || navigator.language),
  refreshSeconds: 3,
  configured: false,
};

const navigation: Array<{ id: ViewId; icon: string }> = [
  { id: 'dashboard', icon: '◫' },
  { id: 'instances', icon: '⌁' },
  { id: 'websites', icon: '⬡' },
  { id: 'sites', icon: '◎' },
  { id: 'console', icon: '>_' },
  { id: 'panel', icon: '▣' },
  { id: 'updates', icon: '↑' },
  { id: 'settings', icon: '⚙' },
];

export default function App() {
  const { t, i18n } = useTranslation();
  const [connection, setConnection] = useState<ClientConnection>(() => loadConnection());
  const [config, setConfig] = useState<PublicConfig>(emptyConfig);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [view, setView] = useState<ViewId>('dashboard');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [consoleResult, setConsoleResult] = useState<CommandResult | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [history, setHistory] = useState<Array<{ cpu: number; memory: number }>>([]);

  const transport = useMemo(() => new AgentTransport(connection), [connection]);

  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const mod = event.metaKey || event.ctrlKey;
      // Desktop native menu also binds Cmd/Ctrl+R + F5; this covers pure Web / when menu misses.
      if (key === 'F5' || (mod && key.toLowerCase() === 'r' && !event.altKey)) {
        event.preventDefault();
        reloadPage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reloadPage]);

  const refreshSnapshot = useCallback(async (silent = false) => {
    if (!connection.setupComplete) return;
    if (!silent) setLoading(true);
    try {
      const next = await transport.snapshot();
      setSnapshot(next);
      setHistory((previous) => [
        ...previous.slice(-23),
        {
          cpu: next.host.cpuUsagePercent,
          memory: percent(next.host.memoryUsedBytes, next.host.memoryTotalBytes),
        },
      ]);
      if (!silent) setError('');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [connection.setupComplete, transport]);

  useEffect(() => {
    if (!connection.setupComplete) return;
    let active = true;
    void transport.config()
      .then((next) => {
        if (!active) return;
        setConfig(next);
        void applyLocale(next.language || i18n.language);
      })
      .catch((reason) => active && setError(messageOf(reason)));
    void refreshSnapshot();
    return () => { active = false; };
  }, [connection.setupComplete, i18n.language, refreshSnapshot, transport]);

  useEffect(() => {
    if (!connection.setupComplete) return;
    const interval = window.setInterval(() => void refreshSnapshot(true), Math.max(1, config.refreshSeconds) * 1000);
    return () => window.clearInterval(interval);
  }, [config.refreshSeconds, connection.setupComplete, refreshSnapshot]);

  useEffect(() => {
    if (!connection.setupComplete || !config.githubRepository) return;
    void transport.update().then(setUpdateInfo).catch(() => undefined);
  }, [config.githubRepository, connection.setupComplete, transport]);

  const runControl = async (action: string, instance = 'default') => {
    setBusyAction(`${action}:${instance}`);
    try {
      const result = await transport.control(action, instance);
      setConsoleResult(result);
      if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
      await refreshSnapshot(true);
      setError('');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyAction('');
    }
  };

  const runCommand = async (command: string) => {
    setBusyAction('console');
    try {
      const result = await transport.command(command);
      setConsoleResult(result);
      setError(result.exitCode === 0 ? '' : result.stderr || result.stdout);
      await refreshSnapshot(true);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyAction('');
    }
  };

  const checkUpdate = async () => {
    setBusyAction('update');
    try {
      setUpdateInfo(await transport.update());
      setError('');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyAction('');
    }
  };

  const completeSetup = async (nextConnection: ClientConnection, nextConfig: PublicConfig) => {
    const readyConnection = { ...nextConnection, setupComplete: true };
    const setupTransport = new AgentTransport(readyConnection);
    const sessionConnection = await setupTransport.ensureSession();
    const existing = await setupTransport.config();
    const saved = await setupTransport.saveConfig({
      ...existing,
      ...nextConfig,
      language: nextConfig.language,
      configured: Boolean(nextConfig.frameworkRoot || existing.frameworkRoot),
    });
    const finalized = { ...sessionConnection, setupComplete: true };
    saveConnection(finalized);
    setConnection(finalized);
    setConfig(saved);
    await applyLocale(saved.language);
  };

  const saveSettings = async (nextConnection: ClientConnection, nextConfig: PublicConfig) => {
    const settingsTransport = new AgentTransport(nextConnection);
    const saved = await settingsTransport.saveConfig(nextConfig);
    saveConnection(nextConnection);
    setConnection(nextConnection);
    setConfig(saved);
    await applyLocale(saved.language);
    setError('');
  };

  if (!connection.setupComplete) {
    return (
      <SetupWizard
        initialConnection={connection}
        initialConfig={config}
        onComplete={completeSetup}
      />
    );
  }

  const onlineCount = snapshot?.instances.filter((instance) => instance.isRunning).length ?? 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="main-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.id)}
              aria-label={t(`navigation.${item.id}`)}
              title={t(`navigation.${item.id}`)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{t(`navigation.${item.id}`)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className={error ? 'status-dot danger' : 'status-dot'} />
          <div>
            <strong>{error ? t('common.offline') : t('common.online')}</strong>
            <small>{connection.mode === 'local' ? t('settings.local') : t('settings.remote')}</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-context">
            <span className="mobile-brand">W</span>
            <div>
              <strong>{snapshot?.host.hostname || t('brand.agent')}</strong>
              <small>{onlineCount} {t('dashboard.onlineInstances').toLowerCase()} · v{snapshot?.agentVersion ?? '0.1.0'}</small>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="live-chip"><span /> LIVE</span>
            <button
              type="button"
              className="icon-button"
              onClick={() => void refreshSnapshot()}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              disabled={loading}
            >
              ↻
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={reloadPage}
              aria-label={t('common.reloadPage')}
              title={`${t('common.reloadPage')} (⌘/Ctrl+R · F5)`}
            >
              ⟳
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <div><strong>{t('errors.unavailable')}</strong><span>{error}</span></div>
            <button onClick={() => void refreshSnapshot()}>{t('errors.retry')}</button>
          </div>
        )}

        {view === 'dashboard' && (
          <DashboardView
            snapshot={snapshot}
            history={history}
            loading={loading}
            busyAction={busyAction}
            onControl={runControl}
          />
        )}
        {view === 'instances' && (
          <InstancesView snapshot={snapshot} busyAction={busyAction} onControl={runControl} />
        )}
        {view === 'websites' && (
          <WebsitesView
            transport={transport}
            adminUrl={snapshot?.adminUrl || config.adminUrl || ''}
          />
        )}
        {view === 'sites' && (
          <SitesView
            snapshot={snapshot}
            transport={transport}
            onChanged={() => void refreshSnapshot(true)}
          />
        )}
        {view === 'console' && (
          <ConsoleView result={consoleResult} busy={busyAction === 'console'} onRun={runCommand} />
        )}
        {view === 'panel' && <PanelView url={snapshot?.adminUrl || config.adminUrl || ''} transport={transport} />}
        {view === 'updates' && (
          <UpdatesView config={config} info={updateInfo} busy={busyAction === 'update'} onCheck={checkUpdate} />
        )}
        {view === 'settings' && (
          <SettingsView connection={connection} config={config} onSave={saveSettings} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 5).map((item) => (
          <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)} aria-label={t(`navigation.${item.id}`)}>
            <span>{item.icon}</span><small>{t(`navigation.${item.id}`)}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  const { t } = useTranslation();
  return (
    <div className="brand-lockup">
      <div className="brand-mark">W</div>
      <div><strong>{t('brand.name')}</strong><small>{t('brand.product')}</small></div>
    </div>
  );
}

function DashboardView({ snapshot, history, loading, busyAction, onControl }: {
  snapshot: DashboardSnapshot | null;
  history: Array<{ cpu: number; memory: number }>;
  loading: boolean;
  busyAction: string;
  onControl: (action: string, instance?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const running = snapshot?.instances.filter((instance) => instance.isRunning) ?? [];
  const primary = running[0];
  const memoryPercent = snapshot ? percent(snapshot.host.memoryUsedBytes, snapshot.host.memoryTotalBytes) : 0;
  const disk = snapshot?.host.disks[0];
  const diskAvailable = disk ? percent(disk.availableBytes, disk.totalBytes) : 0;
  return (
    <div className="page page-dashboard">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">{t('dashboard.eyebrow')}</p>
          <h1>{t('dashboard.title')}</h1>
          <p className="hero-copy">{t('dashboard.subtitle')}</p>
          <div className="hero-meta">
            <span><i className={running.length ? 'status-dot' : 'status-dot muted'} />{running.length} {t('dashboard.onlineInstances')}</span>
            <span>{snapshot?.processes.length ?? 0} {t('dashboard.trackedProcesses')}</span>
          </div>
        </div>
        <div className="hero-control">
          <span className="hero-control-label">{t('dashboard.quickControl')}</span>
          <strong>{primary?.name ?? 'default'}</strong>
          <small>{primary?.url ?? t('dashboard.noRunning')}</small>
          <div className="control-row">
            {primary ? (
              <>
                <ActionButton label={t('common.restart')} action="restart" instance={primary.name} busyAction={busyAction} onControl={onControl} />
                <ActionButton label={t('common.stop')} action="stop" instance={primary.name} busyAction={busyAction} onControl={onControl} tone="quiet" />
              </>
            ) : (
              <ActionButton label={t('common.start')} action="start" instance="default" busyAction={busyAction} onControl={onControl} />
            )}
          </div>
        </div>
      </section>

      <section className="metric-grid" aria-busy={loading}>
        <MetricCard label={t('dashboard.cpu')} value={`${(snapshot?.host.cpuUsagePercent ?? 0).toFixed(1)}%`} detail={`${snapshot?.host.cpuCores ?? 0} cores`} percentValue={snapshot?.host.cpuUsagePercent ?? 0} />
        <MetricCard label={t('dashboard.memory')} value={`${memoryPercent.toFixed(1)}%`} detail={snapshot ? `${formatBytes(snapshot.host.memoryUsedBytes)} / ${formatBytes(snapshot.host.memoryTotalBytes)}` : '—'} percentValue={memoryPercent} />
        <MetricCard label={t('dashboard.disk')} value={`${diskAvailable.toFixed(1)}%`} detail={disk ? `${formatBytes(disk.availableBytes)} free` : '—'} percentValue={diskAvailable} />
        <MetricCard label={t('dashboard.uptime')} value={formatUptime(snapshot?.host.uptimeSeconds ?? 0)} detail={snapshot ? `${snapshot.host.osName} ${snapshot.host.osVersion}` : '—'} />
      </section>

      <section className="dashboard-grid">
        <article className="panel performance-panel">
          <PanelHeading title={t('dashboard.performance')} meta={t('dashboard.lastUpdated')} />
          <Sparkline history={history} />
          <div className="chart-legend"><span className="cpu">{t('dashboard.cpu')}</span><span className="memory">{t('dashboard.memory')}</span></div>
        </article>
        <article className="panel process-panel">
          <PanelHeading title={t('dashboard.processTitle')} meta={`${snapshot?.processes.length ?? 0}`} />
          <p className="panel-hint">{t('dashboard.processHint')}</p>
          <ProcessList processes={snapshot?.processes.slice(0, 7) ?? []} />
        </article>
      </section>

      <footer className="page-footer">
        <span>{t('dashboard.frameworkRoot')}</span><code>{snapshot?.frameworkRoot ?? '—'}</code>
        <time>{snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString() : '—'}</time>
      </footer>
    </div>
  );
}

function InstancesView({ snapshot, busyAction, onControl }: {
  snapshot: DashboardSnapshot | null;
  busyAction: string;
  onControl: (action: string, instance?: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const instances = snapshot?.instances ?? [];
  return (
    <Page title={t('instances.title')} subtitle={t('instances.subtitle')} action={
      <ActionButton label={t('instances.startDefault')} action="start" instance="default" busyAction={busyAction} onControl={onControl} />
    }>
      <div className="instance-list">
        {instances.length === 0 && <EmptyState>{t('common.noData')}</EmptyState>}
        {instances.map((instance) => (
          <article className={instance.isRunning ? 'instance-card online' : 'instance-card'} key={instance.name}>
            <div className="instance-identity">
              <span className={instance.isRunning ? 'instance-pulse' : 'instance-pulse stopped'} />
              <div>
                <strong>{instance.name}</strong>
                <small>{instance.kind || 'weline'} · {instance.status}</small>
                <div className="instance-tags">
                  <span className={`edge-chip face-${instance.edgeFace || 'wls'}`}>{edgeFaceLabel(instance.edgeFace, t)}</span>
                  <span className={instance.workerDirect || instance.topology === 'direct' ? 'edge-chip topology-direct' : 'edge-chip'}>
                    {instance.workerDirect || instance.topology === 'direct' ? t('instances.workerDirect') : (instance.topologyLabel || t('instances.dispatcher'))}
                  </span>
                </div>
              </div>
            </div>
            <div className="instance-stat">
              <span>{t('instances.public')}</span>
              <a href={instance.url} target="_blank" rel="noreferrer">{publicEndpoint(instance)}</a>
              <small>{edgeListenHint(instance)}</small>
            </div>
            <div className="instance-stat">
              <span>{t('instances.upstream')}</span>
              <strong>{instance.host}:{instance.workerPort || instance.port}</strong>
              <small>{t('instances.workers')} {instance.workerCount}</small>
            </div>
            <div className="instance-stat">
              <span>{t('instances.gateway')}</span>
              <strong>{instance.edgeOwner || '—'}</strong>
              <small>{instance.edgeOwnerSelf ? t('instances.thisInstance') : (instance.edgeOwner ? t('instances.joinedGateway') : t('instances.noGateway'))}</small>
            </div>
            <div className="instance-stat">
              <span>{t('instances.masterPid')}</span>
              <strong>{instance.pid ?? '—'}</strong>
              <small>{t('instances.edgePid')} {instance.edgePid ?? '—'}</small>
            </div>
            <div className="instance-stat instance-stat-runtime">
              <span>{t('instances.runtime')}</span>
              <strong>{instance.runningTime || '—'}</strong>
            </div>
            <div className="instance-actions">
              {instance.isRunning ? (
                <>
                  <ActionButton label={t('common.reload')} action="reload" instance={instance.name} busyAction={busyAction} onControl={onControl} tone="quiet" />
                  <ActionButton label={t('common.restart')} action="restart" instance={instance.name} busyAction={busyAction} onControl={onControl} />
                  <ActionButton label={t('common.stop')} action="stop" instance={instance.name} busyAction={busyAction} onControl={onControl} tone="danger" />
                </>
              ) : <ActionButton label={t('common.start')} action="start" instance={instance.name} busyAction={busyAction} onControl={onControl} />}
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}

function WebsitesView({
  transport,
  adminUrl,
}: {
  transport: AgentTransport;
  adminUrl: string;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<WebsiteRecord[]>([]);
  const [pool, setPool] = useState<DomainPoolRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<'load' | 'create'>('load');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [poolId, setPoolId] = useState('');
  const [code, setCode] = useState('');

  const backendDomainUrl = useMemo(() => {
    const base = (adminUrl || '').trim().replace(/\/$/, '');
    if (!base) return '';
    return `${base}/websites/admin/domain/index`;
  }, [adminUrl]);

  const selectedPool = useMemo(
    () => pool.find((row) => String(row.poolId) === poolId) || null,
    [pool, poolId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sites, domains] = await Promise.all([transport.websites(), transport.domainPool()]);
      setItems(sites);
      setPool(domains);
      setError('');
    } catch (reason) {
      setErrorKind('load');
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }, [transport]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onPoolChange = (value: string) => {
    setPoolId(value);
    const row = pool.find((item) => String(item.poolId) === value);
    if (!row) return;
    if (!name.trim()) setName(row.domain.replace(/\./g, ' '));
    if (!code.trim()) setCode(row.domain.replace(/\./g, '_').toLowerCase());
  };

  const openBackend = () => {
    if (!backendDomainUrl) return;
    void transport.openExternal(backendDomainUrl);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedId = Number(poolId);
    if (!selectedId || !selectedPool) {
      setErrorKind('create');
      setError(t('websites.poolRequired'));
      return;
    }
    setCreating(true);
    try {
      await transport.createWebsite({
        name: name.trim(),
        poolId: selectedId,
        url: selectedPool.domain,
        code: code.trim() || undefined,
      });
      setName('');
      setPoolId('');
      setCode('');
      setOpen(false);
      setError('');
      await refresh();
    } catch (reason) {
      setErrorKind('create');
      setError(messageOf(reason));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Page
      title={t('websites.title')}
      subtitle={t('websites.subtitle')}
      action={<button className="primary-button" onClick={() => setOpen((value) => !value)}>{open ? t('common.cancel') : t('websites.create')}</button>}
    >
      {open && (
        <form className="website-create panel" onSubmit={(event) => void submit(event)}>
          <p className="eyebrow">{t('websites.create')}</p>
          <div className="form-grid">
            <label>{t('websites.name')}<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="off" /></label>
            <label>{t('websites.code')}<input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t('websites.codeHint')} autoComplete="off" /></label>
            <label className="wide-field">
              {t('websites.url')}
              <select value={poolId} onChange={(event) => onPoolChange(event.target.value)} required>
                <option value="">{t('websites.poolPlaceholder')}</option>
                {pool.map((row) => (
                  <option key={row.poolId} value={String(row.poolId)}>{row.domain}</option>
                ))}
              </select>
              <small className="field-hint">
                {pool.length === 0 ? t('websites.poolEmpty') : t('websites.poolHint')}
                {backendDomainUrl ? (
                  <>
                    {' · '}
                    <button type="button" className="text-button linkish" onClick={openBackend}>{t('websites.openBackend')}</button>
                  </>
                ) : null}
              </small>
            </label>
          </div>
          <div className="form-actions">
            <button className="primary-button" disabled={creating || pool.length === 0}>{creating ? t('common.loading') : t('websites.save')}</button>
            <span className="website-create-hint">{t('websites.moduleHint')}</span>
          </div>
        </form>
      )}
      {error && (
        <div className="status-banner" role="alert">
          <div>
            <strong>{errorKind === 'create' ? t('websites.createError') : t('websites.loadError')}</strong>
            <p>{errorKind === 'create' ? error : t('websites.loadErrorHint')}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}>{t('errors.retry')}</button>
        </div>
      )}
      <div className="site-grid">
        {loading && items.length === 0 && !error && <EmptyState>{t('common.loading')}</EmptyState>}
        {!loading && items.length === 0 && !error && <EmptyState>{t('websites.empty')}</EmptyState>}
        {items.map((website) => (
          <article className="site-card website-card" key={`${website.websiteId}:${website.code}`}>
            <div className="site-card-top">
              <div className="domain-icon">⬡</div>
              <div>
                <strong>{website.name}</strong>
                <small>{website.code} · ID {website.websiteId}</small>
              </div>
              {website.websiteId === 0 && <span className="certificate-badge valid">{t('websites.default')}</span>}
            </div>
            <dl className="certificate-details">
              <div><dt>{t('websites.url')}</dt><dd>{website.url ? <button type="button" className="text-button linkish" onClick={() => void transport.openExternal(website.url)}>{website.url}</button> : '—'}</dd></div>
              <div><dt>{t('websites.language')}</dt><dd>{website.defaultLanguage || '—'}</dd></div>
              <div><dt>{t('websites.currency')}</dt><dd>{website.defaultCurrency || '—'}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </Page>
  );
}

function SitesView({
  snapshot,
  transport,
  onChanged,
}: {
  snapshot: DashboardSnapshot | null;
  transport: AgentTransport;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [busyDomain, setBusyDomain] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    site: SiteStatus;
    result: DeleteCertificateResult;
  } | null>(null);

  const canDelete = (site: SiteStatus) => {
    const host = (site.host || '').trim().toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    return site.source === 'wls-managed' || Boolean(site.certificate);
  };

  const runDelete = async (site: SiteStatus, confirm = false) => {
    const domain = (site.host || '').trim().toLowerCase();
    if (!domain) return;
    setBusyDomain(domain);
    setError('');
    try {
      const result = await transport.deleteCertificate({ domain, confirm });
      if (result.needsConfirmation) {
        setPending({ site, result });
        return;
      }
      if (!result.success) {
        setError(result.message || t('sites.deleteFailed'));
        return;
      }
      setPending(null);
      onChanged();
    } catch (reason) {
      setError(messageOf(reason) || t('sites.deleteFailed'));
    } finally {
      setBusyDomain('');
    }
  };

  return (
    <Page title={t('sites.title')} subtitle={t('sites.subtitle')}>
      {error && (
        <div className="status-banner" role="alert">
          <div>
            <strong>{t('sites.deleteFailed')}</strong>
            <p>{error}</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setError('')}>{t('common.cancel')}</button>
        </div>
      )}
      {pending && (
        <div className="confirm-banner" role="alertdialog" aria-modal="true" aria-labelledby="cert-delete-confirm-title">
          <div>
            <strong id="cert-delete-confirm-title">{t('sites.deleteConfirmTitle')}</strong>
            <p>{t('sites.deleteConfirmBody', {
              domain: pending.result.domain || pending.site.host,
              sites: pending.result.referencingSites.map((item) => item.label).filter(Boolean).join(', ')
                || pending.result.domain
                || pending.site.host,
            })}</p>
          </div>
          <div className="confirm-actions">
            <button
              type="button"
              className="action-button danger"
              disabled={busyDomain === (pending.site.host || '').toLowerCase()}
              onClick={() => void runDelete(pending.site, true)}
            >
              {busyDomain ? t('common.loading') : t('sites.deleteConfirmAction')}
            </button>
            <button type="button" className="secondary-button" disabled={Boolean(busyDomain)} onClick={() => setPending(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      <div className="site-grid">
        {(snapshot?.sites ?? []).length === 0 && <EmptyState>{t('common.noData')}</EmptyState>}
        {snapshot?.sites.map((site) => {
          const certificate = site.certificate;
          const healthy = Boolean(certificate?.validNow && certificate.daysRemaining > 14);
          const certificateError = site.certificateError === 'Configure the public website URL to inspect its TLS certificate'
            ? t('sites.publicUrlRequired')
            : site.certificateError === 'TLS is not enabled for this URL'
              ? t('sites.tlsDisabled')
              : site.certificateError || t('sites.noTls');
          const domain = (site.host || '').trim().toLowerCase();
          const deleting = busyDomain === domain;
          return (
            <article className="site-card" key={`${site.url}:${site.source}`}>
              <div className="site-card-top">
                <div className="domain-icon">◎</div>
                <div><a href={site.url} target="_blank" rel="noreferrer">{site.host || site.url}</a><small>{site.source} · :{site.port}</small></div>
                <div className="site-card-actions">
                  <span className={healthy ? 'certificate-badge valid' : 'certificate-badge'}>{certificate ? (healthy ? t('sites.valid') : t('sites.invalid')) : (site.url.startsWith('https://') ? 'TLS' : 'HTTP')}</span>
                  {canDelete(site) && (
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      title={t('sites.delete')}
                      aria-label={t('sites.delete')}
                      disabled={deleting || Boolean(busyDomain)}
                      onClick={() => void runDelete(site, false)}
                    >
                      {deleting ? '…' : '✕'}
                    </button>
                  )}
                </div>
              </div>
              {certificate ? (
                <dl className="certificate-details">
                  <div><dt>{t('sites.expires')}</dt><dd>{certificate.notAfter}</dd></div>
                  <div><dt>{t('sites.certificate')}</dt><dd>{t('sites.days', { count: certificate.daysRemaining })}</dd></div>
                  <div><dt>{t('sites.subject')}</dt><dd title={certificate.subject}>{certificate.subject}</dd></div>
                  <div><dt>{t('sites.issuer')}</dt><dd title={certificate.issuer}>{certificate.issuer}</dd></div>
                  <div><dt>{t('sites.fingerprint')}</dt><dd title={certificate.fingerprintSha256}>{certificate.fingerprintSha256}</dd></div>
                </dl>
              ) : <p className="certificate-error">{certificateError}</p>}
            </article>
          );
        })}
      </div>
    </Page>
  );
}

function ConsoleView({ result, busy, onRun }: { result: CommandResult | null; busy: boolean; onRun: (command: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [command, setCommand] = useState('php bin/w server:status --doctor --json');
  const submit = (event: FormEvent) => { event.preventDefault(); void onRun(command); };
  return (
    <Page title={t('console.title')} subtitle={t('console.subtitle')}>
      <div className="console-shell">
        <div className="console-safety"><span>⌁</span>{t('console.safeBoundary')}</div>
        <form className="command-form" onSubmit={submit}>
          <span className="prompt">›</span>
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={t('console.placeholder')} spellCheck={false} />
          <button className="primary-button" disabled={busy}>{busy ? t('common.loading') : t('console.run')}</button>
        </form>
        <div className="terminal-output" aria-live="polite">
          <div className="terminal-toolbar"><span>{t('console.history')}</span>{result && <span className={result.exitCode === 0 ? 'exit-success' : 'exit-error'}>{t('console.exitCode', { code: result.exitCode })} · {result.durationMs}ms</span>}</div>
          <pre>{result ? [result.stdout, result.stderr].filter(Boolean).join('\n') : t('console.empty')}</pre>
        </div>
      </div>
    </Page>
  );
}

function PanelView({ url, transport }: { url: string; transport: AgentTransport }) {
  const { t } = useTranslation();
  const panelUrl = withWlsPanelPath(url);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(panelUrl));
  const [failReason, setFailReason] = useState<'blocked' | 'empty' | 'timeout'>('blocked');
  const loadTimerRef = useRef<number | null>(null);
  const clearLoadTimer = () => {
    if (loadTimerRef.current !== null) {
      window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  };
  useEffect(() => {
    setEmbedFailed(false);
    setLoading(Boolean(panelUrl));
    setFailReason('blocked');
    clearLoadTimer();
    if (!panelUrl) return undefined;
    // Cross-origin X-Frame blocks often leave a dark empty iframe with no onError.
    loadTimerRef.current = window.setTimeout(() => {
      setFailReason('timeout');
      setEmbedFailed(true);
      setLoading(false);
      loadTimerRef.current = null;
    }, 8000);
    return () => clearLoadTimer();
  }, [panelUrl]);
  const openPanel = () => {
    if (panelUrl) void transport.openExternal(panelUrl);
  };
  const failMessage = failReason === 'timeout'
    ? t('panel.embedTimeout')
    : failReason === 'empty'
      ? t('panel.embedEmpty')
      : t('panel.embedBlocked');
  return (
    <Page title={t('panel.title')} subtitle={t('panel.subtitle')} action={panelUrl ? <button type="button" className="secondary-button" onClick={openPanel}>{t('common.open')} ↗</button> : undefined}>
      {panelUrl ? (
        embedFailed ? (
          <div className="embedded-panel panel-fallback">
            <div className="empty-state">
              <span>◇</span>
              <p>{failMessage}</p>
              <button type="button" className="primary-button" onClick={openPanel}>{t('panel.openWindow')}</button>
            </div>
          </div>
        ) : (
          <div className="embedded-panel">
            <div className="frame-notice">{loading ? t('panel.loading') : t('panel.frameHint')}</div>
            <iframe
              title={t('panel.title')}
              src={panelUrl}
              referrerPolicy="origin"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
              onError={() => {
                clearLoadTimer();
                setFailReason('blocked');
                setEmbedFailed(true);
                setLoading(false);
              }}
              onLoad={(event) => {
                clearLoadTimer();
                setLoading(false);
                try {
                  const doc = event.currentTarget.contentDocument;
                  if (doc && doc.body && doc.body.childElementCount === 0 && !doc.body.innerText.trim()) {
                    setFailReason('empty');
                    setEmbedFailed(true);
                  }
                } catch {
                  /* cross-origin: headers may still allow paint; keep iframe */
                }
              }}
            />
          </div>
        )
      ) : <EmptyState>{t('panel.missing')}</EmptyState>}
    </Page>
  );
}

function withWlsPanelPath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/wls-panel/i.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\/$/, '')}/server/backend/wls-panel`;
}

function UpdatesView({ config, info, busy, onCheck }: { config: PublicConfig; info: UpdateInfo | null; busy: boolean; onCheck: () => Promise<void> }) {
  const { t } = useTranslation();
  return (
    <Page title={t('updates.title')} subtitle={t('updates.subtitle')} action={<button className="primary-button" onClick={() => void onCheck()} disabled={busy || !config.githubRepository}>{busy ? t('common.loading') : t('updates.check')}</button>}>
      <div className="update-card">
        <div className={info?.updateAvailable ? 'update-orbit available' : 'update-orbit'}><span>↑</span></div>
        <div className="update-summary">
          <p className="eyebrow">{config.githubRepository || t('updates.configure')}</p>
          <h2>{info ? (info.updateAvailable ? t('updates.available') : t('updates.currentStatus')) : t('updates.check')}</h2>
          <div className="version-row"><span>{t('updates.current')} <strong>{info?.currentVersion || '0.1.0'}</strong></span><i>→</i><span>{t('updates.latest')} <strong>{info?.latestVersion || '—'}</strong></span></div>
          <p className="signed-note">⌁ {t('updates.signed')}</p>
          {info?.releaseUrl && <a href={info.releaseUrl} target="_blank" rel="noreferrer">{t('updates.releaseNotes')} ↗</a>}
        </div>
      </div>
      {info?.notes && <article className="panel release-notes"><PanelHeading title={t('updates.releaseNotes')} /><pre>{info.notes}</pre></article>}
    </Page>
  );
}

function SettingsView({ connection, config, onSave }: { connection: ClientConnection; config: PublicConfig; onSave: (connection: ClientConnection, config: PublicConfig) => Promise<void> }) {
  const { t } = useTranslation();
  const [draftConnection, setDraftConnection] = useState(connection);
  const [draftConfig, setDraftConfig] = useState(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraftConnection(connection); setDraftConfig(config); }, [connection, config]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setSaved(false);
    try { await onSave(draftConnection, draftConfig); setSaved(true); } finally { setSaving(false); }
  };
  return (
    <Page title={t('settings.title')} subtitle={t('settings.subtitle')}>
      <form className="settings-form" onSubmit={submit}>
        <SettingsFields connection={draftConnection} config={draftConfig} onConnection={setDraftConnection} onConfig={setDraftConfig} />
        <div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</button>{saved && <span className="saved-message">✓ {t('settings.saved')}</span>}</div>
      </form>
    </Page>
  );
}

function SetupWizard({ initialConnection, initialConfig, onComplete }: {
  initialConnection: ClientConnection;
  initialConfig: PublicConfig;
  onComplete: (connection: ClientConnection, config: PublicConfig) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(0);
  const [connection, setConnection] = useState(initialConnection);
  const [config, setConfig] = useState({ ...emptyConfig, ...initialConfig, language: normalizeLocale(i18n.language) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const chooseLocale = async (locale: string) => { setConfig((value) => ({ ...value, language: locale })); await applyLocale(locale); };
  const finish = async () => {
    setBusy(true); setError('');
    try { await onComplete(connection, config); } catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); }
  };
  return (
    <main className="setup-shell">
      <section className="setup-visual">
        <div className="setup-brand"><div className="brand-mark large">W</div><strong>Weline</strong></div>
        <div className="setup-visual-copy"><span className="setup-badge">{t('setup.badge')}</span><h1>{t('setup.title')}</h1><p>{t('setup.subtitle')}</p></div>
        <div className="setup-orbit" aria-hidden="true"><span /><span /><span /><i>WLS</i></div>
      </section>
      <section className="setup-form-panel">
        <div className="setup-progress"><span className={step >= 0 ? 'active' : ''}>1</span><i /><span className={step >= 1 ? 'active' : ''}>2</span><i /><span className={step >= 2 ? 'active' : ''}>3</span></div>
        {step === 0 && <div className="setup-step"><p className="eyebrow">01 / 03</p><h2>{t('setup.languageStep')}</h2><div className="language-grid">{Object.entries(localeCatalog).map(([locale, definition]) => <button key={locale} className={config.language === locale ? 'language-option selected' : 'language-option'} onClick={() => void chooseLocale(locale)}><strong>{definition.nativeLabel}</strong><small>{definition.label}</small></button>)}</div><button className="primary-button wide" onClick={() => setStep(1)}>{t('common.continue')} →</button></div>}
        {step === 1 && <div className="setup-step"><p className="eyebrow">02 / 03</p><h2>{t('setup.connectionStep')}</h2><div className="connection-options"><button className={connection.mode === 'local' ? 'connection-option selected' : 'connection-option'} onClick={() => setConnection({ ...connection, mode: 'local' })}><span>⌂</span><strong>{t('setup.localTitle')}</strong><small>{t('setup.localText')}</small></button><button className={connection.mode === 'remote' ? 'connection-option selected' : 'connection-option'} onClick={() => setConnection({ ...connection, mode: 'remote' })}><span>⌁</span><strong>{t('setup.remoteTitle')}</strong><small>{t('setup.remoteText')}</small></button></div>{connection.mode === 'remote' && <div className="compact-fields"><label>{t('settings.agentUrl')}<input value={connection.agentUrl} onChange={(event) => setConnection({ ...connection, agentUrl: event.target.value })} placeholder="https://server.example.com:17640" /></label><label>{t('settings.token')}<input type="password" value={connection.token} onChange={(event) => setConnection({ ...connection, token: event.target.value })} /><small>{t('setup.tokenHint')}</small></label></div>}<div className="step-actions"><button className="text-button" onClick={() => setStep(0)}>← {t('common.back')}</button><button className="primary-button" onClick={() => setStep(2)}>{t('common.continue')} →</button></div></div>}
        {step === 2 && <div className="setup-step"><p className="eyebrow">03 / 03</p><h2>{t('setup.projectStep')}</h2><p className="setup-step-copy">{connection.mode === 'local' ? t('setup.scanHint') : t('setup.remoteProjectHint')}</p><ProjectPicker connection={connection} config={config} onConfig={setConfig} compact />{error && <p className="inline-error">{error}</p>}<div className="step-actions"><button className="text-button" onClick={() => setStep(1)}>← {t('common.back')}</button><button className="primary-button" onClick={() => void finish()} disabled={busy}>{busy ? t('common.loading') : t('setup.finish')} →</button></div></div>}
      </section>
    </main>
  );
}

function ProjectPicker({ connection, config, onConfig, compact = false }: {
  connection: ClientConnection;
  config: PublicConfig;
  onConfig: (value: PublicConfig) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<DiscoveredProject[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [custom, setCustom] = useState(connection.mode !== 'local');
  const configRef = useRef(config);
  const didAutoSelect = useRef(false);
  const transport = useMemo(() => new AgentTransport(connection), [connection]);
  useEffect(() => { configRef.current = config; }, [config]);

  const applyProject = useCallback((project: DiscoveredProject) => {
    const current = configRef.current;
    onConfig({
      ...current,
      frameworkRoot: project.frameworkRoot,
      phpBinary: project.phpBinary || current.phpBinary || 'php',
      githubRepository: project.githubRepository || current.githubRepository || '',
      adminUrl: project.adminUrl || current.adminUrl || '',
      siteUrls: project.siteUrls.length ? project.siteUrls : current.siteUrls,
    });
  }, [onConfig]);

  const scan = useCallback(async () => {
    setScanning(true);
    setScanError('');
    try {
      const next = await transport.scanProjects();
      setProjects(next);
      if (connection.mode !== 'local') {
        return;
      }
      // 本机始终保持「选择列表」主界面（与桌面一致）；自定义表单仅用户主动切换。
      setCustom(false);
      const currentRoot = normalizeRoot(configRef.current.frameworkRoot);
      const match = currentRoot
        ? next.find((project) => normalizeRoot(project.frameworkRoot) === currentRoot)
        : undefined;
      if (match) {
        didAutoSelect.current = true;
        applyProject(match);
        return;
      }
      if (currentRoot) {
        didAutoSelect.current = true;
        return;
      }
      const preferred = next.find((project) => project.running) || next[0];
      if (!preferred) {
        return;
      }
      didAutoSelect.current = true;
      applyProject(preferred);
    } catch (reason) {
      setProjects([]);
      const code = messageOf(reason);
      if (code === 'LOCAL_SCAN_SPA_FALLBACK' || code === 'LOCAL_SCAN_INVALID_PAYLOAD') {
        setScanError(t('setup.scanRequiresDesktop'));
      } else if (/Failed to fetch|NetworkError|Load failed|ECONNREFUSED/i.test(code)) {
        setScanError(t('setup.scanRequiresDesktop'));
      } else {
        setScanError(code);
      }
      // 失败时仍留在选择态，避免误落到手填表单（截图中的「选择已扫描项目」回退态）。
      if (connection.mode === 'local') setCustom(false);
    } finally {
      setScanning(false);
    }
  }, [applyProject, connection.mode, t, transport]);

  useEffect(() => {
    didAutoSelect.current = false;
    void scan();
  }, [scan]);

  const selectedRoot = config.frameworkRoot;
  return (
    <fieldset>
      <legend>{t('setup.projectStep')}</legend>
      {connection.mode === 'local' && (
        <div className="project-picker-toolbar">
          <span>{scanning ? t('setup.scanning') : t('setup.found', { count: projects.length })}</span>
          <div>
            <button type="button" className="text-button" onClick={() => void scan()} disabled={scanning}>{t('setup.scanRetry')}</button>
            <button type="button" className={custom ? 'secondary-button' : 'text-button'} onClick={() => setCustom((value) => !value)}>
              {custom ? t('setup.chooseScanned') : t('setup.customAdd')}
            </button>
          </div>
        </div>
      )}
      {scanError && <p className="inline-error">{scanError}</p>}
      {connection.mode === 'local' && !custom && (
        <div className="project-options" role="listbox" aria-label={t('setup.projectStep')}>
          {projects.length === 0 && !scanning && <EmptyState>{t('setup.scanEmpty')}</EmptyState>}
          {projects.map((project) => (
            <button
              key={project.frameworkRoot}
              type="button"
              role="option"
              aria-selected={normalizeRoot(selectedRoot) === normalizeRoot(project.frameworkRoot)}
              className={normalizeRoot(selectedRoot) === normalizeRoot(project.frameworkRoot) ? 'project-option selected' : 'project-option'}
              onClick={() => applyProject(project)}
            >
              <div className="project-option-head">
                <strong>{project.name}</strong>
                {project.running && <span className="running-chip">{t('setup.running')}</span>}
              </div>
              <small>{project.frameworkRoot}</small>
              <small>{project.adminUrl || project.siteUrls[0] || t('dashboard.noRunning')}</small>
            </button>
          ))}
        </div>
      )}
      {(custom || connection.mode === 'remote') && (
        <div className="form-grid">
          <label className="wide-field">{t('settings.frameworkRoot')}<input value={config.frameworkRoot} onChange={(event) => onConfig({ ...config, frameworkRoot: event.target.value })} placeholder={connection.mode === 'local' ? t('setup.customPathHint') : '/path/to/Weline'} /></label>
          <label>{t('settings.phpBinary')}<input value={config.phpBinary} onChange={(event) => onConfig({ ...config, phpBinary: event.target.value })} /></label>
          <label>{t('settings.github')}<input value={config.githubRepository ?? ''} onChange={(event) => onConfig({ ...config, githubRepository: event.target.value })} placeholder={t('settings.githubHint')} /></label>
          <label className="wide-field">{t('settings.adminUrl')}<input type="url" value={config.adminUrl ?? ''} onChange={(event) => onConfig({ ...config, adminUrl: event.target.value })} placeholder="https://admin.example.com" /></label>
          <label className="wide-field">{t('settings.sites')}<textarea value={config.siteUrls.join('\n')} onChange={(event) => onConfig({ ...config, siteUrls: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} placeholder={t('settings.sitesHint')} rows={compact ? 2 : 4} /></label>
        </div>
      )}
    </fieldset>
  );
}

function SettingsFields({ connection, config, onConnection, onConfig, compact = false }: {
  connection: ClientConnection;
  config: PublicConfig;
  onConnection: (value: ClientConnection) => void;
  onConfig: (value: PublicConfig) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={compact ? 'settings-fields compact' : 'settings-fields'}>
      {!compact && <fieldset><legend>{t('settings.connection')}</legend><div className="segmented"><button type="button" className={connection.mode === 'local' ? 'active' : ''} onClick={() => onConnection({ ...connection, mode: 'local' })}>{t('settings.local')}</button><button type="button" className={connection.mode === 'remote' ? 'active' : ''} onClick={() => onConnection({ ...connection, mode: 'remote' })}>{t('settings.remote')}</button></div>{connection.mode === 'remote' && <div className="form-grid"><label>{t('settings.agentUrl')}<input value={connection.agentUrl} onChange={(event) => onConnection({ ...connection, agentUrl: event.target.value })} /></label><label>{t('settings.token')}<input type="password" value={connection.token} onChange={(event) => onConnection({ ...connection, token: event.target.value })} /></label></div>}</fieldset>}
      <ProjectPicker connection={connection} config={config} onConfig={onConfig} compact={compact} />
      {!compact && <fieldset><legend>{t('settings.title')}</legend><div className="form-grid"><label>{t('settings.language')}<select value={config.language} onChange={(event) => onConfig({ ...config, language: event.target.value })}>{Object.entries(localeCatalog).map(([locale, definition]) => <option value={locale} key={locale}>{definition.nativeLabel}</option>)}</select></label><label>{t('settings.refresh')}<input type="number" min="1" max="300" value={config.refreshSeconds} onChange={(event) => onConfig({ ...config, refreshSeconds: Number(event.target.value) })} /></label></div></fieldset>}
    </div>
  );
}

function Page({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return <div className="page"><header className="page-heading"><div><p className="eyebrow">WELINE CONTROL</p><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="page-action">{action}</div>}</header>{children}</div>;
}

function MetricCard({ label, value, detail, percentValue }: { label: string; value: string; detail: string; percentValue?: number }) {
  return <article className="metric-card"><div className="metric-head"><span>{label}</span><i>↗</i></div><strong>{value}</strong><small>{detail}</small>{percentValue !== undefined && <div className="meter"><span style={{ width: `${Math.min(100, Math.max(0, percentValue))}%` }} /></div>}</article>;
}

function PanelHeading({ title, meta }: { title: string; meta?: string }) { return <header className="panel-heading"><h2>{title}</h2>{meta && <span>{meta}</span>}</header>; }

function Sparkline({ history }: { history: Array<{ cpu: number; memory: number }> }) {
  const points = (key: 'cpu' | 'memory') => history.length < 2 ? '' : history.map((entry, index) => `${(index / (history.length - 1)) * 100},${100 - Math.min(100, entry[key])}`).join(' ');
  return <div className="sparkline"><div className="chart-grid" /><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Host performance history"><polyline className="memory-line" points={points('memory')} /><polyline className="cpu-line" points={points('cpu')} /></svg>{history.length < 2 && <span className="chart-empty">Collecting samples…</span>}</div>;
}

function ProcessList({ processes }: { processes: DashboardSnapshot['processes'] }) {
  const { t } = useTranslation();
  if (!processes.length) return <EmptyState>{t('common.noData')}</EmptyState>;
  return <div className="process-list">{processes.map((process) => <div className="process-row" key={process.pid}><span className="process-role">{process.role.slice(0, 2).toUpperCase()}</span><div><strong>{process.role}</strong><small>PID {process.pid} · {formatBytes(process.memoryBytes)}</small></div><span className="process-cpu">{process.cpuUsagePercent.toFixed(1)}%</span><i className="status-dot" /></div>)}</div>;
}

function ActionButton({ label, action, instance, busyAction, onControl, tone = 'primary' }: { label: string; action: string; instance: string; busyAction: string; onControl: (action: string, instance?: string) => Promise<void>; tone?: 'primary' | 'quiet' | 'danger' }) {
  const busy = busyAction === `${action}:${instance}`;
  return <button className={`action-button ${tone}`} onClick={() => void onControl(action, instance)} disabled={Boolean(busyAction)}>{busy ? '…' : label}</button>;
}

function EmptyState({ children }: { children: ReactNode }) { return <div className="empty-state"><span>◇</span><p>{children}</p></div>; }

function percent(value: number, total: number): number { return total > 0 ? (value / total) * 100 : 0; }
function formatBytes(bytes: number): string { if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`; }
function formatUptime(seconds: number): string { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); return days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`; }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason); }
function normalizeRoot(path: string): string {
  return path.trim().replace(/\/+$/, '');
}

function edgeFaceLabel(face: string | undefined, t: (key: string) => string): string {
  if (face === 'managed_nginx') return t('instances.nginx');
  if (face === 'gateway') return t('instances.sharedGateway');
  return t('instances.pureWls');
}

function publicEndpoint(instance: WlsInstance): string {
  if (instance.edgeFace === 'managed_nginx' || instance.edgeFace === 'gateway') {
    const host = instance.publicHost || instance.host;
    if (instance.edgeHttpsPort && instance.edgeHttpsPort !== 443) {
      return `${host}:${instance.edgeHttpsPort}`;
    }
    if (instance.edgeHttpPort && instance.edgeHttpPort !== 80 && !instance.edgeHttpsPort) {
      return `${host}:${instance.edgeHttpPort}`;
    }
    return host;
  }
  return `${instance.host}:${instance.workerPort || instance.port}`;
}

function edgeListenHint(instance: WlsInstance): string {
  if (instance.edgeFace === 'managed_nginx') {
    const http = instance.edgeHttpPort || 80;
    const https = instance.edgeHttpsPort || 443;
    return `nG ${http}/${https}`;
  }
  if (instance.edgeFace === 'gateway') {
    const http = instance.edgeHttpPort || 0;
    const https = instance.edgeHttpsPort || 0;
    return http || https ? `GW ${http}/${https}` : 'GW';
  }
  return instance.portSummary || `WLS ${instance.port}`;
}
