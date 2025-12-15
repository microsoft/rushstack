// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as vscode from 'vscode';

import { Async } from '@rushstack/node-core-library/lib/Async';
import { Terminal } from '@rushstack/terminal';
import {
  CertificateManager,
  ICertificateStoreOptions,
  ICertificateValidationResult,
  type ICertificate
} from '@rushstack/debug-certificate-manager';

import { VScodeOutputChannelTerminalProvider } from '@rushstack/vscode-shared/lib/VScodeOutputChannelTerminalProvider';
import { getCertificateManager } from './certificates';
import { getConfig } from './config';
import {
  COMMAND_ENSURE_CERTIFICATE,
  COMMAND_SHOW_LOG,
  COMMAND_SHOW_SETTINGS,
  COMMAND_SYNC,
  COMMAND_UNTRUST_CERTIFICATE,
  EXTENSION_DISPLAY_NAME,
  VSCODE_SETTINGS_EXTENSION_ID_FILTER,
  VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS
} from './constants';
import { runWorkspaceCommandAsync } from './terminal';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME);
  const terminalProvider: VScodeOutputChannelTerminalProvider = new VScodeOutputChannelTerminalProvider(
    outputChannel,
    {
      verboseEnabled: true,
      debugEnabled: true
    }
  );
  const terminal: Terminal = new Terminal(terminalProvider);
  terminal.writeLine(`${EXTENSION_DISPLAY_NAME} Extension output channel initialized.`);

  function handleShowLog(): void {
    outputChannel.show();
  }

  async function handleUntrustCertificate(): Promise<void> {
    try {
      terminal.writeLine('Attempting to clean up certificates...');
      const certificateManager: CertificateManager = getCertificateManager(terminal);
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
      const certificateManager: CertificateManager = getCertificateManager(terminal);
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

  async function handleShowSettings(): Promise<void> {
    await vscode.commands.executeCommand(
      VSCODE_COMMAND_WORKSPACE_OPEN_SETTINGS,
      VSCODE_SETTINGS_EXTENSION_ID_FILTER
    );
  }

  async function handleSync(): Promise<void> {
    try {
      terminal.writeLine('Starting certificate synchronization...');

      const certificate: ICertificate | undefined = await _handleEnsureCertificateInternal();
      if (!certificate) {
        terminal.writeLine('No valid certificates found. Synchronization aborted.');
        return;
      }

      const { pemCaCertificate, pemCertificate, pemKey } = certificate;
      if (!pemCaCertificate || !pemCertificate || !pemKey) {
        terminal.writeLine('Invalid certificate data. Synchronization aborted.');
        void vscode.window.showErrorMessage('Invalid certificate data. Synchronization aborted.');
        return;
      }

      terminal.writeLine('Writing certificates to the workspace...');

      const workspaceUri: vscode.Uri | undefined = vscode.workspace.workspaceFolders?.[0].uri;
      if (!workspaceUri) {
        terminal.writeLine('No workspace folder found. Synchronization aborted.');
        return;
      }

      let workspaceCertificateStoreOptions: Required<ICertificateStoreOptions> | undefined = undefined;

      try {
        const configFileUri: vscode.Uri = vscode.Uri.joinPath(
          workspaceUri,
          '.vscode',
          'debug-certificate-manager.json'
        );
        const configFile: Uint8Array<ArrayBufferLike> = await vscode.workspace.fs.readFile(configFileUri);
        const parsedConfig: ICertificateStoreOptions & Required<Pick<ICertificateStoreOptions, 'storePath'>> =
          JSON.parse(configFile.toString());

        workspaceCertificateStoreOptions = {
          storePath: parsedConfig.storePath,
          caCertificateFilename: parsedConfig.caCertificateFilename || 'rushstack-ca.pem',
          certificateFilename: parsedConfig.certificateFilename || 'rushstack-serve.pem',
          keyFilename: parsedConfig.keyFilename || 'rushstack-serve.key'
        };
      } catch (error) {
        terminal.writeLine(
          `Error reading or parsing configuration file: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
        return;
      }

      const { storePath, caCertificateFilename, certificateFilename, keyFilename } =
        workspaceCertificateStoreOptions;

      let resolvedWorkspaceStorePath: string;
      if (storePath.startsWith('/')) {
        resolvedWorkspaceStorePath = storePath;
      } else if (storePath.startsWith('~')) {
        let homeDir: string;

        if (vscode.env.remoteName) {
          const markerPrefix: string = '<<<HOMEDIR_START>>>';
          const markerSuffix: string = '<<<HOMEDIR_END>>>';
          const output: string = await runWorkspaceCommandAsync({
            terminalOptions: { name: 'debug-certificate-manager', hideFromUser: true },
            // Wrapping the desired node output in markers to trim uninteresting shell output.
            commandLine: `node -p "'${markerPrefix}' + require('os').homedir() + '${markerSuffix}'"`,
            terminal
          });
          terminal.writeLine(`Running command to resolve home directory: ${output}`);

          const startIndex: number = output.lastIndexOf(markerPrefix);
          const endIndex: number = output.lastIndexOf(markerSuffix);
          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            homeDir = output.substring(startIndex + markerPrefix.length, endIndex).trim();
          } else {
            throw new Error('Failed to parse home directory from command output');
          }
        } else {
          homeDir = require('os').homedir();
        }

        terminal.writeLine(`Resolved home directory: ${homeDir}`);
        const homeDirUri: vscode.Uri = vscode.Uri.from({
          scheme: workspaceUri.scheme,
          authority: workspaceUri.authority,
          path: homeDir
        });
        resolvedWorkspaceStorePath = vscode.Uri.joinPath(homeDirUri, storePath.slice(1)).path;
      } else {
        resolvedWorkspaceStorePath = vscode.Uri.joinPath(workspaceUri, storePath).path;
      }

      const storePathUri: vscode.Uri = vscode.Uri.from({
        scheme: workspaceUri.scheme,
        authority: workspaceUri.authority,
        path: resolvedWorkspaceStorePath
      });

      const caCertificateUri: vscode.Uri = vscode.Uri.joinPath(storePathUri, caCertificateFilename);
      const certificateUri: vscode.Uri = vscode.Uri.joinPath(storePathUri, certificateFilename);
      const keyUri: vscode.Uri = vscode.Uri.joinPath(storePathUri, keyFilename);

      terminal.writeLine(`Writing CA certificate to: ${caCertificateUri.toString()}`);
      terminal.writeLine(`Writing certificate to: ${certificateUri.toString()}`);
      terminal.writeLine(`Writing key to: ${keyUri.toString()}`);

      await Promise.all([
        vscode.workspace.fs.writeFile(caCertificateUri, Buffer.from(pemCaCertificate, 'utf8')),
        vscode.workspace.fs.writeFile(certificateUri, Buffer.from(pemCertificate, 'utf8')),
        vscode.workspace.fs.writeFile(keyUri, Buffer.from(pemKey, 'utf8'))
      ]);

      terminal.writeLine('Certificates written to the workspace successfully.');
    } catch (err) {
      const message: string = `Error synchronizing certificates: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      terminal.writeLine(message);
      void vscode.window.showErrorMessage(message);
    }
  }

  const { autoSync } = getConfig(terminal);
  if (autoSync) {
    terminal.writeLine(`Auto-sync is enabled. Synchronizing certificates on activation...`);
    void handleSync();
  }

  context.subscriptions.push(
    outputChannel,
    vscode.commands.registerCommand(COMMAND_SHOW_LOG, handleShowLog),
    vscode.commands.registerCommand(COMMAND_SHOW_SETTINGS, handleShowSettings),
    vscode.commands.registerCommand(COMMAND_UNTRUST_CERTIFICATE, handleUntrustCertificate),
    vscode.commands.registerCommand(COMMAND_ENSURE_CERTIFICATE, handleEnsureCertificate),
    vscode.commands.registerCommand(COMMAND_SYNC, handleSync)
  );
}

export function deactivate(): void {}
