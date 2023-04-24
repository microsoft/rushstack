// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/node-core-library';
import { CollatedTerminal } from '@rushstack/stream-collator';
import { TerminalChunkKind } from '@rushstack/terminal';

export interface ICollatedTerminalProviderOptions {
  debugEnabled: boolean;
}

export class CollatedTerminalProvider implements ITerminalProvider {
  private readonly _collatedTerminal: CollatedTerminal;
  private _hasErrors: boolean = false;
  private _hasWarnings: boolean = false;
  private _debugEnabled: boolean = false;

  public readonly supportsColor: boolean = true;
  public readonly eolCharacter: string = '\n';

  public get hasErrors(): boolean {
    return this._hasErrors;
  }

  public get hasWarnings(): boolean {
    return this._hasWarnings;
  }

  public constructor(
    collatedTerminal: CollatedTerminal,
    options?: Partial<ICollatedTerminalProviderOptions>
  ) {
    this._collatedTerminal = collatedTerminal;
    this._debugEnabled = !!options?.debugEnabled;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    switch (severity) {
      case TerminalProviderSeverity.log:
      case TerminalProviderSeverity.verbose: {
        // Unlike the basic ConsoleTerminalProvider, verbose messages are always passed
        // to stdout -- by convention the user-controlled build script output is sent
        // to verbose, and will be routed to a variety of other providers in the ProjectBuilder.
        this._collatedTerminal.writeChunk({ text: data, kind: TerminalChunkKind.Stdout });
        break;
      }

      case TerminalProviderSeverity.debug: {
        // Similar to the basic ConsoleTerminalProvider, debug messages are discarded
        // unless they are explicitly enabled.
        if (this._debugEnabled) {
          this._collatedTerminal.writeChunk({ text: data, kind: TerminalChunkKind.Stdout });
        }
        break;
      }

      case TerminalProviderSeverity.error: {
        this._collatedTerminal.writeChunk({ text: data, kind: TerminalChunkKind.Stderr });
        this._hasErrors = true;
        break;
      }

      case TerminalProviderSeverity.warning: {
        this._collatedTerminal.writeChunk({ text: data, kind: TerminalChunkKind.Stderr });
        this._hasWarnings = true;
        break;
      }

      default: {
        throw new Error(`Unexpected severity: ${severity}`);
      }
    }
  }
}
