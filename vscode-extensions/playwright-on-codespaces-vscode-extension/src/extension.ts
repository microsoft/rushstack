import * as vscode from 'vscode';
import { PlaywrightBrowserTunnelCommandLine } from '@rushstack/playwright-browser-tunnel/lib/PlaywrightBrowserTunnelCommandLine';
import { Terminal } from '@rushstack/terminal';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/vscode-shared/lib/VScodeOutputChannelTerminalProvider';

// TODO Extract to constants.ts file
const EXTENSION_DISPLAY_NAME: string = 'Playwright on Codespaces';

let terminal: Terminal;

export function activate(context: vscode.ExtensionContext): void {
  // Check if running in remote environment
  if (vscode.env.remoteName) {
    void vscode.window.showErrorMessage(
      `Playwright on Codespaces extension is running remotely (${vscode.env.remoteName}). ` +
        'This extension must run locally to display browsers on your machine. ' +
        'Please install it as a local extension only.'
    );
    return;
  }

  // Setup Logging Terminal
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME);
  const terminalProvider: VScodeOutputChannelTerminalProvider = new VScodeOutputChannelTerminalProvider(
    outputChannel,
    {
      verboseEnabled: true,
      debugEnabled: true
    }
  );
  terminal = new Terminal(terminalProvider);
  terminal.writeLine(`${EXTENSION_DISPLAY_NAME} Extension output channel initialized.`);

  const commandLine: PlaywrightBrowserTunnelCommandLine = new PlaywrightBrowserTunnelCommandLine(terminal);

  // TODO: Register start and stop tunnel commands in addition to auto-starting here
  commandLine
    .executeAsync()
    .catch((error) => {
      terminal.writeErrorLine(`Error executing Playwright Browser Tunnel command line: ${error}`);
    })
    .finally(() => {
      terminal.writeLine('Playwright Browser Tunnel command execution completed.');
    });
}

export function deactivate(): void {}
