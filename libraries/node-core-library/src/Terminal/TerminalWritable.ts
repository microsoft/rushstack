import type { ITerminal } from './ITerminal';
import { Writable, type WritableOptions } from 'stream';

/**
 * Supported output types for {@link TerminalWritable}. The selected output type
 * determines how the data is written to the terminal.
 *
 * @public
 */
export type TerminalOutputType = 'info' | 'error';

/**
 * Options for {@link TerminalWritable}.
 *
 * @public
 */
export interface ITerminalWritableOptions {
  terminal: ITerminal;
  type: TerminalOutputType;
  writableOptions?: WritableOptions;
}

/**
 * A adapter to allow writing to a provided terminal using Writable streams.
 *
 * @public
 */
export class TerminalWritable extends Writable {
  private _writeMethod: (data: string) => void;

  public constructor(options: ITerminalWritableOptions) {
    const { terminal, type, writableOptions } = options;
    super(writableOptions);

    this._writev = undefined;
    switch (type) {
      case 'info':
        this._writeMethod = terminal.write.bind(terminal);
        break;
      case 'error':
        this._writeMethod = terminal.writeError.bind(terminal);
        break;
      default:
        throw new Error(`Unsupported output type: ${type}`);
    }
  }

  public _write(chunk: string | Buffer | Uint8Array, encoding: string, callback: () => void): void {
    const chunkData: string | Buffer = typeof chunk === 'string' ? chunk : Buffer.from(chunk);
    this._writeMethod(chunkData.toString());
    callback();
  }
}
