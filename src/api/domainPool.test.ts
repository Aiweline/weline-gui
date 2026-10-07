import { describe, expect, it } from 'vitest';
import { filterDomainPool } from './domainPool';
import type { DomainPoolRecord } from '../types';

const pool: DomainPoolRecord[] = [
  { poolId: 10, domain: 'local-demo-8d2701.weline.test', rootDomain: 'local-demo-8d2701.weline.test' },
  { poolId: 16, domain: 'shop.example.com', rootDomain: 'example.com' },
  { poolId: 22, domain: 'daocharms.com', rootDomain: 'daocharms.com' },
];

describe('filterDomainPool', () => {
  it('returns all rows when query is empty', () => {
    expect(filterDomainPool(pool, '  ')).toHaveLength(3);
  });

  it('matches domain substring', () => {
    expect(filterDomainPool(pool, '8d2701').map((row) => row.poolId)).toEqual([10]);
  });

  it('matches root domain and pool id', () => {
    expect(filterDomainPool(pool, 'example.com').map((row) => row.poolId)).toEqual([16]);
    expect(filterDomainPool(pool, '22').map((row) => row.poolId)).toEqual([22]);
  });
});
