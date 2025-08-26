// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/terminal';
import * as vscode from 'vscode';
import { stripVTControlCharacters } from 'node:util';

export async function runWorkspaceCommandAsync({
  terminalOptions,
  commandLine,
  terminal
}: {
  terminalOptions: vscode.TerminalOptions;
  commandLine: string;
  terminal: ITerminal;
}): Promise<string> {
  const vsTerminal: vscode.Terminal = vscode.window.createTerminal(terminalOptions);

  // wait for shell to bootup and vs code shell integration to kick-in
  const shellIntegration: vscode.TerminalShellIntegration =
    vsTerminal.shellIntegration ??
    (await new Promise((resolve, reject) => {
      const shellIntegrationDisposable: vscode.Disposable = vscode.window.onDidChangeTerminalShellIntegration(
        (event) => {
          if (event.terminal !== vsTerminal) {
            return;
          }

          resolve(event.shellIntegration);
          shellIntegrationDisposable?.dispose();
        }
      );
    }));

  // Run the command through shell integration and grab output
  return new Promise<string>((resolve, reject) => {
    let outputStream: string = '';

    // start output capturing with the start execution event
    const startExecutionDisposable: vscode.Disposable = vscode.window.onDidStartTerminalShellExecution(
      async (event) => {
        if (event.terminal !== vsTerminal) {
          return;
        }
        terminal.writeLine(`Terminal shell execution started`);

        for await (const chunk of event.execution.read()) {
          outputStream += chunk;
        }
      }
    );

    // collect output and exit code
    const endExecutionDisposable: vscode.Disposable = vscode.window.onDidEndTerminalShellExecution(
      (event) => {
        if (event.terminal !== vsTerminal) {
          return;
        }

        terminal.writeLine(`Terminal shell execution ended with exit code ${event.exitCode}`);
        outputStream = outputStream.trim();
        outputStream = stripVTControlCharacters(outputStream);
        terminal.writeLine(`Terminal output: ${outputStream}`);

        endExecutionDisposable.dispose();
        startExecutionDisposable.dispose();

        if (event.exitCode === 0) {
          resolve(outputStream);
        } else {
          reject(outputStream);
        }
      }
    );

    shellIntegration.executeCommand(commandLine);
    terminal.writeLine(`Executing command: ${commandLine}`);
  }).finally(() => {
    vsTerminal.dispose();
  });
}
