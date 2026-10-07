import { describe, expect, it } from 'vitest';
import { localeCatalog } from './catalog';

describe('locale catalog', () => {
  it('ships exactly ten mainstream languages', () => {
    expect(Object.keys(localeCatalog)).toHaveLength(10);
  });

  it('marks Arabic as right-to-left and every locale has core navigation', () => {
    expect(localeCatalog.ar.direction).toBe('rtl');
    for (const locale of Object.values(localeCatalog)) {
      expect(locale.messages.navigation.dashboard).toBeTruthy();
      expect(locale.messages.navigation.console).toBeTruthy();
      expect(locale.messages.navigation.settings).toBeTruthy();
    }
  });

  it('localizes the headless TLS discovery guidance in Chinese', () => {
    expect(localeCatalog['zh-CN'].messages.sites.publicUrlRequired).toContain('公网');
  });

  it('explains website load failure in Chinese instead of raw CLI jargon', () => {
    expect(localeCatalog['zh-CN'].messages.websites.loadError).toBe('网站列表未能加载');
    expect(localeCatalog.en.messages.websites.loadErrorHint).toContain('Settings');
  });

  it('points website creation at the domain pool in Chinese', () => {
    expect(localeCatalog['zh-CN'].messages.websites.poolPlaceholder).toContain('域名池');
    expect(localeCatalog['zh-CN'].messages.websites.openBackend).toContain('后台');
    expect(localeCatalog['zh-CN'].messages.websites.poolSearch).toContain('搜索');
    expect(localeCatalog.en.messages.websites.poolHint).toContain('backend');
  });

  it('explains offline agent gate without implying a fresh setup', () => {
    expect(localeCatalog.en.messages.offline.heading).toContain('agent');
    expect(localeCatalog['zh-CN'].messages.offline.body).toContain('不需要重新');
    expect(localeCatalog['zh-CN'].messages.offline.orDesktop).toContain('桌面');
  });

  it('marks the public gateway owner in Chinese instance copy', () => {
    expect(localeCatalog['zh-CN'].messages.instances.gateway).toBe('公网网关');
    expect(localeCatalog['zh-CN'].messages.instances.gatewayOwnerSelf).toBe('本机网关');
    expect(localeCatalog['zh-CN'].messages.instances.gatewayOwnerChip).toBe('网关');
  });

  it('explains local project scanning in Chinese setup copy', () => {
    expect(localeCatalog['zh-CN'].messages.setup.scanHint).toContain('自动扫描');
    expect(localeCatalog['zh-CN'].messages.setup.customAdd).toBe('自定义新增');
    expect(localeCatalog['zh-CN'].messages.setup.scanRequiresDesktop).toContain('桌面客户端');
    expect(localeCatalog.en.messages.setup.running).toBeTruthy();
  });

  it('distinguishes data refresh from full page reload', () => {
    expect(localeCatalog.en.messages.common.reloadPage).toBe('Reload page');
    expect(localeCatalog['zh-CN'].messages.common.reloadPage).toBe('刷新页面');
    expect(localeCatalog.en.messages.common.refresh).toBe('Refresh data');
    expect(localeCatalog['zh-CN'].messages.common.refresh).toBe('刷新数据');
  });
});
