// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminal } from '@rushstack/terminal';
import * as vscode from 'vscode';
import { stripVTControlCharacters } from 'node:util';

/**
 * Options for extracting a specific value from the command output using markers.
 * When provided, the command will be wrapped with the specified markers, and only
 * the content between them will be returned. This is useful for extracting specific
 * values from shell output that may contain additional noise.
 */
export interface IOutputMarkerOptions {
  /**
   * The expression to evaluate and wrap with markers. This will be inserted between
   * the prefix and suffix markers in the command output.
   */
  expression: string;
  /**
   * The prefix marker used to identify the start of the desired output.
   */
  prefix: string;
  /**
   * The suffix marker used to identify the end of the desired output.
   */
  suffix: string;
}

export async function runWorkspaceCommandAsync({
  terminalOptions,
  commandLine,
  terminal,
  outputMarker
}: {
  terminalOptions: vscode.TerminalOptions;
  commandLine: string;
  terminal: ITerminal;
  /**
   * Optional marker options for extracting specific output. When provided, the
   * commandLine is constructed as: `node -p "'${prefix}' + ${expression} + '${suffix}'"`
   * and the returned output will be only the content between the markers.
   */
  outputMarker?: IOutputMarkerOptions;
}): Promise<string> {
  // If outputMarker is provided, construct the command with markers
  let effectiveCommandLine: string;
  if (outputMarker) {
    effectiveCommandLine = `node -p "'${outputMarker.prefix}' + ${outputMarker.expression} + '${outputMarker.suffix}'"`;
  } else {
    effectiveCommandLine = commandLine;
  }
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
          // If outputMarker was provided, extract the content between markers
          if (outputMarker) {
            const startIndex: number = outputStream.indexOf(outputMarker.prefix);
            const endIndex: number = outputStream.indexOf(outputMarker.suffix);
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
              const extractedOutput: string = outputStream
                .substring(startIndex + outputMarker.prefix.length, endIndex)
                .trim();
              resolve(extractedOutput);
            } else {
              reject(new Error('Failed to parse output from command: markers not found'));
            }
          } else {
            resolve(outputStream);
          }
        } else {
          reject(outputStream);
        }
      }
    );

    shellIntegration.executeCommand(effectiveCommandLine);
    terminal.writeLine(`Executing command: ${effectiveCommandLine}`);
  }).finally(() => {
    vsTerminal.dispose();
  });
}
