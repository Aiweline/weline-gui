import type { ConsoleCommandCatalog, ConsoleCommandGroup, ConsoleCommandItem } from './types';

export function commandLineFor(name: string): string {
  return `php bin/w ${name.trim()}`;
}

function matchesCommand(item: ConsoleCommandItem, needle: string): boolean {
  return (
    item.name.toLowerCase().includes(needle)
    || item.tip.toLowerCase().includes(needle)
    || item.module.toLowerCase().includes(needle)
    || item.group.toLowerCase().includes(needle)
  );
}

export function filterCommandCatalog(
  catalog: ConsoleCommandCatalog | null,
  query: string,
): ConsoleCommandGroup[] {
  if (!catalog) return [];
  const needle = query.trim().toLowerCase();
  if (!needle) return catalog.groups;

  return catalog.groups
    .map((group) => ({
      ...group,
      commands: group.commands.filter((item) => matchesCommand(item, needle)),
    }))
    .filter((group) => group.commands.length > 0);
}

export function preferredExpandedGroups(
  groups: ConsoleCommandGroup[],
  query: string,
  selected?: string | null,
): Set<string> {
  const open = new Set<string>();
  if (query.trim()) {
    for (const group of groups) open.add(group.id);
    return open;
  }
  for (const id of ['server', 'cache', 'setup', 'i18n']) {
    if (groups.some((group) => group.id === id)) open.add(id);
  }
  if (selected) {
    const group = groups.find((entry) => entry.commands.some((item) => item.name === selected));
    if (group) open.add(group.id);
  }
  if (open.size === 0 && groups[0]) open.add(groups[0].id);
  return open;
}
