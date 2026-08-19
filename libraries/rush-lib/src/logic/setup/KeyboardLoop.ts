// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as readline from 'node:readline';
import * as process from 'node:process';

import { AlreadyReportedError, InternalError } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { IS_WINDOWS } from '../../utilities/executionUtilities';

// TODO: Integrate these into the AnsiEscape API in @rushstack/terminal
// As part of that work we should generalize the "Colorize" API to support more general
// terminal escapes, and simplify the interface for that API.
const ANSI_ESCAPE_SHOW_CURSOR: string = '\u001B[?25l';
const ANSI_ESCAPE_HIDE_CURSOR: string = '\u001B[?25h';

export class KeyboardLoop {
  protected stdin: NodeJS.ReadStream;
  protected stderr: NodeJS.WriteStream;
  #readlineInterface: readline.Interface | undefined;
  #resolvePromise: (() => void) | undefined;
  #rejectPromise: ((error: Error) => void) | undefined;
  #cursorHidden: boolean = false;

  public constructor() {
    this.stdin = process.stdin;
    this.stderr = process.stderr;
  }

  public get capturedInput(): boolean {
    return this.#readlineInterface !== undefined;
  }

  private _captureInput(): void {
    if (this.#readlineInterface) {
      return;
    }

    this._checkForTTY();

    this.#readlineInterface = readline.createInterface({ input: this.stdin });

    readline.emitKeypressEvents(process.stdin);
    this.stdin.setRawMode(true);
    this.stdin.addListener('keypress', this.#onKeypress);
  }

  private _checkForTTY(): void {
    // Typescript thinks setRawMode always extists, but we're testing that assumption here.
    if (this.stdin.isTTY && (this.stdin as Partial<NodeJS.ReadStream>).setRawMode) {
      return;
    }

    if (IS_WINDOWS) {
      const shell: string = process.env.SHELL ?? '';
      if (shell.toUpperCase().endsWith('BASH.EXE')) {
        // Git Bash has a known problem where the Node.js TTY is lost when invoked via an NPM binary script.
        // eslint-disable-next-line no-console
        console.error(
          Colorize.red(
            'ERROR: It appears that Rush was invoked from Git Bash shell, which does not support the\n' +
              'TTY mode for interactive input that is required by this feature.'
          ) +
            '\n\nKnown workarounds are:\n' +
            '- Invoke Rush using "winpty rush.cmd" instead of "rush"\n' +
            '- Or add this to your .bashrc:  alias rush="winpty rush.cmd"\n' +
            '- Or create a Git Bash shortcut icon that launches\n' +
            '  "C:\\Program Files\\Git\\bin\\bash.exe" instead of "git-bash.exe"\n\n' +
            'For details, refer to https://github.com/microsoft/rushstack/issues/3217'
        );
        throw new AlreadyReportedError();
      }
    }

    // eslint-disable-next-line no-console
    console.error(
      Colorize.red(
        'ERROR: Rush was invoked by a command whose STDIN does not support the TTY mode for\n' +
          'interactive input that is required by this feature.'
      ) + '\n\nTry invoking "rush" directly from your shell.'
    );
    throw new AlreadyReportedError();
  }

  private _uncaptureInput(): void {
    if (!this.#readlineInterface) {
      return;
    }

    this.stdin.removeListener('keypress', this.#onKeypress);
    this.stdin.setRawMode(false);
    this.#readlineInterface.close();
    this.#readlineInterface = undefined;
  }

  protected hideCursor(): void {
    if (this.#cursorHidden) {
      return;
    }
    this.#cursorHidden = true;
    this.stderr.write(ANSI_ESCAPE_SHOW_CURSOR);
  }

  protected unhideCursor(): void {
    if (!this.#cursorHidden) {
      return;
    }
    this.#cursorHidden = false;
    this.stderr.write(ANSI_ESCAPE_HIDE_CURSOR);
  }

  public async startAsync(): Promise<void> {
    try {
      this._captureInput();
      this.onStart();
      await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
        this.#resolvePromise = resolve;
        this.#rejectPromise = reject;
      });
    } finally {
      this._uncaptureInput();
      this.unhideCursor();
    }
  }

  protected resolveAsync(): void {
    if (!this.#resolvePromise) {
      return;
    }
    this.#resolvePromise();
    this.#resolvePromise = undefined;
    this.#rejectPromise = undefined;
  }

  protected rejectAsync(error: Error): void {
    if (!this.#rejectPromise) {
      return;
    }
    this.#rejectPromise(error);
    this.#resolvePromise = undefined;
    this.#rejectPromise = undefined;
  }

  /** @virtual */
  protected onStart(): void {}

  /** @virtual */
  protected onKeypress(character: string, key: readline.Key): void {}

  #onKeypress = (character: string, key: readline.Key): void => {
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
