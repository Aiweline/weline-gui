import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCAL_AGENT_URL,
  backendDomainPoolUrl,
  isFrontendOnlyOrigin,
  normalizeDiscoveredProjects,
} from './projects';

describe('normalizeDiscoveredProjects', () => {
  it('accepts a camelCase project array', () => {
    const projects = normalizeDiscoveredProjects([
      {
        name: '框架',
        frameworkRoot: '/Users/weline/Project/Official/框架',
        phpBinary: 'php',
        siteUrls: ['https://example.test'],
        running: true,
        source: 'running',
      },
    ]);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.frameworkRoot).toContain('框架');
    expect(projects[0]?.running).toBe(true);
  });

  it('rejects SPA HTML fallback that previously became “691 projects”', () => {
    const html = '<!doctype html>\n<html lang="zh-CN"><head></head><body></body></html>';
    expect(html.length).toBeGreaterThan(20);
    expect(() => normalizeDiscoveredProjects(html)).toThrow('LOCAL_SCAN_SPA_FALLBACK');
  });

  it('unwraps { projects: [...] } payloads', () => {
    const projects = normalizeDiscoveredProjects({
      projects: [{ frameworkRoot: '/tmp/demo', name: 'demo', siteUrls: [], running: false, source: 'nearby' }],
    });
    expect(projects[0]?.name).toBe('demo');
  });
});

describe('isFrontendOnlyOrigin', () => {
  it('detects Vite origin so local scan never hits the SPA host', () => {
    expect(isFrontendOnlyOrigin('http://127.0.0.1:1420', 'http://127.0.0.1:1420')).toBe(true);
    expect(isFrontendOnlyOrigin(DEFAULT_LOCAL_AGENT_URL, 'http://127.0.0.1:1420')).toBe(false);
  });
});

describe('backendDomainPoolUrl', () => {
  it('strips WLS panel path before joining websites domain admin', () => {
    expect(
      backendDomainPoolUrl(
        'https://p05113ef3.test.weline.com/jRaxfEJaRUyO6ZBOA3wJX8bituje6oqH/server/backend/wls-panel',
      ),
    ).toBe(
      'https://p05113ef3.test.weline.com/jRaxfEJaRUyO6ZBOA3wJX8bituje6oqH/websites/admin/domain/index',
    );
  });

  it('keeps an already-admin base without inventing a second panel segment', () => {
    expect(
      backendDomainPoolUrl(
        'https://p05113ef3.test.weline.com/jRaxfEJaRUyO6ZBOA3wJX8bituje6oqH/',
      ),
    ).toBe(
      'https://p05113ef3.test.weline.com/jRaxfEJaRUyO6ZBOA3wJX8bituje6oqH/websites/admin/domain/index',
    );
  });

  it('returns empty when admin URL is missing', () => {
    expect(backendDomainPoolUrl('')).toBe('');
  });
});
