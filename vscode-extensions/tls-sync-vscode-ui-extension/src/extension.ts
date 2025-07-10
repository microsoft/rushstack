// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';

import { Async } from '@rushstack/node-core-library/lib/Async';
import { Terminal } from '@rushstack/terminal';
import {
  CertificateManager,
  ICertificateValidationResult,
  type ICertificate
} from '@rushstack/debug-certificate-manager';

import { VScodeOutputChannelTerminalProvider } from '@rushstack/vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import { getCertificateManager } from '@rushstack/tls-sync-vscode-shared/lib/certificates';
import { getConfig } from '@rushstack/tls-sync-vscode-shared/lib/config';
import {
  UI_COMMAND_ENSURE_CERTIFICATE,
  UI_COMMAND_SHOW_LOG,
  UI_COMMAND_SHOW_SETTINGS,
  UI_COMMAND_SHOW_WALKTHROUGH,
  UI_COMMAND_SYNC,
  UI_COMMAND_UNTRUST_CERTIFICATE,
  UI_EXTENSION_DISPLAY_NAME,
  UI_EXTENSION_ID,
  UI_WALKTHROUGH_ID,
  VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS,
  VSCODE_COMMAND_WORKSPACE_OPEN_WALKTHROUGH,
  WORKSPACE_COMMAND_PING,
  WORKSPACE_COMMAND_SYNC,
  WORKSPACE_EXTENSION_DISPLAY_NAME
} from '@rushstack/tls-sync-vscode-shared/lib/constants';

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
  terminal.writeLine(`${UI_EXTENSION_DISPLAY_NAME} Extension output channel initialized.`);

  function handleShowLog(): void {
    outputChannel.show();
  }

  async function handleUntrustCertificate(): Promise<void> {
    try {
      terminal.writeLine('Attempting to clean up certificates...');
      const certificateManager: CertificateManager = getCertificateManager(terminal, 'ui');
      await certificateManager.untrustCertificateAsync(terminal);

      const message: string = 'Certificates untrusted successfully.';
      terminal.writeLine(message);
      void vscode.window.showInformationMessage(message);
    } catch (err) {
      const message: string = `Error cleaning up certificates: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async function handleEnsureCertificate(): Promise<undefined> {
    await _handleEnsureCertificateInternal();
  }

  async function _handleEnsureCertificateInternal(): Promise<undefined | ICertificate> {
    try {
      terminal.writeLine('Attempting to retrieve certificates...');
      const certificateManager: CertificateManager = getCertificateManager(terminal, 'ui');
      let skipCertificateTrust: boolean = true;
      let canGenerateNewCertificate: boolean = false;

      const certificateValidationResult: ICertificateValidationResult =
        await certificateManager.validateCertificateAsync(terminal);

      // Prompt the user and create new certificates
      if (certificateValidationResult.isValid) {
        return certificateValidationResult.certificate;
      }

      for (const error of certificateValidationResult.validationMessages) {
        terminal.writeLine(`Certificate validation message: ${error}`);
      }
      terminal.writeLine('No valid certificates found. Prompting user to create new certificates.');
      const response: 'Create and Trust' | 'Create and Skip Trust' | undefined =
        await vscode.window.showInformationMessage(
          'No valid certificates found. Would you like to create new certificates?',
          'Create and Trust',
          'Create and Skip Trust'
        );

      terminal.writeLine(`User response: ${response || 'No response received'}`);

      if (!response) {
        const message: string = 'User cancelled certificate creation.';
        terminal.writeLine(message);
        return undefined;
      }

      if (response === 'Create and Skip Trust') {
        skipCertificateTrust = true;
        canGenerateNewCertificate = true;
      } else if (response === 'Create and Trust') {
        skipCertificateTrust = false;
        canGenerateNewCertificate = true;
      }

      const timeoutSeconds: number = skipCertificateTrust ? 10 : 30;
      const certificate: ICertificate = await Async.runWithTimeoutAsync({
        action: () =>
          certificateManager.ensureCertificateAsync(canGenerateNewCertificate, terminal, {
            skipCertificateTrust
          }),
        timeoutMs: timeoutSeconds * 1000,
        timeoutMessage: `Certificate generation timed out after ${timeoutSeconds} seconds`
      });

      terminal.writeLine(
        `Creating new certificates. Can generate new certificate: ${canGenerateNewCertificate}, Skip certificate trust: ${skipCertificateTrust}`
      );

      if (!certificate.pemCaCertificate || !certificate.pemCertificate || !certificate.pemKey) {
        void vscode.window.showErrorMessage('Failed to create new certificates.');
        terminal.writeLine('Failed to create new certificates.');
        return undefined;
      }

      terminal.writeLine('Certificates retrieved successfully.');
      return certificate;
    } catch (err) {
      const message: string = `Error retrieving certificates: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
    }
  }

  async function handleShowWalkthrough(): Promise<void> {
    await vscode.commands.executeCommand(
      VSCODE_COMMAND_WORKSPACE_OPEN_WALKTHROUGH,
      `${UI_EXTENSION_ID}#${UI_WALKTHROUGH_ID}`,
      false
    );
  }

  async function handleShowSettings(): Promise<void> {
    await vscode.commands.executeCommand(VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS, `@ext:${UI_EXTENSION_ID}`);
  }

  async function waitForWorkspaceExtension(): Promise<void> {
    terminal.writeLine(
      `Waiting for Workspace extension (${WORKSPACE_EXTENSION_DISPLAY_NAME}) to become active...`
    );

    const maxRetries: number = 30;
    try {
      await Async.runWithRetriesAsync({
        action: async (attempt: number) => {
          terminal.writeLine(`Pinging Workspace extension... Attempt ${attempt + 1}/${maxRetries}`);
          const { version: workspaceVersion } = await vscode.commands.executeCommand<{ version: string }>(
            WORKSPACE_COMMAND_PING
          );
          if (!workspaceVersion) {
            terminal.writeLine('Workspace extension is not yet active. Retrying...');
            return;
          }
          terminal.writeLine(`Workspace extension is active. Version: ${workspaceVersion}`);
          if (version !== workspaceVersion) {
            terminal.writeLine(
              `Warning: Workspace extension version mismatch. Expected ${version}, got ${workspaceVersion}.`
            );
            void vscode.window.showWarningMessage(
              `Workspace extension version mismatch. Expected ${version}, got ${workspaceVersion}. Please check that both ${WORKSPACE_EXTENSION_DISPLAY_NAME} and ${UI_EXTENSION_DISPLAY_NAME} are up to date.`
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

  async function handleSync(): Promise<void> {
    if (!vscode.env.remoteName) {
      const message: string =
        'This command is only available in remote workspaces. Please open this workspace in a remote environment.';
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
    }

    try {
      await waitForWorkspaceExtension();
      terminal.writeLine('Workspace extension is active. Proceeding with certificate synchronization...');

      const certificate: ICertificate | undefined = await _handleEnsureCertificateInternal();
      if (!certificate) {
        terminal.writeLine('No valid certificates found. Synchronization aborted.');
        return;
      }

      terminal.writeLine('Sending certificates to workspace extension for synchronization...');
      const isSynchronized: boolean = await vscode.commands.executeCommand(
        WORKSPACE_COMMAND_SYNC,
        certificate
      );

      if (isSynchronized) {
        await vscode.commands.executeCommand('setContext', 'tlssync.ui.sync.complete', true);
        terminal.writeLine('Certificates synchronized successfully.');
        void vscode.window.showInformationMessage('Certificates synchronized successfully.');
      } else {
        terminal.writeLine('Failed to synchronize certificates.');
        void vscode.window.showErrorMessage('Failed to synchronize certificates.');
      }
    } catch (err) {
      const message: string = `Error synchronizing certificates: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
    }
  }

  const { autoSync } = getConfig(terminal, 'ui');
  if (autoSync && !vscode.env.remoteName) {
    terminal.writeLine(`Auto-sync is enabled. Synchronizing certificates on activation...`);
    void vscode.commands.executeCommand(UI_COMMAND_SYNC);
  }

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(UI_COMMAND_SHOW_LOG, handleShowLog),
    vscode.commands.registerCommand(UI_COMMAND_SHOW_SETTINGS, handleShowSettings),
    vscode.commands.registerCommand(UI_COMMAND_SHOW_WALKTHROUGH, handleShowWalkthrough),
    vscode.commands.registerCommand(UI_COMMAND_UNTRUST_CERTIFICATE, handleUntrustCertificate),
    vscode.commands.registerCommand(UI_COMMAND_ENSURE_CERTIFICATE, handleEnsureCertificate),
    vscode.commands.registerCommand(UI_COMMAND_SYNC, handleSync)
  );
}

export function deactivate(): void {}
