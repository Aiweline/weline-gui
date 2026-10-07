import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgentTransport } from '../api/transport';
import { connectionFromProfile, describeHostDisplay, projectNameFromRoot } from '../api/hosts';
import type { DashboardSnapshot, HostProfile } from '../types';

interface FleetCard {
  profile: HostProfile;
  status: 'loading' | 'online' | 'offline';
  snapshot?: DashboardSnapshot | null;
  error?: string;
}

export function FleetOverview({
  hosts,
  activeId,
  onSelect,
  embedded = false,
  activeFrameworkRoot,
}: {
  hosts: HostProfile[];
  activeId: string;
  onSelect: (id: string) => void;
  embedded?: boolean;
  activeFrameworkRoot?: string | null;
}) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<FleetCard[]>([]);
  const labels = {
    local: t('hosts.placeLocal'),
    remote: t('hosts.placeRemote'),
    unknownProject: t('hosts.unknownProject'),
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      const next = await Promise.all(hosts.map(async (profile) => {
        const card: FleetCard = { profile, status: 'loading' };
        try {
          const transport = new AgentTransport(connectionFromProfile({ ...profile, setupComplete: true }));
          const snapshot = await transport.snapshot();
          card.status = 'online';
          card.snapshot = snapshot;
        } catch (reason) {
          card.status = 'offline';
          card.error = reason instanceof Error ? reason.message : String(reason);
        }
        return card;
      }));
      if (active) setCards(next);
    };
    void run();
    const timer = window.setInterval(() => void run(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [hosts]);

  const body = (
    <section className="fleet-grid">
      {(cards.length
        ? cards
        : hosts.map((profile): FleetCard => ({ profile, status: 'loading' }))
      ).map((card) => {
        const host = card.snapshot?.host;
        const running = card.snapshot?.instances.filter((instance) => instance.isRunning).length ?? 0;
        const root = card.profile.id === activeId
          ? (activeFrameworkRoot || card.profile.frameworkRoot || card.snapshot?.frameworkRoot)
          : (card.profile.frameworkRoot || card.snapshot?.frameworkRoot);
        const display = describeHostDisplay(card.profile, labels, root);
        return (
          <article
            key={card.profile.id}
            className={`fleet-card ${card.profile.id === activeId ? 'active' : ''} ${card.status}`}
          >
            <header>
              <div className="fleet-card-titles">
                <strong>{display.project}</strong>
                <small>{display.secondary}</small>
              </div>
              <span className={`status-pill ${card.status}`}>{t(`fleet.${card.status}`)}</span>
            </header>
            <p className="fleet-meta">
              {projectNameFromRoot(card.profile.frameworkRoot || card.snapshot?.frameworkRoot) || card.profile.name}
              {' · '}
              {card.profile.agentUrl || '—'}
            </p>
            {host ? (
              <ul className="fleet-metrics">
                <li><span>{t('dashboard.cpu')}</span><strong>{host.cpuUsagePercent.toFixed(1)}%</strong></li>
                <li><span>{t('dashboard.memory')}</span><strong>{((host.memoryUsedBytes / Math.max(1, host.memoryTotalBytes)) * 100).toFixed(1)}%</strong></li>
                <li><span>{t('dashboard.onlineInstances')}</span><strong>{running}</strong></li>
              </ul>
            ) : (
              <p className="panel-hint">{card.error || t('common.loading')}</p>
            )}
            <button type="button" className="primary-button" onClick={() => onSelect(card.profile.id)}>
              {card.profile.id === activeId ? t('fleet.active') : t('fleet.switch')}
            </button>
          </article>
        );
      })}
    </section>
  );

  if (embedded) {
    return <div className="fleet-embedded">{body}</div>;
  }

  return (
    <div className="page page-fleet">
      <header className="page-header">
        <div>
          <h1>{t('fleet.title')}</h1>
          <p>{t('fleet.subtitle')}</p>
        </div>
      </header>
      {body}
    </div>
  );
}
