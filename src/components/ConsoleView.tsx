import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  commandLineFor,
  filterCommandCatalog,
  preferredExpandedGroups,
} from '../consoleCommands';
import type { CommandResult, ConsoleCommandCatalog, ConsoleCommandItem } from '../types';

function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">WELINE CONTROL</p>
          <h1>{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function ConsoleView({
  result,
  busy,
  frameworkRoot,
  onRun,
  onLoadCatalog,
}: {
  result: CommandResult | null;
  busy: boolean;
  frameworkRoot: string;
  onRun: (command: string) => Promise<void>;
  onLoadCatalog: () => Promise<ConsoleCommandCatalog>;
}) {
  const { t } = useTranslation();
  const [command, setCommand] = useState('php bin/w server:status --doctor --json');
  const [catalog, setCatalog] = useState<ConsoleCommandCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadCatalog = async () => {
    setCatalogBusy(true);
    try {
      const next = await onLoadCatalog();
      setCatalog(next);
      setCatalogError('');
      setExpanded(preferredExpandedGroups(next.groups, query, selected));
    } catch (reason) {
      setCatalog(null);
      setCatalogError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCatalogBusy(false);
    }
  };

  useEffect(() => {
    setCatalog(null);
    setCatalogError('');
    setQuery('');
    setSelected(null);
    void loadCatalog();
    // Reload whenever the bound project changes (host/project switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkRoot, onLoadCatalog]);

  const groups = useMemo(() => filterCommandCatalog(catalog, query), [catalog, query]);

  useEffect(() => {
    setExpanded(preferredExpandedGroups(groups, query, selected));
  }, [groups, query, selected]);

  const selectCommand = (item: ConsoleCommandItem, runNow = false) => {
    const line = commandLineFor(item.name);
    setSelected(item.name);
    setCommand(line);
    if (runNow) void onRun(line);
  };

  const toggleGroup = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onRun(command);
  };

  const visibleCount = query.trim()
    ? groups.reduce((sum, group) => sum + group.commands.length, 0)
    : catalog?.count ?? 0;

  return (
    <Page title={t('console.title')} subtitle={t('console.subtitle')}>
      <div className="console-shell">
        <div className="console-safety">
          <span>⌁</span>{t('console.safeBoundary')}
          {frameworkRoot ? <code className="console-project" title={frameworkRoot}>{frameworkRoot}</code> : null}
        </div>
        <div className="console-workspace">
          <aside className="command-browser" aria-label={t('console.treeTitle')}>
            <div className="command-browser-toolbar">
              <input
                className="command-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('console.search')}
                spellCheck={false}
                aria-label={t('console.search')}
              />
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => void loadCatalog()}
                disabled={catalogBusy}
                title={t('console.refreshTree')}
              >
                {catalogBusy ? '…' : '↻'}
              </button>
            </div>
            <div className="command-browser-meta">
              {catalog
                ? t('console.treeCount', { count: visibleCount })
                : catalogBusy
                  ? t('common.loading')
                  : t('console.treeEmpty')}
            </div>
            <div className="command-tree" role="tree">
              {catalogError ? <p className="command-tree-error">{catalogError}</p> : null}
              {!catalogError && groups.length === 0 ? (
                <p className="command-tree-empty">{t('console.treeNoMatch')}</p>
              ) : null}
              {groups.map((group) => {
                const open = expanded.has(group.id);
                return (
                  <div key={group.id} className="command-tree-group" role="treeitem" aria-expanded={open}>
                    <button type="button" className="command-tree-group-toggle" onClick={() => toggleGroup(group.id)}>
                      <span className="command-tree-chevron">{open ? '▾' : '▸'}</span>
                      <span className="command-tree-group-label">{group.label}</span>
                      <span className="command-tree-group-count">{group.commands.length}</span>
                    </button>
                    {open ? (
                      <ul className="command-tree-leaves">
                        {group.commands.map((item) => (
                          <li key={item.name}>
                            <button
                              type="button"
                              className={selected === item.name ? 'command-tree-leaf active' : 'command-tree-leaf'}
                              title={item.tip}
                              onClick={() => selectCommand(item)}
                              onDoubleClick={() => selectCommand(item, true)}
                            >
                              <code>{item.name}</code>
                              <small>{item.tip}</small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="command-browser-hint">{t('console.treeHint')}</p>
          </aside>

          <div className="console-main">
            <form className="command-form" onSubmit={submit}>
              <span className="prompt">›</span>
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder={t('console.placeholder')}
                spellCheck={false}
              />
              <button className="primary-button" disabled={busy}>
                {busy ? t('common.loading') : t('console.run')}
              </button>
            </form>
            <div className="terminal-output" aria-live="polite">
              <div className="terminal-toolbar">
                <span>{t('console.history')}</span>
                {result ? (
                  <span className={result.exitCode === 0 ? 'exit-success' : 'exit-error'}>
                    {t('console.exitCode', { code: result.exitCode })} · {result.durationMs}ms
                  </span>
                ) : null}
              </div>
              <pre>{result ? [result.stdout, result.stderr].filter(Boolean).join('\n') : t('console.empty')}</pre>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
