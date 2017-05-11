import Token, { TokenType } from './Token';
import TypeScriptHelpers from './TypeScriptHelpers';

/**
 * Handles the tokenization of a JSDoc comment.
 */
export default class Tokenizer {

  /**
   * Match JsDoc block tags and inline tags
   * Example "@a @b@c d@e @f {whatever} {@link a} { @something } \@g" => ["@a", "@f", "{@link a}", "{ @something }"]
   */
  private static _jsdocTagsRegex: RegExp = /{\s*@(\\{|\\}|[^{}])*}|(?:^|\s)(\@[a-z_]+)(?=\s|$)/gi;

  /**
   * List of Tokens that have been tokenized.
   */
  private _tokenStream: Token[];

  private _reportError: (message: string) => void;

  constructor(docs: string, reportError: (message: string) => void) {
    this._reportError = reportError;
    this._tokenStream = this._tokenizeDocs(docs);
  }

  /**
   * Converts a doc comment string into an array of Tokens. This processing is done so that docs
   * can be processed more strictly.
   * Example: "This is a JsDoc description with a {@link URL} and more text. \@summary example \@public"
   * => [
   *  {tokenType: 'text', parameter: 'This is a JsDoc description with a'},
   *  {tokenType: '@link', parameter: 'URL'},
   *  {tokenType: '\@summary', parameter: ''},
   *  {tokenType: 'text', parameter: 'example'},
   *  {tokenType: '\@public', parameter: ''}
   * ]
   */
  protected _tokenizeDocs(docs: string): Token[] {
    if (!docs) {
      return;
    }
    const docEntries: string[] = TypeScriptHelpers.splitStringWithRegEx(docs, Tokenizer._jsdocTagsRegex);
    const sanitizedTokens: string[] =  this._sanitizeDocEntries(docEntries); // remove white space and empty entries

    // process each sanitized doc string to a Token object
    const tokens: Token[] = [];
    let value: string;
    for (let i: number = 0; i < sanitizedTokens.length; i++) {
      let token: Token;
      value = sanitizedTokens[i];
      if (value.charAt(0) === '@') {
       token = new Token(TokenType.Tag, value);
      } else if (value.charAt(0) === '{' && value.charAt(value.length - 1) === '}') {
        token = this._tokenizeInline(value); // Can return undefined if invalid inline tag
      } else {
        token = new Token(TokenType.Text, '', value);
      }

      if (token) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Parse an inline tag and returns the Token for it if itis a valid inline tag.
   * Example '{@link https://bing.com | Bing}' => '{type: 'Inline', tag: '@link', text: 'https://bing.com  | Bing'}'
   */
  protected _tokenizeInline(docEntry: string): Token {
    if (docEntry.charAt(0) !== '{' || docEntry.charAt(docEntry.length - 1) !== '}') {
      this._reportError('All inline tags should be wrapped inside curly braces.');
      return;
    }
    const tokenContent: string = docEntry.slice(1, docEntry.length - 1).trim();

    if (tokenContent.charAt(0) !== '@') {
      this._reportError('Content of inline tags should start with a leading \'@\'.');
      return;
    }

    const unescapedCurlyBraces: RegExp = /([^\\])({|}[^$])/gi;
    if (unescapedCurlyBraces.test(tokenContent)) {
      this._reportError(`Unescaped '{' or '}' detected inside an inline tag. ` +
        'Use \\ to escape curly braces inside inline tags.');
      return;
    }

    // Split the inline tag content with whitespace
    // Example: '@link    https://bing.com  |  Bing' => ['@link', 'https://bing.com', '|', 'Bing']
    const tokenChunks: string[] = tokenContent.split(/\s+/gi);
    if (tokenChunks[0] === '@link') {
      if (tokenChunks.length < 2) {
        this._reportError('Too few parameters for @link inline tag.');
        return;
      }

      tokenChunks.shift(); // Gets rid of '@link'
      const token: Token = new Token(TokenType.Inline, '@link', tokenChunks.join(' '));
      return token;
    } else if (tokenChunks[0] === '@inheritdoc') {
      tokenChunks.shift(); // Gets rid of '@inheritdoc'
      const token: Token = new Token(TokenType.Inline, '@inheritdoc', tokenChunks.join(' '));
      return token;
    }

    this._reportError('Unknown tag name for inline tag.');
    return;
  }

  public peekToken(): Token {
    return (!this._tokenStream || this._tokenStream.length === 0) ? undefined : this._tokenStream[0];
  }

  public getToken(): Token {
    return (!this._tokenStream || this._tokenStream.length === 0) ? undefined : this._tokenStream.shift();
  }

  /**
   * Trims whitespaces on either end of the entry (which is just a string within the doc comments),
   * replaces \r and \n's with single whitespace, and removes empty entries.
   *
   * @param docEntries - Array of doc strings to be santitized
   */
  private _sanitizeDocEntries(docEntries: string[]): string[] {
    const result: string[] = [];
    for (let entry of docEntries) {
      entry = entry.replace(/\s+/g, ' ');
      entry = entry.trim();

      if (entry === '') {
        continue;
      }
      result.push(entry);
    }

    return result;
  }
}
