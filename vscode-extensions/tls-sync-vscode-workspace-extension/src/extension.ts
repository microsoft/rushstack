// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';

import { CertificateStore, type ICertificate } from '@rushstack/debug-certificate-manager';
import { Terminal } from '@rushstack/terminal';

import { VScodeOutputChannelTerminalProvider } from '@rushstack/vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import { getCertificateStore } from '@rushstack/tls-sync-vscode-shared/lib/certificates';
import {
  WORKSPACE_COMMAND_PING,
  WORKSPACE_COMMAND_SHOW_LOG,
  WORKSPACE_COMMAND_SYNC,
  WORKSPACE_EXTENSION_DISPLAY_NAME
} from '@rushstack/tls-sync-vscode-shared/lib/constants';

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

  async function handleShowLog(): Promise<void> {
    outputChannel.show();
  }

  async function handleSyncCertificates(certificatesFromUI: ICertificate): Promise<boolean> {
    const certificateStore: CertificateStore = getCertificateStore(terminal, 'workspace');

    void vscode.window.showInformationMessage(`Synchronizing TLS certificates.`);
    terminal.writeLine('Starting certificate synchronization...');
    try {
      if (!certificatesFromUI) {
        void vscode.window.showErrorMessage(
          'No certificates found in the UI extension. Please ensure the UI extension is installed and configured.'
        );
        terminal.writeLine('No certificates found in the UI extension. Synchronization aborted.');
        return false;
      }

      let isSynchronized: boolean = false;
      isSynchronized =
        certificateStore.caCertificateData === certificatesFromUI.pemCaCertificate &&
        certificateStore.certificateData === certificatesFromUI.pemCertificate &&
        certificateStore.keyData === certificatesFromUI.pemKey;
      if (isSynchronized) {
        void vscode.window.showInformationMessage(
          'Local certificates are already synchronized with UI certificates.'
        );
        return true;
      }

      certificateStore.caCertificateData = certificatesFromUI.pemCaCertificate;
      terminal.writeLine(`Writing CA certificate to ${certificateStore.caCertificatePath}...`);

      certificateStore.certificateData = certificatesFromUI.pemCertificate;
      terminal.writeLine(`Writing TLS server certificates to ${certificateStore.certificateData}...`);

      certificateStore.keyData = certificatesFromUI.pemKey;
      terminal.writeLine(`Writing TLS private key to ${certificateStore.keyPath}...`);

      terminal.writeLine(`Certificates synchronized successfully.`);
      return true;
    } catch (err) {
      const message: string = `Error synchronizing certificates: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
      return false;
    }
  }

  function handlePing(): { version: string } {
    return {
      version
    };
  }

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(WORKSPACE_COMMAND_PING, handlePing),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SHOW_LOG, handleShowLog),
    vscode.commands.registerCommand(WORKSPACE_COMMAND_SYNC, handleSyncCertificates)
  );
}

export function deactivate(): void {}
