// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineParser } from '@rushstack/ts-command-line';
import type { ITerminal, ITerminalProvider } from '@rushstack/terminal';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

import { PlaywrightTunnel } from './PlaywrightBrowserTunnel';

export class PlaywrightBrowserTunnelCommandLine extends CommandLineParser {
  private readonly _terminalProvider: ITerminalProvider;
  private readonly _globalTerminal: ITerminal;

  public constructor(terminal?: ITerminal) {
    super({
      toolFilename: 'playwright-browser-tunnel',
      toolDescription:
        'Launch a Playwright Browser Server Tunnel. This can be used to run local browsers for VS Code Remote experiences.'
    });

    this._terminalProvider = new ConsoleTerminalProvider({
      debugEnabled: true,
      verboseEnabled: true
    });
    this._globalTerminal = terminal ?? new Terminal(this._terminalProvider);
  }

  public async executeAsync(args?: string[]): Promise<boolean> {
    const tunnel: PlaywrightTunnel = new PlaywrightTunnel({
      terminal: this._globalTerminal,
      mode: 'poll-connection',
      onStatusChange: (status) => this._globalTerminal.writeLine(`Tunnel status: ${status}`),
      tmpPath: '/tmp/playwright-browser-tunnel',
      wsEndpoint: 'ws://localhost:3000'
    });

    let isShuttingDown: boolean = false;
    let sigintCount: number = 0;

    const sigintHandler = async (): Promise<void> => {
      sigintCount++;

      if (sigintCount > 1) {
        this._globalTerminal.writeLine('\nForce exiting...');
        process.exit(1);
      }

      if (!isShuttingDown) {
        isShuttingDown = true;
        this._globalTerminal.writeLine(
          '\nGracefully shutting down tunnel (press Ctrl+C again to force exit)...'
        );

        try {
          await tunnel.stopAsync();
          process.exit(0);
        } catch (error) {
          this._globalTerminal.writeErrorLine(`Error stopping tunnel: ${error}`);
          process.exit(1);
        }
      }
    };

    process.on('SIGINT', sigintHandler);

    try {
      await tunnel.startAsync();
      return true;
    } catch (error) {
      this._globalTerminal.writeErrorLine(`Failed to start tunnel: ${error}`);
      return false;
    }
  }
}
