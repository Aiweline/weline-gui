import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { describeHostDisplay, filterHostsForSwitcher } from '../api/hosts';
import type { HostProfile } from '../types';

export function HostSwitcher({
  hosts,
  activeHost,
  frameworkRoot,
  onSwitch,
}: {
  hosts: HostProfile[];
  activeHost: HostProfile;
  frameworkRoot?: string | null;
  onSwitch: (id: string) => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const labels = {
    local: t('hosts.placeLocal'),
    remote: t('hosts.placeRemote'),
    unknownProject: t('hosts.unknownProject'),
  };
  const active = describeHostDisplay(activeHost, labels, frameworkRoot);

  const options = useMemo(
    () => hosts.map((host) => ({
      host,
      display: describeHostDisplay(
        host,
        labels,
        host.id === activeHost.id ? (frameworkRoot || host.frameworkRoot) : host.frameworkRoot,
      ),
    })),
    [hosts, labels.local, labels.remote, labels.unknownProject, activeHost.id, frameworkRoot],
  );

  const filtered = useMemo(
    () => filterHostsForSwitcher(options, query),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pick = (id: string) => {
    onSwitch(id);
    setOpen(false);
    setQuery('');
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
      setQuery('');
    }
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (filtered.length === 0) return;
      event.preventDefault();
      const row = filtered[highlight];
      if (row) pick(row.host.id);
    }
  };

  return (
    <div
      className={`host-switcher${open ? ' is-open' : ''}`}
      data-kind={active.place}
      ref={rootRef}
    >
      <button
        type="button"
        className="host-switcher-trigger"
        aria-label={t('hosts.active')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={`${active.secondary} · ${active.primary}`}
        onClick={() => {
          setOpen((value) => !value);
          setQuery('');
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="host-switcher-chip">
          <span className="host-switcher-icon" aria-hidden="true">{active.place === 'local' ? '⌂' : '⌁'}</span>
          <span className="host-switcher-copy">
            <strong className="host-switcher-project">{active.primary}</strong>
            <small className="host-switcher-place">{active.secondary}</small>
          </span>
          <span className="host-switcher-chevron" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="host-switcher-menu" role="presentation">
          <input
            ref={searchRef}
            type="search"
            className="host-switcher-search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              filtered[highlight] ? `${listId}-${filtered[highlight].host.id}` : undefined
            }
            value={query}
            placeholder={t('hosts.search')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <ul className="host-switcher-list" id={listId} role="listbox" aria-label={t('hosts.active')}>
            {filtered.length === 0 ? (
              <li className="host-switcher-empty" role="presentation">{t('hosts.noMatch')}</li>
            ) : filtered.map((row, index) => {
              const selected = row.host.id === activeHost.id;
              const activeRow = index === highlight;
              return (
                <li
                  key={row.host.id}
                  id={`${listId}-${row.host.id}`}
                  role="option"
                  aria-selected={selected}
                  className={`host-switcher-option${activeRow ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(row.host.id);
                  }}
                >
                  <span className="host-switcher-option-icon" aria-hidden="true">
                    {row.display.place === 'local' ? '⌂' : '⌁'}
                  </span>
                  <span className="host-switcher-option-copy">
                    <strong>{row.display.primary}</strong>
                    <small>{row.display.secondary}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
