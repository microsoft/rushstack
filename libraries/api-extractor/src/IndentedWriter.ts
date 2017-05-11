
/**
  * A utility for writing indented text.  In the current implementation,
  * IndentedWriter builds up an internal string buffer, which can be obtained
  * by calling IndentedWriter.getOutput().
  *
  * Note that the indentation is inserted at the last possible opportunity.
  * For example, this code...
  *
  *   writer.write('begin\n');
  *   writer.increaseIndent();
  *   writer.Write('one\ntwo\n');
  *   writer.decreaseIndent();
  *   writer.increaseIndent();
  *   writer.decreaseIndent();
  *   writer.Write('end');
  *
  * ...would produce this output:
  *
  *   begin
  *     one
  *     two
  *   end
  */
export default class IndentedWriter {
  private _output: string = '';
  private _indentStack: string[] = [];
  private _indentText: string = '';
  private _needsIndent: boolean = true;

  /**
   * Retrieves the indented output.
   */
  public toString(): string {
    return this._output;
  }

  /**
   * Increases the indentation.  Normally the indentation is two spaces,
   * however an arbitrary prefix can optional be specified.  (For example,
   * the prefix could be "// " to indent and comment simultaneously.)
   * Each call to IndentedWriter.increaseIndent() must be followed by a
   * corresponding call to IndentedWriter.decreaseIndent().
   */
  public increaseIndent(prefix: string = '  '): void {
    this._indentStack.push(prefix);
    this._updateIndentText();
  }

  /**
   * Decreases the indentation, reverting the effect of the corresponding call
   * to IndentedWriter.increaseIndent().
   */
  public decreaseIndent(): void {
    this._indentStack.pop();
    this._updateIndentText();
  }

  /**
   * A shorthand for ensuring that increaseIndent()/decreaseIndent() occur
   * in pairs.
   */
  public indentScope(scope: () => void): void {
    this.increaseIndent();
    scope();
    this.decreaseIndent();
  }

  /**
   * Writes some text to the internal string buffer, applying indentation according
   * to the current indentation level.  If the string contains multiple newlines,
   * each line will be indented separately.
   */
  public write(message: string): void {
    let first: boolean = true;
    for (const linePart of message.split('\n')) {
      if (!first) {
        this._writeNewLine();
      } else {
        first = false;
      }
      if (linePart) {
        this._writeLinePart(linePart);
      }
    }
  }

  /**
   * A shorthand for writing an optional message, followed by a newline.
   * Indentation is applied following the semantics of IndentedWriter.write().
   */
  public writeLine(message: string = ''): void {
    this.write(message + '\n');
  }

  /**
   * Writes a string that does not contain any newline characters.
   */
  private _writeLinePart(message: string): void {
    if (this._needsIndent) {
      this._output += this._indentText;
      this._needsIndent = false;
    }
    this._output += message.replace(/\r/g, '');
  }

  private _writeNewLine(): void {
    this._output += '\n';
    this._needsIndent = true;
  }

  private _updateIndentText(): void {
    this._indentText = this._indentStack.join('');
  }
}
