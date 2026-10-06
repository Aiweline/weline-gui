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

  it('explains local project scanning in Chinese setup copy', () => {
    expect(localeCatalog['zh-CN'].messages.setup.scanHint).toContain('自动扫描');
    expect(localeCatalog['zh-CN'].messages.setup.customAdd).toBe('自定义新增');
    expect(localeCatalog['zh-CN'].messages.setup.scanRequiresDesktop).toContain('桌面客户端');
    expect(localeCatalog.en.messages.setup.running).toBeTruthy();
  });
});
