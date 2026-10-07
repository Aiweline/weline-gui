import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fingerprintPemSha256,
  putEncryptedVaultKey,
  putSessionPrivateKey,
  resolvePrivateKeyMaterial,
} from '../api/sshKeys';
import { upsertHost } from '../api/hosts';
import type { HostProfile } from '../types';

function agentWsUrl(agentUrl: string, token: string, path: '/api/v1/ssh/session' | '/api/v1/shell/session'): string {
  const base = (agentUrl || window.location.origin).replace(/\/$/, '');
  const url = new URL(base.includes('://') ? base : `http://${base}`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = path;
  url.search = '';
  url.searchParams.set('token', token);
  return url.toString();
}

export function TerminalView({
  profile,
  agentToken,
  onProfileChange,
  onOpenFleet,
  onOpenSettings,
}: {
  profile: HostProfile;
  agentToken: string;
  onProfileChange: (next: HostProfile) => void;
  onOpenFleet?: () => void;
  onOpenSettings?: () => void;
}) {
  const { t } = useTranslation();
  const isLocal = profile.kind === 'local';
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const connectGenRef = useRef(0);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'closed' | 'error'>('idle');
  const [error, setError] = useState('');
  const [sshHost, setSshHost] = useState(profile.sshHost || '');
  const [sshPort, setSshPort] = useState(String(profile.sshPort || 22));
  const [sshUser, setSshUser] = useState(profile.sshUser || '');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [keyPassphrase, setKeyPassphrase] = useState('');
  const [vaultPassphrase, setVaultPassphrase] = useState('');
  const [persistVault, setPersistVault] = useState(false);
  const [hostKeyFingerprint, setHostKeyFingerprint] = useState(profile.hostKeyFingerprint || '');

  const canConnect = useMemo(
    () => Boolean(!isLocal && sshHost.trim() && sshUser.trim() && (privateKeyPem.trim() || profile.sshPrivateKeyRef) && agentToken),
    [agentToken, isLocal, privateKeyPem, profile.sshPrivateKeyRef, sshHost, sshUser],
  );

  const sockCleanup = () => {
    dataDisposableRef.current?.dispose();
    dataDisposableRef.current = null;
    if (socketRef.current) {
      try { socketRef.current.close(); } catch { /* ignore */ }
      socketRef.current = null;
    }
  };

  useEffect(() => {
    setSshHost(profile.sshHost || '');
    setSshPort(String(profile.sshPort || 22));
    setSshUser(profile.sshUser || '');
    setHostKeyFingerprint(profile.hostKeyFingerprint || '');
  }, [profile.id, profile.sshHost, profile.sshPort, profile.sshUser, profile.hostKeyFingerprint]);

  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0f1419',
        foreground: '#e7ecf3',
        cursor: '#7dd3fc',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    const onResize = () => {
      fit.fit();
      const sock = socketRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        sock.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      sockCleanup();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [profile.id]);

  const disconnect = () => {
    sockCleanup();
    setStatus('closed');
  };

  const wireSocketHandlers = (ws: WebSocket, term: Terminal, gen: number) => {
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (message) => {
      if (gen !== connectGenRef.current) return;
      if (typeof message.data === 'string') {
        try {
          const parsed = JSON.parse(message.data) as {
            type?: string;
            message?: string;
            cwd?: string;
          };
          if (parsed.type === 'starting') {
            setStatus('connecting');
            return;
          }
          if (parsed.type === 'ready') {
            setStatus('ready');
            setError('');
            // Local: skip banner — prompt/cwd already visible in the shell.
            if (!isLocal) {
              term.writeln(`\r\n${t('terminal.ready')}\r\n`);
            }
            return;
          }
          if (parsed.type === 'error') {
            setStatus('error');
            setError(parsed.message || t('terminal.failed'));
            term.writeln(`\r\n${parsed.message || t('terminal.failed')}`);
            return;
          }
          if (parsed.type === 'closed') {
            setStatus('closed');
            term.writeln(`\r\n[${t('terminal.closed')}]`);
          }
        } catch {
          term.write(message.data);
        }
        return;
      }
      const bytes = new Uint8Array(message.data as ArrayBuffer);
      term.write(bytes);
    };

    ws.onclose = () => {
      if (gen !== connectGenRef.current) return;
      setStatus((prev) => (prev === 'ready' ? 'closed' : prev));
      term.writeln(`\r\n[${t('terminal.closed')}]`);
    };

    dataDisposableRef.current?.dispose();
    dataDisposableRef.current = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stdin', data }));
      }
    });
  };

  const connectLocalShell = async () => {
    const gen = ++connectGenRef.current;
    setError('');
    if (!agentToken) {
      setError(t('terminal.missingToken'));
      setStatus('error');
      return;
    }
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    sockCleanup();
    setStatus('connecting');
    term.reset();
    const projectCwd = (profile.frameworkRoot || '').trim();

    try {
      const ws = new WebSocket(
        agentWsUrl(profile.agentUrl || window.location.origin, agentToken, '/api/v1/shell/session'),
      );
      socketRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(t('terminal.timeout'))), 15_000);
        ws.onopen = () => {
          window.clearTimeout(timer);
          resolve();
        };
        ws.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error(t('terminal.wsError')));
        };
      });

      if (gen !== connectGenRef.current) {
        try { ws.close(); } catch { /* ignore */ }
        return;
      }

      wireSocketHandlers(ws, term, gen);
      ws.send(JSON.stringify({
        type: 'connect',
        cwd: projectCwd || undefined,
        cols: term.cols,
        rows: term.rows,
      }));
    } catch (reason) {
      if (gen !== connectGenRef.current) return;
      setStatus('error');
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      term.writeln(`\r\n${message}`);
    }
  };

  const connect = async (event?: FormEvent) => {
    event?.preventDefault();
    if (isLocal) {
      await connectLocalShell();
      return;
    }
    setError('');
    if (!canConnect) {
      setError(t('terminal.missingFields'));
      return;
    }
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    sockCleanup();
    setStatus('connecting');
    term.reset();
    term.writeln(t('terminal.connecting'));

    try {
      let keyRef = profile.sshPrivateKeyRef;
      let material = keyRef
        ? await resolvePrivateKeyMaterial(keyRef, vaultPassphrase || undefined).catch(() => null)
        : null;

      if (privateKeyPem.trim()) {
        if (persistVault && vaultPassphrase.trim()) {
          keyRef = await putEncryptedVaultKey(privateKeyPem, vaultPassphrase, keyPassphrase || undefined);
          keyRef = {
            ...keyRef,
            fingerprintSha256: await fingerprintPemSha256(privateKeyPem),
          };
        } else {
          keyRef = putSessionPrivateKey(privateKeyPem, keyPassphrase || undefined);
          keyRef = {
            ...keyRef,
            fingerprintSha256: await fingerprintPemSha256(privateKeyPem),
          };
        }
        material = { pem: privateKeyPem.trim(), passphrase: keyPassphrase || undefined };
      }

      if (!material?.pem) {
        throw new Error(t('terminal.missingKey'));
      }

      const nextProfile: HostProfile = {
        ...profile,
        sshHost: sshHost.trim(),
        sshPort: Number(sshPort) || 22,
        sshUser: sshUser.trim(),
        sshPrivateKeyRef: keyRef,
        hostKeyFingerprint: hostKeyFingerprint.trim() || undefined,
      };
      upsertHost(nextProfile);
      onProfileChange(nextProfile);

      const ws = new WebSocket(
        agentWsUrl(profile.agentUrl || window.location.origin, agentToken, '/api/v1/ssh/session'),
      );
      socketRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(t('terminal.timeout'))), 15_000);
        ws.onopen = () => {
          window.clearTimeout(timer);
          resolve();
        };
        ws.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error(t('terminal.wsError')));
        };
      });

      wireSocketHandlers(ws, term);
      ws.send(JSON.stringify({
        type: 'connect',
        host: nextProfile.sshHost,
        port: nextProfile.sshPort,
        user: nextProfile.sshUser,
        privateKey: material.pem,
        passphrase: material.passphrase || null,
        hostKeyFingerprint: nextProfile.hostKeyFingerprint || null,
        cols: term.cols,
        rows: term.rows,
      }));
    } catch (reason) {
      setStatus('error');
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      term.writeln(`\r\n${message}`);
    }
  };

  // Local host: open project-directory shell automatically (no SSH form).
  useEffect(() => {
    if (!isLocal || !agentToken) return;
    let cancelled = false;
    let attempts = 0;
    const tryConnect = () => {
      if (cancelled) return;
      if (!termRef.current || !fitRef.current) {
        if (attempts++ < 20) {
          window.setTimeout(tryConnect, 50);
        }
        return;
      }
      void connectLocalShell();
    };
    tryConnect();
    return () => {
      cancelled = true;
      connectGenRef.current += 1;
      sockCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-connect when local profile/token changes
  }, [isLocal, agentToken, profile.id, profile.frameworkRoot]);

  if (isLocal) {
    return (
      <div className="page page-terminal">
        <header className="page-header page-header-compact">
          <div>
            <h1>{t('terminal.localPageTitle')}</h1>
            <p>{t('terminal.localOnlyHint')}</p>
          </div>
          <div className="form-actions terminal-local-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void connectLocalShell()}
              disabled={!agentToken || status === 'connecting'}
            >
              {status === 'ready' ? t('terminal.reconnect') : status === 'connecting' ? t('common.loading') : t('terminal.openLocal')}
            </button>
            <button type="button" className="quiet-button" onClick={disconnect} disabled={status !== 'ready' && status !== 'connecting'}>
              {t('terminal.disconnect')}
            </button>
            {onOpenFleet && (
              <button type="button" className="quiet-button" onClick={onOpenFleet}>
                {t('dashboard.modeFleet')}
              </button>
            )}
            {onOpenSettings && (
              <button type="button" className="quiet-button" onClick={onOpenSettings}>
                {t('hosts.addRemote')}
              </button>
            )}
          </div>
        </header>
        {error && <p className="inline-error" role="alert">{error}</p>}

        <div className="terminal-surface panel" ref={hostRef} aria-label={t('terminal.localPageTitle')} />
      </div>
    );
  }

  return (
    <div className="page page-terminal">
      <header className="page-header">
        <div>
          <h1>{t('terminal.title')}</h1>
          <p>{t('terminal.subtitle')}</p>
        </div>
        <div className="terminal-status" data-status={status}>
          {t(`terminal.status.${status}`)}
        </div>
      </header>

      <form className="terminal-form panel" onSubmit={(e) => void connect(e)}>
        <div className="compact-fields three">
          <label>{t('terminal.host')}<input value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="47.x.x.x" autoComplete="off" /></label>
          <label>{t('terminal.port')}<input value={sshPort} onChange={(e) => setSshPort(e.target.value)} inputMode="numeric" /></label>
          <label>{t('terminal.user')}<input value={sshUser} onChange={(e) => setSshUser(e.target.value)} autoComplete="username" /></label>
        </div>
        <label>{t('terminal.privateKey')}
          <textarea
            rows={5}
            value={privateKeyPem}
            onChange={(e) => setPrivateKeyPem(e.target.value)}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            spellCheck={false}
          />
          <small>{profile.sshPrivateKeyRef
            ? t('terminal.keyRefHint', { storage: profile.sshPrivateKeyRef.storage, id: profile.sshPrivateKeyRef.keyId.slice(0, 8) })
            : t('terminal.keySessionHint')}</small>
        </label>
        <div className="compact-fields">
          <label>{t('terminal.keyPassphrase')}<input type="password" value={keyPassphrase} onChange={(e) => setKeyPassphrase(e.target.value)} autoComplete="off" /></label>
          <label>{t('terminal.hostKeyFp')}<input value={hostKeyFingerprint} onChange={(e) => setHostKeyFingerprint(e.target.value)} placeholder="optional SHA256:…" autoComplete="off" /></label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={persistVault} onChange={(e) => setPersistVault(e.target.checked)} />
          <span>{t('terminal.persistVault')}</span>
        </label>
        {persistVault && (
          <label>{t('terminal.vaultPassphrase')}
            <input type="password" value={vaultPassphrase} onChange={(e) => setVaultPassphrase(e.target.value)} autoComplete="new-password" />
            <small>{t('terminal.vaultWarn')}</small>
          </label>
        )}
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={!canConnect || status === 'connecting'}>
            {status === 'connecting' ? t('common.loading') : t('terminal.connect')}
          </button>
          <button type="button" className="quiet-button" onClick={disconnect} disabled={status !== 'ready' && status !== 'connecting'}>
            {t('terminal.disconnect')}
          </button>
        </div>
      </form>

      <div className="terminal-surface panel" ref={hostRef} aria-label={t('terminal.title')} />
    </div>
  );
}
