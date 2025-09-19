import { test as base } from '@playwright/test';
import { tunneledBrowser } from '../src/tunneledBrowserConnection';

export const test = base.extend({
  browser: [
    async ({ browserName, launchOptions, channel, headless }, use) => {
      console.log(`Starting tunnel server for browser: ${browserName}, channel: ${channel}`);

      await using tunnel = await tunneledBrowser(browserName, {
        channel,
        headless,
        ...launchOptions
      });

      await use(tunnel.browser);
    },
    { scope: 'worker' }
  ]
});
