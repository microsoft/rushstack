// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/tls-sync-vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import { getCertificateManager } from '@rushstack/tls-sync-vscode-shared/lib/certificates';
import {
  UI_COMMAND_PING,
  UI_COMMAND_ENSURE_CERTIFICATE,
  WORKSPACE_COMMAND_SHOW_LOG,
  WORKSPACE_COMMAND_SHOW_SETTINGS,
  WORKSPACE_COMMAND_SHOW_WALKTHROUGH,
  WORKSPACE_COMMAND_SYNC,
  WORKSPACE_EXTENSION_DISPLAY_NAME,
  WORKSPACE_EXTENSION_ID,
  UI_EXTENSION_DISPLAY_NAME
} from '@rushstack/tls-sync-vscode-shared/lib/constants';
import { getConfig } from '@rushstack/tls-sync-vscode-shared/lib/config';
import { Async } from '@rushstack/node-core-library/lib/Async';
import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { Terminal } from '@rushstack/terminal';
import { version } from '../package.json';

/*
 * This extension provides commands to sync debug TLS certificates with the UI extension. This allows for VS Code
 * remotes to use the same certificates as the local machine.
 */

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(
    WORKSPACE_EXTENSION_DISPLAY_NAME
  );
  const terminalProvider: VScodeOutputChannelTerminalProvider = new VScodeOutputChannelTerminalProvider(
    outputChannel,
    {
      verboseEnabled: true,
      debugEnabled: true
    }
  );
  const terminal: Terminal = new Terminal(terminalProvider);
  terminal.writeLine(`${WORKSPACE_EXTENSION_DISPLAY_NAME} output channel initialized.`);

  async function waitForUIExtension(): Promise<void> {
    terminal.writeLine(`Waiting for UI extension (${UI_EXTENSION_DISPLAY_NAME}) to become active...`);

    const maxRetries: number = 30;
    try {
      await Async.runWithRetriesAsync({
        action: async (attempt: number) => {
          terminal.writeLine(`Pinging UI extension... Attempt ${attempt + 1}/${maxRetries}`);
          const { version: uiVersion } = await vscode.commands.executeCommand<{ version: string }>(
            UI_COMMAND_PING
          );
          if (!uiVersion) {
            terminal.writeLine('UI extension is not yet active. Retrying...');
            return;
          }
          terminal.writeLine(`UI extension is active. Version: ${uiVersion}`);
          if (version !== uiVersion) {
            terminal.writeLine(
              `Warning: UI extension version mismatch. Expected ${version}, got ${uiVersion}.`
            );
            void vscode.window.showWarningMessage(
              `UI extension version mismatch. Expected ${version}, got ${uiVersion}. Please check that both ${WORKSPACE_EXTENSION_DISPLAY_NAME} and ${UI_EXTENSION_DISPLAY_NAME} are up to date.`
            );
            throw new Error('Version mismatch');
          }
        },
        maxRetries,
        retryDelayMs: 1000
      });
    } catch (error) {
      terminal.writeLine('UI extension did not respond within the expected time frame.');
      throw new Error('UI extension did not respond within the expected time frame.');
    }
  }

  async function handleShowSettings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${WORKSPACE_EXTENSION_ID}`);
  }

  async function handleShowLogs(): Promise<void> {
    outputChannel.show();
  }

  async function handleOpenWalkthrough(): Promise<void> {
    await vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${WORKSPACE_EXTENSION_ID}#sync-certificates`,
      false
    );
  }

  async function handleSyncCertificates(): Promise<void> {
    if (!vscode.env.remoteName) {
      terminal.writeLine(
        'This command is only available in remote workspaces. Please open this workspace in a remote environment.'
      );
      void vscode.window.showErrorMessage(
        'This command is only available in remote workspaces. Please open this workspace in a remote environment.'
      );
      return;
    }
    void vscode.window.showInformationMessage(`Synchronizing TLS certificates.`);
    terminal.writeLine('Starting certificate synchronization...');
    try {
      try {
        await waitForUIExtension();
      } catch (err) {
        return;
      }

      const certificatesFromUI: ICertificate | undefined = await Async.runWithTimeoutAsync({
        action: () =>
          vscode.commands.executeCommand<ICertificate>(
            UI_COMMAND_ENSURE_CERTIFICATE
          ) as Promise<ICertificate>,
        timeoutMs: 60000,
        timeoutMessage: 'UI certificate retrieval timed out after 60 seconds'
      });

      if (!certificatesFromUI) {
        void vscode.window.showErrorMessage(
          'No certificates found in the UI extension. Please ensure the UI extension is installed and configured.'
        );
        terminal.writeLine('No certificates found in the UI extension. Synchronization aborted.');
        return;
      }

      const certificateManager: CertificateManager = getCertificateManager(terminal, 'workspace');
      const skipCertificateTrust: boolean = false;
      const canGenerateNewCertificate: boolean = false;

      const workspaceCertificates: ICertificate | undefined = await Async.runWithTimeoutAsync({
        action: () =>
          certificateManager
            .ensureCertificateAsync(canGenerateNewCertificate, terminal, {
              skipCertificateTrust
            })
            .catch(() => {
              terminal.writeLine('Failed to retrieve local certificates.');
              return undefined;
            }),
        timeoutMs: 5000,
        timeoutMessage: 'Certificate request timed out after 5 seconds'
      });

      let isSynchronized: boolean = false;
      isSynchronized =
        workspaceCertificates?.pemCaCertificate === certificatesFromUI.pemCaCertificate &&
        workspaceCertificates?.pemCertificate === certificatesFromUI.pemCertificate &&
        workspaceCertificates?.pemKey === certificatesFromUI.pemKey;
      if (isSynchronized) {
        void vscode.window.showInformationMessage(
          'Local certificates are already synchronized with UI certificates.'
        );
        return;
      }

      const { certificateStore } = certificateManager;

      certificateStore.caCertificateData = certificatesFromUI.pemCaCertificate;
      terminal.writeLine(`Writing CA certificate to ${certificateStore.caCertificatePath}...`);

      certificateStore.certificateData = certificatesFromUI.pemCertificate;
      terminal.writeLine(`Writing TLS server certificates to ${certificateStore.certificateData}...`);

      certificateStore.keyData = certificatesFromUI.pemKey;
      terminal.writeLine(`Writing TLS private key to ${certificateStore.keyPath}...`);

      await vscode.commands.executeCommand('setContext', 'tlssync.workspace.sync.complete', true);
      void vscode.window.showInformationMessage(`Certificates synchronized successfully.`);
      terminal.writeLine(`Certificates synchronized successfully.`);
    } catch (err) {
      const message: string = `Error synchronizing certificates: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
    }
  }

  const { autoSync } = getConfig(terminal, 'workspace');
  if (autoSync) {
    terminal.writeLine(`Auto-sync is enabled. Synchronizing certificates on activation...`);
    void vscode.commands.executeCommand(WORKSPACE_COMMAND_SYNC);
  }

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SHOW_SETTINGS, handleShowSettings),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SHOW_WALKTHROUGH, handleOpenWalkthrough),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SHOW_LOG, handleShowLogs),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SYNC, handleSyncCertificates)
  );
}

export function deactivate(): void {}
