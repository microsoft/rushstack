import { TextRange, ITextLocation } from './TextRange';

/**
 * An Error subclass used to report errors that occur while parsing an input.
 */
export class ParseError extends Error {
  /**
   * The text range where the error occurred.
   */
  public readonly range: TextRange;

  /**
   * The message string passed to the constructor, before the line/column
   * numbering information was added.
   */
  public readonly unformattedMessage: string;

  /**
   * The underlying error, if this error is resulted from an earlier error.
   */
  public readonly innerError: Error | undefined;

  /**
   * Generates a line/column prefix.  Example with line=2 and column=5
   * and message="An error occurred":
   * ```
   * "(2,5): An error occurred"
   * ```
   */
  private static _formatMessage(message: string, range: TextRange): string {
    if (!message) {
      message = 'An unknown error occurred';
    }

    if (range.pos !== 0 || range.end !== 0) {
      const location: ITextLocation = range.getLocation(range.pos);
      if (location.line) {
        return `(${location.line},${location.column}): ` + message;
      }
    }
    return message;
  }

  public constructor(message: string, range: TextRange, innerError?: Error) {
    super(ParseError._formatMessage(message, range));

    // Boilerplate for extending a system class
    //
    // tslint:disable-next-line:max-line-length
    // https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work
    //
    // IMPORTANT: The prototype must also be set on any classes which extend this one
    (this as any).__proto__ = ParseError.prototype; // tslint:disable-line:no-any

    this.unformattedMessage = message;

    this.range = range;
    this.innerError = innerError;
  }
}
