// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Writable, type WritableOptions } from 'node:stream';
import type { ITerminal } from './ITerminal';
import { TerminalProviderSeverity } from './ITerminalProvider';

/**
 * Options for {@link TerminalStreamWritable}.
 *
 * @beta
 */
export interface ITerminalStreamWritableOptions {
  /**
   * The {@link ITerminal} that the Writable will write to.
   */
  terminal: ITerminal;
  /**
   * The severity of the messages that will be written to the {@link ITerminal}.
   */
  severity: TerminalProviderSeverity;
  /**
   * Options for the underlying Writable.
   */
  writableOptions?: WritableOptions;
}

/**
 * A adapter to allow writing to a provided terminal using Writable streams.
 *
 * @beta
 */
export class TerminalStreamWritable extends Writable {
  private _writeMethod: (data: string) => void;

  public constructor(options: ITerminalStreamWritableOptions) {
    const { terminal, severity, writableOptions } = options;
    super(writableOptions);

    this._writev = undefined;
    switch (severity) {
      case TerminalProviderSeverity.log:
        this._writeMethod = terminal.write.bind(terminal);
        break;
      case TerminalProviderSeverity.verbose:
        this._writeMethod = terminal.writeVerbose.bind(terminal);
        break;
      case TerminalProviderSeverity.debug:
        this._writeMethod = terminal.writeDebug.bind(terminal);
        break;
      case TerminalProviderSeverity.warning:
        this._writeMethod = terminal.writeWarning.bind(terminal);
        break;
      case TerminalProviderSeverity.error:
        this._writeMethod = terminal.writeError.bind(terminal);
        break;
      default:
        throw new Error(`Unknown severity: ${severity}`);
    }
  }

  public _write(
    chunk: string | Buffer | Uint8Array,
    encoding: string,
    // eslint-disable-next-line @rushstack/no-new-null
    callback: (error?: Error | null) => void
  ): void {
    try {
      const chunkData: string | Buffer = typeof chunk === 'string' ? chunk : Buffer.from(chunk);
      this._writeMethod(chunkData.toString());
    } catch (e: unknown) {
      callback(e as Error);
      return;
    }
    callback();
  }
}
