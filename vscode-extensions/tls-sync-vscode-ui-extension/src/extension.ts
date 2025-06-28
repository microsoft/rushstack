// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';
import { VScodeOutputChannelTerminalProvider } from '@rushstack/tls-sync-vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import {
  UI_COMMAND_GET_CERTIFICATES,
  UI_COMMAND_SHOW_LOG,
  UI_COMMAND_PING,
  UI_COMMAND_UNTRUST_CERTIFICATE,
  UI_EXTENSION_DISPLAY_NAME
} from '@rushstack/tls-sync-vscode-shared/lib/constants';
import { getConfig } from '@rushstack/tls-sync-vscode-shared/lib/config';
import { withTimeout } from '@rushstack/tls-sync-vscode-shared/lib/withTimeout';
import { CertificateManager, type ICertificate } from '@rushstack/debug-certificate-manager';
import { Terminal } from '@rushstack/terminal';
import { version } from '../package.json';

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

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(UI_COMMAND_PING, function handlePing(): { version: string } {
      return {
        version
      };
    }),
    vscode.commands.registerCommand(UI_COMMAND_SHOW_LOG, function handleShowLogs(): void {
      outputChannel.show();
    }),
    vscode.commands.registerCommand(
      UI_COMMAND_UNTRUST_CERTIFICATE,
      async function handleUntrust(): Promise<void> {
        try {
          outputChannel.appendLine('Attempting to clean up certificates...');
          const { caCertificateFilename, keyFilename, certificateFilename, storePath } =
            getConfig(outputChannel);
          const certificateManager: CertificateManager = new CertificateManager({
            caCertificateFilename,
            keyFilename,
            certificateFilename,
            storePath
          });
          await certificateManager.untrustCertificateAsync(terminal);
          outputChannel.appendLine('Certificates untrusted successfully.');
          await vscode.window.showInformationMessage('Certificates untrusted successfully.');
        } catch (err) {
          outputChannel.appendLine(
            `Error cleaning up certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
          await vscode.window.showErrorMessage(
            `Error cleaning up certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }
    ),
    vscode.commands.registerCommand(
      UI_COMMAND_GET_CERTIFICATES,
      async function handleGetCertificates(): Promise<undefined | ICertificate> {
        try {
          outputChannel.appendLine('Attempting to retrieve certificates...');
          const { caCertificateFilename, keyFilename, certificateFilename, storePath } =
            getConfig(outputChannel);
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
            certificates = await withTimeout(
              certificateManager.ensureCertificateAsync(canGenerateNewCertificate, terminal, {
                skipCertificateTrust
              }),
              5000,
              'Certificate request timed out after 5 seconds'
            );
            const { caCertificateExpiration, serverCertificateExpiration } =
              await certificateManager.getCertificateExpirationAsync();

            const now: number = Date.now();
            isCertExpired =
              (caCertificateExpiration?.getTime() ?? 0) < now ||
              (serverCertificateExpiration?.getTime() ?? 0) < now;
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
            outputChannel.appendLine(
              'No valid certificates found. Prompting user to create new certificates.'
            );
            const response: 'Create and Trust' | 'Create and Skip Trust' | undefined =
              await vscode.window.showInformationMessage(
                'No valid certificates found. Would you like to create new certificates?',
                'Create and Trust',
                'Create and Skip Trust'
              );

            outputChannel.appendLine(`User response: ${response ? response : 'No response received'}`);

            if (!response) {
              outputChannel.appendLine('User cancelled certificate creation.');
              await vscode.window.showInformationMessage('Certificate creation cancelled.');
              return undefined;
            }

            if (response === 'Create and Skip Trust') {
              skipCertificateTrust = true;
              canGenerateNewCertificate = true;
            } else if (response === 'Create and Trust') {
              skipCertificateTrust = false;
              canGenerateNewCertificate = true;
            }

            certificates = await withTimeout(
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
              await vscode.window.showErrorMessage('Failed to create new certificates.');
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
          await vscode.window.showErrorMessage(
            `Error retrieving certificates: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }
    )
  );
}

export function deactivate(): void {}
