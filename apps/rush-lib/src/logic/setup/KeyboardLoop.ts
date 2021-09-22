// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as readline from 'readline';
import * as process from 'process';
import { InternalError } from '@rushstack/node-core-library';

// TODO: Integrate these into the AnsiEscape API in @rushstack/node-core-library
// As part of that work we should generalize the "Colors" API to support more general
// terminal escapes, and simplify the interface for that API.
const ANSI_ESCAPE_SHOW_CURSOR: string = '\u001B[?25l';
const ANSI_ESCAPE_HIDE_CURSOR: string = '\u001B[?25h';

export class KeyboardLoop {
  protected stdin: NodeJS.ReadStream;
  protected stderr: NodeJS.WriteStream;
  private _readlineInterface: readline.Interface | undefined;
  private _resolvePromise: (() => void) | undefined;
  private _rejectPromise: ((error: Error) => void) | undefined;
  private _cursorHidden: boolean = false;

  public constructor() {
    this.stdin = process.stdin;
    this.stderr = process.stderr;
  }

  public get capturedInput(): boolean {
    return this._readlineInterface !== undefined;
  }

  private _captureInput(): void {
    if (this._readlineInterface) {
      return;
    }

    this._readlineInterface = readline.createInterface({ input: this.stdin });

    readline.emitKeypressEvents(process.stdin);
    this.stdin.setRawMode!(true);
    this.stdin.addListener('keypress', this._onKeypress);
  }

  private _uncaptureInput(): void {
    if (!this._readlineInterface) {
      return;
    }

    this.stdin.removeListener('keypress', this._onKeypress);
    this.stdin.setRawMode!(false);
    this._readlineInterface.close();
    this._readlineInterface = undefined;
  }

  protected hideCursor(): void {
    if (this._cursorHidden) {
      return;
    }
    this._cursorHidden = true;
    this.stderr.write(ANSI_ESCAPE_SHOW_CURSOR);
  }

  protected unhideCursor(): void {
    if (!this._cursorHidden) {
      return;
    }
    this._cursorHidden = false;
    this.stderr.write(ANSI_ESCAPE_HIDE_CURSOR);
  }

  public async startAsync(): Promise<void> {
    try {
      this._captureInput();
      this.onStart();
      await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        this._resolvePromise = resolve;
        this._rejectPromise = reject;
      });
    } finally {
      this._uncaptureInput();
      this.unhideCursor();
    }
  }

  protected resolveAsync(): void {
    if (!this._resolvePromise) {
      return;
    }
    this._resolvePromise();
    this._resolvePromise = undefined;
    this._rejectPromise = undefined;
  }

  protected rejectAsync(error: Error): void {
    if (!this._rejectPromise) {
      return;
    }
    this._rejectPromise(error);
    this._resolvePromise = undefined;
    this._rejectPromise = undefined;
  }

  /** @virtual */
  protected onStart(): void {}

  /** @virtual */
  protected onKeypress(character: string, key: readline.Key): void {}

  private _onKeypress = (character: string, key: readline.Key): void => {
    if (key.name === 'c' && key.ctrl && !key.meta && !key.shift) {
      // Intercept CTRL+C
      process.kill(process.pid, 'SIGINT');
      return;
    }
    try {
      this.onKeypress(character, key);
    } catch (error) {
      throw new InternalError('Uncaught exception in Prompter.onKeypress(): ' + (error as Error).toString());
    }
  };
}
