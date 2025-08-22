import { chromium, type FullConfig } from '@playwright/test';

import { PlaywrightTunnel } from '../src/PlaywrightBrowserTunnel';
import type { ITerminal, ITerminalProvider } from '@rushstack/terminal';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

async function globalSetup(config: FullConfig) {
  console.log('Running global setup');
  const terminalProvider: ITerminalProvider = new ConsoleTerminalProvider({
    debugEnabled: true,
    verboseEnabled: true
  });
  const globalTerminal: ITerminal = new Terminal(terminalProvider);

  const tunnel: PlaywrightTunnel = new PlaywrightTunnel({
    terminal: globalTerminal,
    mode: 'poll-connection',
    onStatusChange: (status) => globalTerminal.writeLine(`Tunnel status: ${status}`),
    tmpPath: '/tmp/playwright-browser-tunnel',
    wsEndpoint: 'ws://localhost:3000'
  });

  tunnel.startAsync({ keepRunning: false });
}

export default globalSetup;
