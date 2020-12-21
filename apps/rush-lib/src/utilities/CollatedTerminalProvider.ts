// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalProvider, TerminalProviderSeverity } from '@rushstack/node-core-library';
import { CollatedTerminal } from '@rushstack/stream-collator';

export class CollatedTerminalProvider implements ITerminalProvider {
  private readonly _collatedTerminal: CollatedTerminal;

  public readonly supportsColor: boolean = true;
  public readonly eolCharacter: string = '\n';

  public constructor(collatedTerminal: CollatedTerminal) {
    this._collatedTerminal = collatedTerminal;
  }

  public write(data: string, severity: TerminalProviderSeverity): void {
    switch (severity) {
      case TerminalProviderSeverity.log:
      case TerminalProviderSeverity.verbose: {
        this._collatedTerminal.writeStdoutLine(data);
        break;
      }

      case TerminalProviderSeverity.error:
      case TerminalProviderSeverity.warning: {
        this._collatedTerminal.writeStderrLine(data);
        break;
      }

      default: {
        throw new Error(`Unexpected severity: ${severity}`);
      }
    }
  }
}
