import type { DomainPoolRecord } from '../types';

/** Filter domain-pool rows by domain, root domain, or pool id substring. */
export function filterDomainPool(pool: DomainPoolRecord[], query: string): DomainPoolRecord[] {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return pool;
  return pool.filter((row) => {
    const domain = String(row.domain || '').toLowerCase();
    const root = String(row.rootDomain || '').toLowerCase();
    return domain.includes(needle) || root.includes(needle) || String(row.poolId).includes(needle);
  });
}
