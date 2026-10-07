import { useTranslation } from 'react-i18next';
import { describeHostDisplay } from '../api/hosts';
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
  const labels = {
    local: t('hosts.placeLocal'),
    remote: t('hosts.placeRemote'),
    unknownProject: t('hosts.unknownProject'),
  };
  const active = describeHostDisplay(activeHost, labels, frameworkRoot);

  return (
    <label className="host-switcher" data-kind={active.place}>
      <span className="host-switcher-chip" aria-hidden="true">
        <span className="host-switcher-icon">{active.place === 'local' ? '⌂' : '⌁'}</span>
        <span className="host-switcher-copy">
          <strong className="host-switcher-project">{active.primary}</strong>
          <small className="host-switcher-place">{active.secondary}</small>
        </span>
        <span className="host-switcher-chevron" />
      </span>
      <select
        className="host-switcher-select"
        value={activeHost.id}
        onChange={(event) => onSwitch(event.target.value)}
        aria-label={t('hosts.active')}
        title={`${active.secondary} · ${active.primary}`}
      >
        {hosts.map((host) => {
          const display = describeHostDisplay(
            host,
            labels,
            host.id === activeHost.id ? frameworkRoot : undefined,
          );
          return (
            <option key={host.id} value={host.id}>
              {display.optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}
