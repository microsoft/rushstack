// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '@rushstack/node-core-library';
import type { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';
import type * as vscode from 'vscode';

/**
 * Options to be provided to a {@link VScodeOutputChannelTerminalProvider}
 *
 * @beta
 */
export interface IVScodeOutputChannelTerminalProviderOptions {
  /**
   * If true, print verbose logging messages.
   */
  verboseEnabled: boolean;

  /**
   * If true, print debug logging messages. Note that "verbose" and "debug" are considered
   * separate message filters; if you want debug to imply verbose, it is up to your
   * application code to enforce that.
   */
  debugEnabled: boolean;
}

/**
 * Terminal provider that prints to STDOUT (for log- and verbose-level messages) and
 * STDERR (for warning- and error-level messages).
 *
 * @beta
 */
export class VScodeOutputChannelTerminalProvider implements ITerminalProvider {
  private readonly _outputChannel: vscode.OutputChannel;
  public static readonly supportsColor: boolean = false;

  /**
   * If true, verbose-level messages should be written to the console.
   */
  public verboseEnabled: boolean;

  /**
   * If true, debug-level messages should be written to the console.
   */
  public debugEnabled: boolean;

  /**
   * {@inheritDoc ITerminalProvider.supportsColor}
   */
  public readonly supportsColor: boolean = VScodeOutputChannelTerminalProvider.supportsColor;

  public constructor(
    outputChannel: vscode.OutputChannel,
    options: Partial<IVScodeOutputChannelTerminalProviderOptions> = {}
  ) {
    this.verboseEnabled = !!options.verboseEnabled;
    this.debugEnabled = !!options.debugEnabled;
    this._outputChannel = outputChannel;
  }

  /**
   * {@inheritDoc ITerminalProvider.write}
   */
  public write(data: string, severity: TerminalProviderSeverity): void {
    const outputChannel: vscode.OutputChannel = this._outputChannel;
    for (const line of Text.readLinesFromIterable(data)) {
      outputChannel.appendLine(line);
    }
  }

  /**
   * {@inheritDoc ITerminalProvider.eolCharacter}
   */
  public get eolCharacter(): string {
    return '\n';
  }
}
