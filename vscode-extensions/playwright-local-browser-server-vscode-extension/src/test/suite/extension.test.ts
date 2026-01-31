// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Playwright Local Browser Server Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Extension should be present', () => {
    const extensionId: string = 'ms-RushStack.playwright-local-browser-server';
    const extension: vscode.Extension<unknown> | undefined =
      vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `Extension ${extensionId} should be installed`);
  });

  test('Extension should activate', async () => {
    const extensionId: string = 'ms-RushStack.playwright-local-browser-server';
    const extension: vscode.Extension<unknown> | undefined =
      vscode.extensions.getExtension(extensionId);
    assert.ok(extension, 'Extension should be installed');

    await extension.activate();
    assert.strictEqual(extension.isActive, true, 'Extension should be active');
  });

  suite('Command Registration Tests', () => {
    const commands: string[] = [
      'playwright-local-browser-server.start',
      'playwright-local-browser-server.stop',
      'playwright-local-browser-server.manageAllowlist',
      'playwright-local-browser-server.showLog',
      'playwright-local-browser-server.showSettings',
      'playwright-local-browser-server.showMenu'
    ];

    commands.forEach((commandId) => {
      test(`Command '${commandId}' should be registered`, async () => {
        const allCommands: string[] = await vscode.commands.getCommands(true);
        assert.ok(
          allCommands.includes(commandId),
          `Command '${commandId}' should be registered`
        );
      });
    });
  });

  suite('Command Execution Tests', () => {
    suiteSetup(async () => {
      // Ensure extension is activated before testing command execution
      const extensionId: string = 'ms-RushStack.playwright-local-browser-server';
      const extension: vscode.Extension<unknown> | undefined =
        vscode.extensions.getExtension(extensionId);
      if (extension && !extension.isActive) {
        await extension.activate();
      }
    });

    test('Command playwright-local-browser-server.showLog should execute without error', async () => {
      await vscode.commands.executeCommand('playwright-local-browser-server.showLog');
      // If we get here without throwing, the command executed successfully
      assert.ok(true, 'showLog command executed');
    });

    test('Command playwright-local-browser-server.showSettings should execute without error', async () => {
      await vscode.commands.executeCommand('playwright-local-browser-server.showSettings');
      // If we get here without throwing, the command executed successfully
      assert.ok(true, 'showSettings command executed');
    });

    // Note: We skip testing start, stop, manageAllowlist, and showMenu commands
    // because they show interactive dialogs that would block automated testing.
    // In a real-world scenario, these would need to be mocked or use
    // dependency injection to allow testing without user interaction.
  });

  suite('Package.json Command Validation', () => {
    test('All commands in package.json should be registered', async () => {
      // Get the extension's package.json
      const extensionId: string = 'ms-RushStack.playwright-local-browser-server';
      const extension: vscode.Extension<unknown> | undefined =
        vscode.extensions.getExtension(extensionId);
      assert.ok(extension, 'Extension should be installed');

      const packageJson: { contributes?: { commands?: Array<{ command: string }> } } =
        extension.packageJSON;
      const contributedCommands: string[] =
        packageJson.contributes?.commands?.map((cmd: { command: string }) => cmd.command) || [];

      // Get all registered commands
      const allCommands: string[] = await vscode.commands.getCommands(true);

      // Verify each contributed command is registered
      for (const commandId of contributedCommands) {
        assert.ok(
          allCommands.includes(commandId),
          `Command '${commandId}' from package.json should be registered`
        );
      }
    });
  });
});
