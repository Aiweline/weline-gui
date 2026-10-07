import { describe, expect, it } from 'vitest';
import {
  commandLineFor,
  filterCommandCatalog,
  preferredExpandedGroups,
} from './consoleCommands';
import type { ConsoleCommandCatalog } from './types';

const catalog: ConsoleCommandCatalog = {
  count: 3,
  commands: [
    { name: 'cache:clear', tip: 'Clear caches', module: 'Weline_Framework', group: 'cache' },
    { name: 'server:start', tip: 'Start WLS', module: 'Weline_Server', group: 'server' },
    { name: 'server:status', tip: 'Show status', module: 'Weline_Server', group: 'server' },
  ],
  groups: [
    {
      id: 'cache',
      label: 'cache',
      commands: [
        { name: 'cache:clear', tip: 'Clear caches', module: 'Weline_Framework', group: 'cache' },
      ],
    },
    {
      id: 'server',
      label: 'server',
      commands: [
        { name: 'server:start', tip: 'Start WLS', module: 'Weline_Server', group: 'server' },
        { name: 'server:status', tip: 'Show status', module: 'Weline_Server', group: 'server' },
      ],
    },
  ],
};

describe('consoleCommands', () => {
  it('builds a safe php bin/w line', () => {
    expect(commandLineFor('server:status')).toBe('php bin/w server:status');
  });

  it('filters by name tip and module', () => {
    expect(filterCommandCatalog(catalog, 'status')).toHaveLength(1);
    expect(filterCommandCatalog(catalog, 'WLS')[0]?.commands[0]?.name).toBe('server:start');
    expect(filterCommandCatalog(catalog, 'framework')[0]?.id).toBe('cache');
    expect(filterCommandCatalog(catalog, 'zzz')).toHaveLength(0);
  });

  it('expands matching groups while searching', () => {
    const filtered = filterCommandCatalog(catalog, 'status');
    const open = preferredExpandedGroups(filtered, 'status');
    expect([...open]).toEqual(['server']);
  });
});
