// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBuilder } from '@microsoft/tsdoc';

/**
 * Helper class used by MarkdownEmitter
 */
export class SimpleWriter {
  private _builder: StringBuilder;
  private _latestChunk: string | undefined = undefined;
  private _previousChunk: string | undefined = undefined;

  public constructor(builder: StringBuilder) {
    this._builder = builder;
  }

  public write(s: string): void {
    if (s.length > 0) {
      this._previousChunk = this._latestChunk;
      this._latestChunk = s;
      this._builder.append(s);
    }
  }

  public writeLine(s: string = ''): void {
    this.write(s);
    this.write('\n');
  }

  /**
   * Adds a newline if the file pointer is not already at the start of the line
   */
  public ensureNewLine(): void {
    if (this.peekLastCharacter() !== '\n') {
      this.write('\n');
    }
  }

  /**
   * Adds up to two newlines to ensure that there is a blank line above the current line.
   */
  public ensureSkippedLine(): void {
    this.ensureNewLine();
    if (this.peekSecondLastCharacter() !== '\n') {
      this.write('\n');
    }
  }

  public peekLastCharacter(): string {
    if (this._latestChunk !== undefined) {
      return this._latestChunk.substr(-1, 1);
    }
    return '';
  }

  public peekSecondLastCharacter(): string {
    if (this._latestChunk !== undefined) {
      if (this._latestChunk.length > 1) {
        return this._latestChunk.substr(-2, 1);
      }
      if (this._previousChunk !== undefined) {
        return this._previousChunk.substr(-1, 1);
      }
    }
    return '';
  }

  public toString(): string {
    return this._builder.toString();
  }
}
