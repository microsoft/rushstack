// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  PlaywrightTunnel,
  type TunnelStatus
} from '@rushstack/playwright-browser-tunnel/lib/PlaywrightBrowserTunnel';
import { Terminal, type ITerminal, type ITerminalProvider } from '@rushstack/terminal';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import packageJson from '../package.json';

const EXTENSION_DISPLAY_NAME: string = 'Playwright on Codespaces';
const COMMAND_SHOW_LOG: string = 'playwright-tunnel.showLog';
const COMMAND_SHOW_SETTINGS: string = 'playwright-tunnel.showSettings';
const COMMAND_START_TUNNEL: string = 'playwright-tunnel.start';
const COMMAND_STOP_TUNNEL: string = 'playwright-tunnel.stop';
const COMMAND_SHOW_MENU: string = 'playwright-tunnel.showMenu';
const VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS: string = 'workbench.action.openSettings';
const EXTENSION_ID: string = `${packageJson.publisher}.${packageJson.name}`;
const VSCODE_SETTINGS_EXTENSION_FILTER: string = `@ext:${EXTENSION_ID}`;

export function activate(context: vscode.ExtensionContext): void {
  // Setup Logging Terminal
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME);
  outputChannel.appendLine(`${EXTENSION_DISPLAY_NAME} Extension output channel initialized.`);

  // Create terminal adapter for PlaywrightTunnel
  const terminalProvider: ITerminalProvider = new VScodeOutputChannelTerminalProvider(outputChannel, {
    debugEnabled: true,
    verboseEnabled: true
  });

  const terminal: ITerminal = new Terminal(terminalProvider);

  // Create status bar item
  const statusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = COMMAND_SHOW_MENU;
  let currentStatus: TunnelStatus = 'stopped';

  function updateStatusBar(status: TunnelStatus): void {
    currentStatus = status;
    switch (status) {
      case 'stopped':
        statusBarItem.text = '$(debug-stop) Playwright Tunnel';
        statusBarItem.tooltip = 'Playwright Tunnel: Stopped - Click for options';
        statusBarItem.backgroundColor = undefined;
        break;
      case 'waiting-for-connection':
        statusBarItem.text = '$(sync~spin) Playwright Tunnel';
        statusBarItem.tooltip = 'Playwright Tunnel: Waiting for connection...';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'setting-up-browser-server':
        statusBarItem.text = '$(loading~spin) Playwright Tunnel';
        statusBarItem.tooltip = 'Playwright Tunnel: Setting up browser server...';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'browser-server-running':
        statusBarItem.text = '$(check) Playwright Tunnel';
        statusBarItem.tooltip = 'Playwright Tunnel: Running';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        break;
      case 'error':
        statusBarItem.text = '$(error) Playwright Tunnel';
        statusBarItem.tooltip = 'Playwright Tunnel: Error - Click for options';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  // Initialize status bar
  updateStatusBar('stopped');
  statusBarItem.show();

  // Tunnel instance
  let tunnel: PlaywrightTunnel | undefined;

  function getTmpPath(): string {
    return path.join(os.tmpdir(), 'playwright-browser-tunnel');
  }

  function handleShowLog(): void {
    outputChannel.show();
  }

  async function handleShowSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS,
      VSCODE_SETTINGS_EXTENSION_FILTER
    );
  }

  async function handleStartTunnel(): Promise<void> {
    if (tunnel && currentStatus !== 'stopped' && currentStatus !== 'error') {
      outputChannel.appendLine('Tunnel is already running or starting.');
      void vscode.window.showInformationMessage('Playwright tunnel is already running.');
      return;
    }

    try {
      const tmpPath: string = getTmpPath();

      outputChannel.appendLine(`Starting Playwright tunnel`);
      outputChannel.appendLine(`Using temp path: ${tmpPath}`);

      tunnel = new PlaywrightTunnel({
        mode: 'poll-connection',
        wsEndpoint: 'ws://127.0.0.1:3000',
        terminal,
        tmpPath,
        onStatusChange: (status: TunnelStatus) => {
          outputChannel.appendLine(`Tunnel status changed: ${status}`);
          updateStatusBar(status);
        }
      });

      // Start the tunnel (don't await - it runs continuously)
      void tunnel.startAsync().catch((error: Error) => {
        outputChannel.appendLine(`Tunnel error: ${error.message}`);
        updateStatusBar('error');
        void vscode.window.showErrorMessage(`Playwright tunnel error: ${error.message}`);
      });

      outputChannel.appendLine('Tunnel start initiated.');
    } catch (error) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`Failed to start tunnel: ${errorMessage}`);
      updateStatusBar('error');
      void vscode.window.showErrorMessage(`Failed to start Playwright tunnel: ${errorMessage}`);
    }
  }

  async function handleStopTunnel(): Promise<void> {
    const currentTunnel: PlaywrightTunnel | undefined = tunnel;
    if (!currentTunnel) {
      outputChannel.appendLine('No tunnel instance to stop.');
      void vscode.window.showInformationMessage('Playwright tunnel is not running.');
      return;
    }

    // Clear the reference before awaiting to avoid race condition
    tunnel = undefined;

    try {
      outputChannel.appendLine('Stopping Playwright tunnel...');
      await currentTunnel.stopAsync();
      updateStatusBar('stopped');
      outputChannel.appendLine('Tunnel stopped.');
      void vscode.window.showInformationMessage('Playwright tunnel stopped.');
    } catch (error) {
      const errorMessage: string = error instanceof Error ? error.message : String(error);
      outputChannel.appendLine(`Failed to stop tunnel: ${errorMessage}`);
      void vscode.window.showErrorMessage(`Failed to stop Playwright tunnel: ${errorMessage}`);
    }
  }

  async function handleShowMenu(): Promise<void> {
    interface IQuickPickItem extends vscode.QuickPickItem {
      action: 'start' | 'stop' | 'showLog';
    }

    const items: IQuickPickItem[] = [
      {
        label: '$(play) Start Tunnel',
        description: 'Start the Playwright browser tunnel',
        action: 'start'
      },
      {
        label: '$(debug-stop) Stop Tunnel',
        description: 'Stop the Playwright browser tunnel',
        action: 'stop'
      },
      {
        label: '$(output) Show Logs',
        description: 'Show the Playwright tunnel output log',
        action: 'showLog'
      }
    ];

    const selected: IQuickPickItem | undefined = await vscode.window.showQuickPick(items, {
      placeHolder: `Playwright Tunnel (${currentStatus})`
    });

    if (selected) {
      switch (selected.action) {
        case 'start':
          await handleStartTunnel();
          break;
        case 'stop':
          await handleStopTunnel();
          break;
        case 'showLog':
          handleShowLog();
          break;
      }
    }
  }

  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    vscode.commands.registerCommand(COMMAND_SHOW_LOG, handleShowLog),
    vscode.commands.registerCommand(COMMAND_SHOW_SETTINGS, handleShowSettings),
    vscode.commands.registerCommand(COMMAND_START_TUNNEL, handleStartTunnel),
    vscode.commands.registerCommand(COMMAND_STOP_TUNNEL, handleStopTunnel),
    vscode.commands.registerCommand(COMMAND_SHOW_MENU, handleShowMenu),
    // Cleanup tunnel on deactivate
    {
      dispose: () => {
        const currentTunnel: PlaywrightTunnel | undefined = tunnel;
        if (currentTunnel) {
          outputChannel.appendLine('Extension deactivating, stopping tunnel...');
          void currentTunnel.stopAsync().then(() => {
            tunnel = undefined;
          });
        }
      }
    }
  );

  // Auto-start the tunnel on activation
  void handleStartTunnel();
}

export function deactivate(): void {}
