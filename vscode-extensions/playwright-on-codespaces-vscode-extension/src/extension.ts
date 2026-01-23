// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  PlaywrightTunnel,
  type TunnelStatus,
  type IHandshake,
  EXTENSION_INSTALLED_FILENAME,
  LaunchOptionsValidator,
  type ILaunchOptionsAllowlist,
  type ILaunchOptionsValidationResult,
  getNormalizedErrorString
} from '@rushstack/playwright-browser-tunnel';
import { Terminal, type ITerminal, type ITerminalProvider } from '@rushstack/terminal';

import { runWorkspaceCommandAsync } from '@rushstack/vscode-shared/lib/runWorkspaceCommandAsync';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import packageJson from '../package.json';

const EXTENSION_DISPLAY_NAME: string = 'Playwright on Codespaces';
const COMMAND_SHOW_LOG: string = 'playwright-tunnel.showLog';
const COMMAND_SHOW_SETTINGS: string = 'playwright-tunnel.showSettings';
const COMMAND_START_TUNNEL: string = 'playwright-tunnel.start';
const COMMAND_STOP_TUNNEL: string = 'playwright-tunnel.stop';
const COMMAND_SHOW_MENU: string = 'playwright-tunnel.showMenu';
const COMMAND_MANAGE_ALLOWLIST: string = 'playwright-tunnel.manageAllowlist';
const VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS: string = 'workbench.action.openSettings';
const EXTENSION_ID: string = `${packageJson.publisher}.${packageJson.name}`;
const VSCODE_SETTINGS_EXTENSION_FILTER: string = `@ext:${EXTENSION_ID}`;

async function writeExtensionInstalledFileAsync(terminal: ITerminal): Promise<void> {
  try {
    // If on a remote environment, write a file to os.tempdir() using workspace fs
    let tempDir: string;
    let fileUri: vscode.Uri;

    if (vscode.env.remoteName) {
      tempDir = await runWorkspaceCommandAsync({
        terminalOptions: { name: 'playwright-on-codespaces', hideFromUser: true },
        commandLine: `node -p "require('node:os').tmpdir()"`,
        terminal
      });

      // For remote environments, use the vscode-remote scheme
      // The workspace folder should have the correct scheme already
      const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        // Use the same scheme as the workspace folder (e.g., 'vscode-remote')
        fileUri = vscode.Uri.from({
          scheme: workspaceFolder.uri.scheme,
          authority: workspaceFolder.uri.authority,
          path: `${tempDir}/${EXTENSION_INSTALLED_FILENAME}`
        });
      } else {
        // Fallback if no workspace folder
        fileUri = vscode.Uri.parse(
          `vscode-remote://${vscode.env.remoteName}${path.posix.join(tempDir, EXTENSION_INSTALLED_FILENAME)}`
        );
      }

      terminal.writeLine(`Using temp directory: ${tempDir}`);
      terminal.writeLine(`Writing to URI: ${fileUri.toString()}`);

      // TODO: Can we have this be a JSON file which the test fixture writes OS-designated port number to
      // so that the browser-tunnel can pick it up here? For now this file just serves as a marker
      // that the extension is installed on codespaces so that the test fixture verifies.
      await vscode.workspace.fs.writeFile(
        fileUri,
        Buffer.from('This is a test file created by the Playwright on Codespaces extension.\n', 'utf8')
      );
      terminal.writeLine(`Test file written to temp directory.`);
    }
  } catch (error) {
    terminal.writeError(`Error writing extension installed file: ${error}`);
    return;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Setup Logging Terminal
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME);
  outputChannel.appendLine(`${EXTENSION_DISPLAY_NAME} Extension output channel initialized.`);

  // Create terminal adapter for PlaywrightTunnel
  const terminalProvider: ITerminalProvider = new VScodeOutputChannelTerminalProvider(outputChannel, {
    debugEnabled: true,
    verboseEnabled: true
  });

  const terminal: ITerminal = new Terminal(terminalProvider);

  await writeExtensionInstalledFileAsync(terminal);

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

  async function handleManageAllowlist(): Promise<void> {
    try {
      const allowlist: ILaunchOptionsAllowlist = await LaunchOptionsValidator.readAllowlistAsync();
      const allowlistPath: string = LaunchOptionsValidator.getAllowlistFilePath();

      interface IAllowlistQuickPickItem extends vscode.QuickPickItem {
        action: 'add' | 'remove' | 'clear' | 'view';
      }

      const items: IAllowlistQuickPickItem[] = [
        {
          label: '$(add) Add Option to Allowlist',
          description: 'Allow a specific launch option',
          action: 'add'
        },
        {
          label: '$(remove) Remove Option from Allowlist',
          description: 'Revoke permission for a launch option',
          action: 'remove'
        },
        {
          label: '$(clear-all) Clear All Allowlist',
          description: 'Remove all allowed options',
          action: 'clear'
        },
        {
          label: '$(eye) View Current Allowlist',
          description: `Currently ${allowlist.allowedOptions.length} option(s) allowed`,
          action: 'view'
        }
      ];

      const selected: IAllowlistQuickPickItem | undefined = await vscode.window.showQuickPick(items, {
        placeHolder: 'Manage Launch Options Allowlist'
      });

      if (!selected) {
        return;
      }

      switch (selected.action) {
        case 'add': {
          const optionToAdd: string | undefined = await vscode.window.showInputBox({
            placeHolder: 'e.g., args, executablePath, channel',
            prompt:
              'Enter the name of a Playwright launch option to allow. ' +
              'All options are denied by default for security.',
            ignoreFocusOut: true
          });

          if (optionToAdd && optionToAdd.trim()) {
            const trimmedOption: string = optionToAdd.trim();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await LaunchOptionsValidator.addToAllowlistAsync(trimmedOption as any);
            outputChannel.appendLine(`Added '${trimmedOption}' to allowlist.`);
            void vscode.window.showInformationMessage(
              `'${trimmedOption}' has been added to the allowlist at:\n${allowlistPath}`
            );
          }
          break;
        }

        case 'remove': {
          if (allowlist.allowedOptions.length === 0) {
            void vscode.window.showInformationMessage('Allowlist is empty. Nothing to remove.');
            return;
          }

          const optionToRemove: string | undefined = await vscode.window.showQuickPick(
            allowlist.allowedOptions,
            {
              placeHolder: 'Select a launch option to remove from allowlist',
              ignoreFocusOut: true
            }
          );

          if (optionToRemove) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await LaunchOptionsValidator.removeFromAllowlistAsync(optionToRemove as any);
            outputChannel.appendLine(`Removed '${optionToRemove}' from allowlist.`);
            void vscode.window.showInformationMessage(
              `'${optionToRemove}' has been removed from the allowlist.`
            );
          }
          break;
        }

        case 'clear': {
          const confirmation: string | undefined = await vscode.window.showInformationMessage(
            'Are you sure you want to clear all allowed launch options?',
            { modal: true },
            'Yes, Clear All',
            'Cancel'
          );

          if (confirmation === 'Yes, Clear All') {
            await LaunchOptionsValidator.clearAllowlistAsync();
            outputChannel.appendLine('Cleared all options from allowlist.');
            void vscode.window.showInformationMessage('Allowlist has been cleared.');
          }
          break;
        }

        case 'view': {
          // just open the allowlist file in an editor (separate editor preferred because this will always be a local file)
          await vscode.window.showTextDocument(vscode.Uri.file(allowlistPath));
          break;
        }
      }
    } catch (error) {
      const errorMessage: string = getNormalizedErrorString(error);
      outputChannel.appendLine(`Failed to manage allowlist: ${errorMessage}`);
      void vscode.window.showErrorMessage(`Failed to manage allowlist: ${errorMessage}`);
    }
  }

  async function handleStartTunnelAsync(isAutoStart: boolean = false): Promise<void> {
    // Store current tunnel reference to avoid race conditions
    const existingTunnel: PlaywrightTunnel | undefined = tunnel;
    if (existingTunnel && currentStatus !== 'stopped' && currentStatus !== 'error') {
      outputChannel.appendLine('Tunnel is already running or starting.');
      void vscode.window.showInformationMessage('Playwright tunnel is already running.');
      return;
    }

    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('playwright-tunnel');
    const shouldAutoStart: boolean = config.get<boolean>('autoStart', false);
    const tunnelPort: number = config.get<number>('tunnelPort', 3000);

    // If this is a manual start and autoStart is not enabled, prompt the user
    if (!isAutoStart && !shouldAutoStart) {
      const response: string | undefined = await vscode.window.showInformationMessage(
        'Would you like to automatically start the Playwright tunnel when this extension activates?',
        'Always Auto-Start',
        'Just This Once',
        'Cancel'
      );

      if (response === 'Cancel') {
        outputChannel.appendLine('Tunnel start cancelled by user.');
        return;
      }

      if (response === 'Always Auto-Start') {
        await config.update('autoStart', true, vscode.ConfigurationTarget.Global);
        outputChannel.appendLine('Auto-start preference saved: enabled.');
        void vscode.window.showInformationMessage(
          'Playwright tunnel will now start automatically. You can change this in settings.'
        );
      }
    }

    // If this is an auto-start but the setting is disabled, don't start
    if (isAutoStart && !shouldAutoStart) {
      outputChannel.appendLine('Auto-start is disabled. Tunnel not started.');
      return;
    }

    try {
      const tmpPath: string = getTmpPath();

      outputChannel.appendLine(`Starting Playwright tunnel on port ${tunnelPort}`);
      outputChannel.appendLine(`Using temp path: ${tmpPath}`);

      const newTunnel: PlaywrightTunnel = new PlaywrightTunnel({
        mode: 'poll-connection',
        wsEndpoint: `ws://127.0.0.1:${tunnelPort}`,
        terminal,
        playwrightInstallPath: tmpPath,
        onStatusChange: (status: TunnelStatus) => {
          outputChannel.appendLine(`Tunnel status changed: ${status}`);
          updateStatusBar(status);
        },
        onBeforeLaunch: async (handshake: IHandshake) => {
          // Validate launch options against the allowlist
          const validationResult: ILaunchOptionsValidationResult =
            await LaunchOptionsValidator.validateLaunchOptionsAsync(handshake.launchOptions);

          // Filter out 'headless' from denied options since we handle it separately
          const deniedKeys: string[] = validationResult.deniedOptions.filter((key) => key !== 'headless');

          // If there are denied options, always prompt to give user the chance to add to allowlist
          if (deniedKeys.length > 0) {
            let message: string = `Playwright is requesting to launch ${handshake.browserName}.\n\n`;

            // Create a copy without the headless property for display
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { headless, ...displayOptions } = handshake.launchOptions;
            if (Object.keys(displayOptions).length > 0) {
              message += `Launch options: ${JSON.stringify(displayOptions, null, 2)}\n\n`;
            }

            message += `The following options are not in your allowlist and will be filtered:\n`;
            message += deniedKeys.map((key) => `  - ${key}`).join('\n');
            message += '\n\nWould you like to add these options to your allowlist?';

            const response: string | undefined = await vscode.window.showWarningMessage(
              message,
              { modal: true },
              'Add to Allowlist',
              'Continue Without',
              'Configure Allowlist'
            );

            switch (response) {
              case 'Add to Allowlist': {
                // Add all denied options to the allowlist
                for (const option of deniedKeys) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await LaunchOptionsValidator.addToAllowlistAsync(option as any);
                  outputChannel.appendLine(`Added '${option}' to allowlist.`);
                }
                void vscode.window.showInformationMessage(
                  `Added ${deniedKeys.length} option(s) to allowlist: ${deniedKeys.join(', ')}`
                );
                outputChannel.appendLine('User added denied options to allowlist. Browser launch approved.');
                return true;
              }
              case 'Continue Without': {
                outputChannel.appendLine(
                  `User approved browser launch. Denied options will be filtered: ${deniedKeys.join(', ')}`
                );
                return true;
              }
              case 'Configure Allowlist': {
                outputChannel.appendLine('User chose to configure allowlist and cancel browser launch.');
                await handleManageAllowlist();
                return false;
              }
              // "Cancel" or closed dialog
              default: {
                outputChannel.appendLine('User canceled browser launch.');
                return false;
              }
            }
          }

          return true;
        }
      });

      // Start the tunnel (don't await - it runs continuously)
      void newTunnel.startAsync().catch((error: Error) => {
        outputChannel.appendLine(`Tunnel error: ${getNormalizedErrorString(error)}`);
        updateStatusBar('error');
        void vscode.window.showErrorMessage(`Playwright tunnel error: ${getNormalizedErrorString(error)}`);
      });

      // Assign to the module-level variable after starting
      // Disabling this since we are capturing the initial state and not reading
      // from `tunnel` after any await.
      // eslint-disable-next-line require-atomic-updates
      tunnel = newTunnel;

      outputChannel.appendLine('Tunnel start initiated.');
    } catch (error) {
      const errorMessage: string = getNormalizedErrorString(error);
      outputChannel.appendLine(`Failed to start tunnel: ${errorMessage}`);
      updateStatusBar('error');
      void vscode.window.showErrorMessage(`Failed to start Playwright tunnel: ${errorMessage}`);
    }
  }

  async function handleStopTunnelAsync(): Promise<void> {
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
      const errorMessage: string = getNormalizedErrorString(error);
      outputChannel.appendLine(`Failed to stop tunnel: ${errorMessage}`);
      void vscode.window.showErrorMessage(`Failed to stop Playwright tunnel: ${errorMessage}`);
    }
  }

  async function handleShowMenu(): Promise<void> {
    interface IQuickPickItem extends vscode.QuickPickItem {
      action: 'start' | 'stop' | 'showLog' | 'manageAllowlist';
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
        label: '$(shield) Manage Allowlist',
        description: 'Configure allowed launch options',
        action: 'manageAllowlist'
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
          await handleStartTunnelAsync();
          break;
        case 'stop':
          await handleStopTunnelAsync();
          break;
        case 'manageAllowlist':
          await handleManageAllowlist();
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
    vscode.commands.registerCommand(COMMAND_START_TUNNEL, handleStartTunnelAsync),
    vscode.commands.registerCommand(COMMAND_STOP_TUNNEL, handleStopTunnelAsync),
    vscode.commands.registerCommand(COMMAND_SHOW_MENU, handleShowMenu),
    vscode.commands.registerCommand(COMMAND_MANAGE_ALLOWLIST, handleManageAllowlist),
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

  // Auto-start the tunnel on activation if configured
  const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('playwright-tunnel');
  const autoStart: boolean = config.get<boolean>('autoStart', false);
  if (autoStart) {
    void handleStartTunnelAsync(true);
  }
}

export function deactivate(): void {}
