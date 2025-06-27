// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/tls-sync-vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import {
  UI_COMMAND_PING,
  UI_COMMAND_GET_CERTIFICATES,
  WORKSPACE_COMMAND_SHOW_LOG,
  WORKSPACE_COMMAND_SHOW_SETTINGS,
  WORKSPACE_COMMAND_SHOW_WALKTHROUGH,
  WORKSPACE_COMMAND_SYNC,
  WORKSPACE_EXTENSION_DISPLAY_NAME,
  WORKSPACE_EXTENSION_ID,
  UI_EXTENSION_DISPLAY_NAME
} from '@rushstack/tls-sync-vscode-shared/lib/constants';
import { getConfig } from '@rushstack/tls-sync-vscode-shared/lib/config';
import { withTimeout } from '@rushstack/tls-sync-vscode-shared/lib/withTimeout';
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

  async function handleSyncCertificates(): Promise<void> {
    await vscode.window.showInformationMessage(
      `Synchronizing certificates in ${WORKSPACE_EXTENSION_DISPLAY_NAME}...`
    );
    outputChannel.appendLine('Starting certificate synchronization...');
    try {
      const { caCertificateFilename, certificateFilename, keyFilename, storePath } = getConfig(outputChannel);
      const certificateManagerParams: ICertificateManagerOptions = {
        caCertificateFilename,
        certificateFilename,
        keyFilename,
        storePath
      };
      try {
        const pong: { version: string } = await vscode.commands.executeCommand(UI_COMMAND_PING);
        outputChannel.appendLine(`${UI_EXTENSION_DISPLAY_NAME} is responding with version ${pong.version}.`);
        if (version !== pong.version) {
          outputChannel.appendLine(
            `Warning: ${UI_EXTENSION_DISPLAY_NAME} version mismatch. Expected ${version}, got ${pong.version}.`
          );
          await vscode.window.showWarningMessage(
            `${UI_EXTENSION_DISPLAY_NAME} version mismatch. Expected ${version}, got ${pong.version}. Please check that both ${WORKSPACE_EXTENSION_DISPLAY_NAME} and ${UI_EXTENSION_DISPLAY_NAME} are up to date.`
          );
        }
      } catch (err) {
        await vscode.window.showErrorMessage(
          `${UI_EXTENSION_DISPLAY_NAME} is not responding as expected. Make sure it is installed.`
        );
        outputChannel.appendLine(`UI Extension ping failed`);
        return;
      }
      const certificatesFromUI: ICertificate | undefined = await withTimeout(
        vscode.commands.executeCommand<ICertificate>(UI_COMMAND_GET_CERTIFICATES),
        60000,
        'UI certificate retrieval timed out after 60 seconds'
      );

      if (!certificatesFromUI) {
        await vscode.window.showErrorMessage(
          'No certificates found in the UI extension. Please ensure the UI extension is installed and configured.'
        );
        outputChannel.appendLine('No certificates found in the UI extension. Synchronization aborted.');
        return;
      }

      const certificateManager: CertificateManager = new CertificateManager(certificateManagerParams);
      const skipCertificateTrust: boolean = false;
      const canGenerateNewCertificate: boolean = false;

      const localCertificates: ICertificate | undefined = await withTimeout(
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
        await vscode.window.showInformationMessage(
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
      await vscode.window.showInformationMessage(`Certificates synchronized successfully.`);
      outputChannel.appendLine(`Certificates synchronized successfully.`);
    } catch (err) {
      const errorMessage: string = err instanceof Error ? err.message : 'Unknown error';
      outputChannel.appendLine(`Error synchronizing certificates: ${errorMessage}`);
      await vscode.window.showErrorMessage(`Error synchronizing certificates: ${errorMessage}`);
    }
  }

  const { autoSync } = getConfig(outputChannel);
  if (autoSync) {
    outputChannel.appendLine(`Auto-sync is enabled. Synchronizing certificates on activation...`);
    handleSyncCertificates().catch((err) => {
      outputChannel.appendLine(
        `Error during auto-sync: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      void vscode.window.showErrorMessage(
        `Error during auto-sync: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    });
  }

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(
      WORKSPACE_COMMAND_SHOW_SETTINGS,
      async function handleShowSettings(): Promise<void> {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          `@ext:${WORKSPACE_EXTENSION_ID}`
        );
      }
    ),
    vscode.commands.registerCommand(
      WORKSPACE_COMMAND_SHOW_WALKTHROUGH,
      async function openWalkthrough(): Promise<void> {
        await vscode.commands.executeCommand(
          'workbench.action.openWalkthrough',
          `${WORKSPACE_EXTENSION_ID}#sync-certificates`,
          false
        );
      }
    ),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SHOW_LOG, function handleShowLogs(): void {
      outputChannel.show();
    }),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SYNC, handleSyncCertificates)
  );
}

export function deactivate(): void {}
