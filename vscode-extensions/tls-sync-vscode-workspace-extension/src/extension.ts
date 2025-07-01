// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/tls-sync-vscode-shared/lib/VScodeOutputChannelTerminalProvider';
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
import {
  CertificateManager,
  CertificateStore,
  type ICertificate,
  type ICertificateManagerOptions
} from '@rushstack/debug-certificate-manager';
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
  outputChannel.appendLine(`${WORKSPACE_EXTENSION_DISPLAY_NAME} output channel initialized.`);

  function waitForUIExtension(): Promise<void> {
    outputChannel.appendLine(`Waiting for UI extension (${UI_EXTENSION_DISPLAY_NAME}) to become active...`);
    return new Promise<void>((resolve, reject) => {
      const maxAttempts: number = 30;
      let attempts: number = 0;

      const intervalId: NodeJS.Timeout = setInterval(async () => {
        attempts++;
        outputChannel.appendLine(`Pinging UI extension... Attempt ${attempts}/${maxAttempts}`);
        const { version: uiVersion } = await vscode.commands.executeCommand<{ version: string }>(
          UI_COMMAND_PING
        );
        if (uiVersion) {
          outputChannel.appendLine(`UI extension is active. Version: ${uiVersion}`);
          if (version !== uiVersion) {
            outputChannel.appendLine(
              `Warning: UI extension version mismatch. Expected ${version}, got ${uiVersion}.`
            );
            void vscode.window.showWarningMessage(
              `UI extension version mismatch. Expected ${version}, got ${uiVersion}. Please check that both ${WORKSPACE_EXTENSION_DISPLAY_NAME} and ${UI_EXTENSION_DISPLAY_NAME} are up to date.`
            );
            reject();
          }
          clearInterval(intervalId);
          resolve();
        } else if (attempts >= maxAttempts) {
          outputChannel.appendLine('UI extension did not respond within the expected time frame.');
          clearInterval(intervalId);
          reject(new Error('UI extension did not respond within the expected time frame.'));
        } else {
          outputChannel.appendLine('UI extension is not yet active. Retrying...');
        }
      }, 1000);
    });
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
      outputChannel.appendLine(
        'This command is only available in remote workspaces. Please open this workspace in a remote environment.'
      );
      void vscode.window.showErrorMessage(
        'This command is only available in remote workspaces. Please open this workspace in a remote environment.'
      );
      return;
    }
    void vscode.window.showInformationMessage(`Synchronizing TLS certificates.`);
    outputChannel.appendLine('Starting certificate synchronization...');
    try {
      try {
        await waitForUIExtension();
      } catch (err) {
        return;
      }
      const { caCertificateFilename, certificateFilename, keyFilename, storePath } = getConfig(outputChannel);
      const certificateManagerParams: ICertificateManagerOptions = {
        caCertificateFilename,
        certificateFilename,
        keyFilename,
        storePath
      };

      const certificatesFromUI: ICertificate | undefined = await Async.runWithTimeoutAsync(
        vscode.commands.executeCommand<ICertificate>(UI_COMMAND_ENSURE_CERTIFICATE) as Promise<ICertificate>,
        60000,
        'UI certificate retrieval timed out after 60 seconds'
      );

      if (!certificatesFromUI) {
        void vscode.window.showErrorMessage(
          'No certificates found in the UI extension. Please ensure the UI extension is installed and configured.'
        );
        outputChannel.appendLine('No certificates found in the UI extension. Synchronization aborted.');
        return;
      }

      const certificateManager: CertificateManager = new CertificateManager(certificateManagerParams);
      const skipCertificateTrust: boolean = false;
      const canGenerateNewCertificate: boolean = false;

      const localCertificates: ICertificate | undefined = await Async.runWithTimeoutAsync(
        certificateManager
          .ensureCertificateAsync(canGenerateNewCertificate, terminal, {
            skipCertificateTrust
          })
          .catch(() => undefined),
        5000,
        'Certificate request timed out after 5 seconds'
      );

      let isSynchronized: boolean = false;
      isSynchronized =
        localCertificates?.pemCaCertificate === certificatesFromUI.pemCaCertificate &&
        localCertificates?.pemCertificate === certificatesFromUI.pemCertificate &&
        localCertificates?.pemKey === certificatesFromUI.pemKey;
      if (isSynchronized) {
        void vscode.window.showInformationMessage(
          'Local certificates are already synchronized with UI certificates.'
        );
        return;
      }

      const certificateStore: CertificateStore = new CertificateStore(certificateManagerParams);

      certificateStore.caCertificateData = certificatesFromUI.pemCaCertificate;
      outputChannel.appendLine(`Writing certificates to ${certificateStore.certificatePath}...`);

      certificateStore.certificateData = certificatesFromUI.pemCertificate;
      outputChannel.appendLine(`Writing certificates to ${certificateStore.caCertificatePath}...`);

      certificateStore.keyData = certificatesFromUI.pemKey;
      outputChannel.appendLine(`Writing certificates to ${certificateStore.keyPath}...`);

      await vscode.commands.executeCommand('setContext', 'tlssync.workspace.sync.complete', true);
      void vscode.window.showInformationMessage(`Certificates synchronized successfully.`);
      outputChannel.appendLine(`Certificates synchronized successfully.`);
    } catch (err) {
      const errorMessage: string = err instanceof Error ? err.message : 'Unknown error';
      outputChannel.appendLine(`Error synchronizing certificates: ${errorMessage}`);
      void vscode.window.showErrorMessage(`Error synchronizing certificates: ${errorMessage}`);
    }
  }

  const { autoSync } = getConfig(outputChannel);
  if (autoSync) {
    outputChannel.appendLine(`Auto-sync is enabled. Synchronizing certificates on activation...`);
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
