// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBuilder, type IStringBuilder } from '@rushstack/node-core-library';

/**
 * A utility for writing indented text.
 *
 * @remarks
 *
 * Note that the indentation is inserted at the last possible opportunity.
 * For example, this code...
 *
 * ```ts
 *   writer.write('begin\n');
 *   writer.increaseIndent();
 *   writer.write('one\ntwo\n');
 *   writer.decreaseIndent();
 *   writer.increaseIndent();
 *   writer.decreaseIndent();
 *   writer.write('end');
 * ```
 *
 * ...would produce this output:
 *
 * ```
 *   begin
 *     one
 *     two
 *   end
 * ```
 */
export class IndentedWriter {
  /**
   * The text characters used to create one level of indentation.
   * Two spaces by default.
   */
  public defaultIndentPrefix: string = '  ';

  readonly #builder: IStringBuilder;

  #latestChunk: string | undefined;
  #previousChunk: string | undefined;
  #atStartOfLine: boolean;

  readonly #indentStack: string[];
  #indentText: string;

  #beforeStack: string[];
  #isWritingBeforeStack: boolean;

  public constructor(builder?: IStringBuilder) {
    this.#builder = builder === undefined ? new StringBuilder() : builder;

    this.#latestChunk = undefined;
    this.#previousChunk = undefined;
    this.#atStartOfLine = true;

    this.#indentStack = [];
    this.#indentText = '';

    this.#beforeStack = [];
    this.#isWritingBeforeStack = false;
  }

  /**
   * Retrieves the output that was built so far.
   */
  public getText(): string {
    return this.#builder.toString();
  }

  public toString(): string {
    return this.getText();
  }

  /**
   * Increases the indentation.  Normally the indentation is two spaces,
   * however an arbitrary prefix can optional be specified.  (For example,
   * the prefix could be "// " to indent and comment simultaneously.)
   * Each call to IndentedWriter.increaseIndent() must be followed by a
   * corresponding call to IndentedWriter.decreaseIndent().
   */
  public increaseIndent(indentPrefix?: string): void {
    this.#indentStack.push(indentPrefix !== undefined ? indentPrefix : this.defaultIndentPrefix);
    this.#updateIndentText();
  }

  /**
   * Decreases the indentation, reverting the effect of the corresponding call
   * to IndentedWriter.increaseIndent().
   */
  public decreaseIndent(): void {
    this.#indentStack.pop();
    this.#updateIndentText();
  }

  /**
   * A shorthand for ensuring that increaseIndent()/decreaseIndent() occur
   * in pairs.
   */
  public indentScope(scope: () => void, indentPrefix?: string): void {
    this.increaseIndent(indentPrefix);
    scope();
    this.decreaseIndent();
  }

  /**
   * Adds a newline if the file pointer is not already at the start of the line (or start of the stream).
   */
  public ensureNewLine(): void {
    const lastCharacter: string = this.peekLastCharacter();
    if (lastCharacter !== '\n' && lastCharacter !== '') {
      this.#writeNewLine();
    }
  }

  /**
   * Adds up to two newlines to ensure that there is a blank line above the current line.
   */
  public ensureSkippedLine(): void {
    if (this.peekLastCharacter() !== '\n') {
      this.#writeNewLine();
    }

    const secondLastCharacter: string = this.peekSecondLastCharacter();
    if (secondLastCharacter !== '\n' && secondLastCharacter !== '') {
      this.#writeNewLine();
    }
  }

  /**
   * Returns the last character that was written, or an empty string if no characters have been written yet.
   */
  public peekLastCharacter(): string {
    if (this.#latestChunk !== undefined) {
      return this.#latestChunk.substr(-1, 1);
    }
    return '';
  }

  /**
   * Returns the second to last character that was written, or an empty string if less than one characters
   * have been written yet.
   */
  public peekSecondLastCharacter(): string {
    if (this.#latestChunk !== undefined) {
      if (this.#latestChunk.length > 1) {
        return this.#latestChunk.substr(-2, 1);
      }
      if (this.#previousChunk !== undefined) {
        return this.#previousChunk.substr(-1, 1);
      }
    }
    return '';
  }

  /**
   * Writes `before` and `after` messages if and only if `mayWrite` writes anything.
   *
   * If `mayWrite` writes "CONTENT", this method will write "<before>CONTENT<after>".
   * If `mayWrite` writes nothing, this method will write nothing.
   */
  public writeTentative(before: string, after: string, mayWrite: () => void): void {
    this.#beforeStack.push(before);

    // If this function writes anything, then _all_ messages in the "before stack" will also be
    // written. This means that the stack will be empty (as when we write a message from the stack,
    // we remove it from the stack).
    mayWrite();

    // If the stack is not empty, it means that `mayWrite` didn't write anything. Pop the last-
    // added message from the stack, we'll never write it. Otherwise, if the stack is empty, then
    // write the "after" message.
    if (this.#beforeStack.length > 0) {
      this.#beforeStack.pop();
    } else {
      this.write(after);
    }
  }

  /**
   * Writes some text to the internal string buffer, applying indentation according
   * to the current indentation level.  If the string contains multiple newlines,
   * each line will be indented separately.
   */
  public write(message: string): void {
    if (message.length === 0) {
      return;
    }

    if (!this.#isWritingBeforeStack) {
      this.#writeBeforeStack();
    }

    // If there are no newline characters, then append the string verbatim
    if (!/[\r\n]/.test(message)) {
      this.#writeLinePart(message);
      return;
    }

    // Otherwise split the lines and write each one individually
    let first: boolean = true;
    for (const linePart of message.split('\n')) {
      if (!first) {
        this.#writeNewLine();
      } else {
        first = false;
      }
      if (linePart) {
        this.#writeLinePart(linePart.replace(/[\r]/g, ''));
      }
    }
  }

  /**
   * A shorthand for writing an optional message, followed by a newline.
   * Indentation is applied following the semantics of IndentedWriter.write().
   */
  public writeLine(message: string = ''): void {
    if (message.length > 0) {
      this.write(message);
    } else if (!this.#isWritingBeforeStack) {
      this.#writeBeforeStack();
    }

    this.#writeNewLine();
  }

  /**
   * Writes a string that does not contain any newline characters.
   */
  #writeLinePart(message: string): void {
    if (message.length > 0) {
      if (this.#atStartOfLine && this.#indentText.length > 0) {
        this.#write(this.#indentText);
      }
      this.#write(message);
      this.#atStartOfLine = false;
    }
  }

  #writeNewLine(): void {
    if (this.#atStartOfLine && this.#indentText.length > 0) {
      this.#write(this.#indentText);
    }

    this.#write('\n');
    this.#atStartOfLine = true;
  }

  #write(s: string): void {
    this.#previousChunk = this.#latestChunk;
    this.#latestChunk = s;
    this.#builder.append(s);
  }

  /**
   * Writes all messages in our before stack, processing them in FIFO order. This stack is
   * populated by the `writeTentative` method.
   */
  #writeBeforeStack(): void {
    this.#isWritingBeforeStack = true;

    for (const message of this.#beforeStack) {
      this.write(message);
    }

    this.#isWritingBeforeStack = false;
    this.#beforeStack = [];
  }

  #updateIndentText(): void {
    this.#indentText = this.#indentStack.join('');
  }
}
