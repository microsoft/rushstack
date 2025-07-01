// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/tls-sync-vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import {
  UI_COMMAND_ENSURE_CERTIFICATE,
  UI_COMMAND_SHOW_LOG,
  UI_COMMAND_PING,
  UI_COMMAND_UNTRUST_CERTIFICATE,
  UI_EXTENSION_DISPLAY_NAME
} from '@rushstack/tls-sync-vscode-shared/lib/constants';
import { getConfig } from '@rushstack/tls-sync-vscode-shared/lib/config';
import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { Terminal } from '@rushstack/terminal';
import { version } from '../package.json';
import { Async } from '@rushstack/node-core-library/lib/Async';

/*
 * This extension provides commands to manage debug TLS certificates on the local machine. This capability is
 * primarily intended to be called by the workspace extension counterpart.
 */

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(UI_EXTENSION_DISPLAY_NAME);
  const terminalProvider: VScodeOutputChannelTerminalProvider = new VScodeOutputChannelTerminalProvider(
    outputChannel,
    {
      verboseEnabled: true,
      debugEnabled: true
    }
  );
  const terminal: Terminal = new Terminal(terminalProvider);
  outputChannel.appendLine(`${UI_EXTENSION_DISPLAY_NAME} Extension output channel initialized.`);

  function handlePing(): { version: string } {
    return {
      version
    };
  }

  function handleShowLogs(): void {
    outputChannel.show();
  }

  async function handleUntrustCertificate(): Promise<void> {
    try {
      outputChannel.appendLine('Attempting to clean up certificates...');
      const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(outputChannel);
      const certificateManager: CertificateManager = new CertificateManager({
        caCertificateFilename,
        keyFilename,
        certificateFilename,
        storePath
      });
      await certificateManager.untrustCertificateAsync(terminal);
      outputChannel.appendLine('Certificates untrusted successfully.');
      void vscode.window.showInformationMessage('Certificates untrusted successfully.');
    } catch (err) {
      outputChannel.appendLine(
        `Error cleaning up certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      void vscode.window.showErrorMessage(
        `Error cleaning up certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  async function handleEnsureCertificate(): Promise<undefined | ICertificate> {
    try {
      outputChannel.appendLine('Attempting to retrieve certificates...');
      const { caCertificateFilename, keyFilename, certificateFilename, storePath } = getConfig(outputChannel);
      const certificateManager: CertificateManager = new CertificateManager({
        caCertificateFilename,
        keyFilename,
        certificateFilename,
        storePath
      });
      let skipCertificateTrust: boolean = false;
      let canGenerateNewCertificate: boolean = false;

      let certificates: ICertificate | undefined = undefined;
      let isCertExpired: boolean = false;
      try {
        certificates = await Async.runWithTimeoutAsync(
          certificateManager.ensureCertificateAsync(canGenerateNewCertificate, terminal, {
            skipCertificateTrust
          }),
          5000,
          'Certificate request timed out after 5 seconds'
        );
        const { caCertificateExpiration, certificateExpiration } =
          await certificateManager.getCertificateExpirationAsync();

        const now: number = Date.now();
        isCertExpired =
          (caCertificateExpiration?.getTime() ?? 0) < now || (certificateExpiration?.getTime() ?? 0) < now;
      } catch {
        outputChannel.appendLine('Failed to retrieve existing certificates. Creating new ones.');
      }

      if (
        !certificates ||
        !certificates.pemCaCertificate ||
        !certificates.pemCertificate ||
        !certificates.pemKey ||
        isCertExpired
      ) {
        outputChannel.appendLine('No valid certificates found. Prompting user to create new certificates.');
        const response: 'Create and Trust' | 'Create and Skip Trust' | undefined =
          await vscode.window.showInformationMessage(
            'No valid certificates found. Would you like to create new certificates?',
            'Create and Trust',
            'Create and Skip Trust'
          );

        outputChannel.appendLine(`User response: ${response ? response : 'No response received'}`);

        if (!response) {
          outputChannel.appendLine('User cancelled certificate creation.');
          void vscode.window.showInformationMessage('Certificate creation cancelled.');
          return undefined;
        }

        if (response === 'Create and Skip Trust') {
          skipCertificateTrust = true;
          canGenerateNewCertificate = true;
        } else if (response === 'Create and Trust') {
          skipCertificateTrust = false;
          canGenerateNewCertificate = true;
        }

        certificates = await Async.runWithTimeoutAsync(
          certificateManager.ensureCertificateAsync(canGenerateNewCertificate, terminal, {
            skipCertificateTrust
          }),
          30000,
          'Certificate generation timed out after 30 seconds'
        );

        outputChannel.appendLine(
          `Creating new certificates. Can generate new certificate: ${canGenerateNewCertificate}, Skip certificate trust: ${skipCertificateTrust}`
        );

        if (!certificates.pemCaCertificate || !certificates.pemCertificate || !certificates.pemKey) {
          void vscode.window.showErrorMessage('Failed to create new certificates.');
          outputChannel.appendLine('Failed to create new certificates.');
          return undefined;
        }
      }

      outputChannel.appendLine('Certificates retrieved successfully.');
      return certificates;
    } catch (err) {
      outputChannel.appendLine(
        `Error retrieving certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      void vscode.window.showErrorMessage(
        `Error retrieving certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(UI_COMMAND_PING, handlePing),
    vscode.commands.registerCommand(UI_COMMAND_SHOW_LOG, handleShowLogs),
    vscode.commands.registerCommand(UI_COMMAND_UNTRUST_CERTIFICATE, handleUntrustCertificate),
    vscode.commands.registerCommand(UI_COMMAND_ENSURE_CERTIFICATE, handleEnsureCertificate)
  );
}

export function deactivate(): void {}
