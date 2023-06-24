import type { ITerminal } from '@rushstack/node-core-library';
import { Writable } from 'stream';

// Regex to filter out screen clearing directives
// Can't use the AnsiEscape.removeCodes() function from node-core-library because we are only
// removing the clear screen directives, but want to preserve coloring.
// eslint-disable-next-line no-control-regex
const FILTER_REGEX: RegExp = /\x1B\[2J\x1B\[0f|\x1B\[2J\x1B\[3J\x1B\[H/g;

export class TerminalWritableStream extends Writable {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    super({
      objectMode: false,
      decodeStrings: false,
      defaultEncoding: 'utf-8'
    });

    this._terminal = terminal;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public _write(chunk: any, encoding: string, callback: (error?: Error | undefined) => void): void {
    const stringified: string = typeof chunk === 'string' ? chunk : chunk.toString(encoding);
    const filtered: string = stringified.replace(FILTER_REGEX, '');
    this._terminal.write(filtered);
    callback();
  }
}
