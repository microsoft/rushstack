// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as readline from 'readline';
import * as process from 'process';

import { KeyboardLoop } from './KeyboardLoop';

class YesNoKeyboardLoop extends KeyboardLoop {
  public readonly options: IPromptYesNoOptions;
  public result: boolean | undefined = undefined;

  public constructor(options: IPromptYesNoOptions) {
    super();
    this.options = options;
  }

  protected onStart(): void {
    this.stderr.write('==> ');
    this.stderr.write(this.options.question);
    switch (this.options.defaultValue) {
      case true:
        this.stderr.write(' (Y/n) ');
        break;
      case false:
        this.stderr.write(' (y/N) ');
        break;
      default:
        this.stderr.write(' (y/n) ');
        break;
    }
  }

  protected onKeypress(character: string, key: readline.Key): void {
    if (this.result !== undefined) {
      return;
    }

    switch (key.name) {
      case 'y':
        this.result = true;
        break;
      case 'n':
        this.result = false;
        break;
      case 'enter':
      case 'return':
        if (this.options.defaultValue !== undefined) {
          this.result = this.options.defaultValue;
        }
        break;
    }

    if (this.result !== undefined) {
      this.stderr.write(this.result ? 'Yes\n' : 'No\n');
      this.resolveAsync();
      return;
    }
  }
}

class PasswordKeyboardLoop extends KeyboardLoop {
  private readonly _options: IPromptLineOptions;
  private _startX: number = 0;
  private _printedY: number = 0;

  public result: string = '';

  public constructor(options: IPromptLineOptions) {
    super();
    this._options = options;
  }

  private _getLineWrapWidth(): number {
    // +1 is needed because the shell doesn't wrap until the next column beyond the end of the line
    return (this.stderr.columns ? this.stderr.columns : 80) + 1;
  }

  protected onStart(): void {
    this.result = '';

    readline.cursorTo(this.stderr, 0);
    readline.clearLine(this.stderr, 1);
    const prefix: string = `==> ${this._options.question} `;

    this.stderr.write(prefix);
    let n: number = prefix.lastIndexOf('\n');
    if (n < 0) {
      n = 0;
    }
    this._startX = (prefix.length - n) % this._getLineWrapWidth();
  }

  protected onKeypress(character: string, key: readline.Key): void {
    switch (key.name) {
      case 'enter':
      case 'return':
        this.stderr.write('\n');
        this.resolveAsync();
        return;
      case 'backspace':
        this.result = this.result.substring(0, this.result.length - 1);
    }

    let printable: boolean = true;
    if (character === '') {
      printable = false;
    } else if (key.name && key.name.length !== 1 && key.name !== 'space') {
      printable = false;
    } else if (!key.name && !key.sequence) {
      printable = false;
    }

    if (printable) {
      //this.stderr.write('*');
      this.result += character;
    }

    // Restore Y
    while (this._printedY > 0) {
      readline.cursorTo(this.stderr, 0);
      readline.clearLine(this.stderr, 1);
      readline.moveCursor(this.stderr, 0, -1);
      --this._printedY;
    }

    // Restore X
    readline.cursorTo(this.stderr, this._startX);

    // Write the output, substituting "*" for characters
    this.stderr.write('*'.repeat(this.result.length));

    readline.clearLine(this.stderr, 1);

    this._printedY = Math.floor((this.result.length + this._startX) / this._getLineWrapWidth());
  }
}

interface IPromptYesNoOptions {
  question: string;
  defaultValue?: boolean | undefined;
}

interface IPromptLineOptions {
  question: string;
}

export class TerminalInput {
  private static async _readLine(): Promise<string> {
    const readlineInterface: readline.Interface = readline.createInterface({ input: process.stdin });
    try {
      return await new Promise((resolve, reject) => {
        readlineInterface.question('', (answer: string) => {
          resolve(answer);
        });
      });
    } finally {
      readlineInterface.close();
    }
  }

  public static async promptYesNo(options: IPromptYesNoOptions): Promise<boolean> {
    const keyboardLoop: YesNoKeyboardLoop = new YesNoKeyboardLoop(options);
    await keyboardLoop.startAsync();
    return keyboardLoop.result!;
  }

  public static async promptLine(options: IPromptLineOptions): Promise<string> {
    const stderr: NodeJS.WriteStream = process.stderr;
    stderr.write('==> ');
    stderr.write(options.question);
    stderr.write(' ');
    return await TerminalInput._readLine();
  }

  public static async promptPasswordLine(options: IPromptLineOptions): Promise<string> {
    const keyboardLoop: PasswordKeyboardLoop = new PasswordKeyboardLoop(options);
    await keyboardLoop.startAsync();
    return keyboardLoop.result;
  }
}
