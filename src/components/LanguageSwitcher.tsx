import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatLanguageOptionLabel,
  localeCatalog,
  localeDisplayOrder,
  normalizeLocale,
} from '../i18n/catalog';

function filterLanguageOptions<T extends {
  locale: string;
  uiName: string;
  nativeLabel: string;
  label: string;
}>(options: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((row) => {
    const haystack = [row.locale, row.uiName, row.nativeLabel, row.label]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function LanguageSwitcher({
  value,
  onChange,
  variant = 'chip',
}: {
  value: string;
  onChange: (locale: string) => void | Promise<void>;
  /** chip = topbar compact; field = settings form width */
  variant?: 'chip' | 'field';
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const current = normalizeLocale(value);

  const options = useMemo(
    () => localeDisplayOrder.map((locale) => {
      const definition = localeCatalog[locale];
      const uiName = t(`languages.${locale}`);
      return {
        locale,
        uiName,
        nativeLabel: definition.nativeLabel,
        label: formatLanguageOptionLabel(uiName, definition.nativeLabel),
      };
    }),
    [t],
  );

  const filtered = useMemo(
    () => filterLanguageOptions(options, query),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    const selected = Math.max(0, filtered.findIndex((row) => row.locale === current));
    setHighlight(selected >= 0 ? selected : 0);
  }, [query, open, filtered, current]);

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

  const pick = (locale: string) => {
    void onChange(locale);
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
      if (row) pick(row.locale);
    }
  };

  const currentLabel = formatLanguageOptionLabel(
    t(`languages.${current}`),
    localeCatalog[current]?.nativeLabel || current,
  );

  return (
    <div
      className={`language-switcher language-switcher--${variant}${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="language-switcher-trigger"
        aria-label={t('settings.language')}
        title={t('settings.language')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
          setQuery('');
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="language-switcher-icon" aria-hidden="true">文A</span>
        <span className="language-switcher-value">{currentLabel}</span>
        <span className="language-switcher-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="language-switcher-menu" role="presentation">
          <input
            ref={searchRef}
            type="search"
            className="language-switcher-search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              filtered[highlight] ? `${listId}-${filtered[highlight].locale}` : undefined
            }
            value={query}
            placeholder={t('settings.languageSearch')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <ul className="language-switcher-list" id={listId} role="listbox" aria-label={t('settings.language')}>
            {filtered.length === 0 ? (
              <li className="language-switcher-empty" role="presentation">
                {t('settings.languageNoMatch')}
              </li>
            ) : filtered.map((row, index) => {
              const selected = row.locale === current;
              const activeRow = index === highlight;
              return (
                <li
                  key={row.locale}
                  id={`${listId}-${row.locale}`}
                  role="option"
                  aria-selected={selected}
                  className={`language-switcher-option${activeRow ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(row.locale);
                  }}
                >
                  <strong>{row.uiName}</strong>
                  {row.uiName.trim() !== row.nativeLabel.trim() && (
                    <small>({row.nativeLabel})</small>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
