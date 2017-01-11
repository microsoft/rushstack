/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import TypeScriptHelpers from '../TypeScriptHelpers';
import ApiItem from './ApiItem';
import DocElementParser from '../DocElementParser';
import { IDocElement, IParam } from '../IDocElement';
import { IDocItem, IDocFunction } from '../IDocItem';
import DocItemLoader from '../DocItemLoader';
import { IApiDefinitionReference } from '../IApiDefinitionReference';

/**
  * An "API Tag" is a custom JSDoc tag which indicates whether an ApiItem definition
  * is considered Public API for third party developers, as well as its release
  * stage (alpha, beta, etc).
  * @see https://onedrive.visualstudio.com/DefaultCollection/SPPPlat/_git/sp-client
  *      ?path=/common/docs/ApiPrinciplesAndProcess.md
  */
export enum ApiTag {
  /**
   * No API Tag was specified in the JSDoc summary.
   */
  None,
  /**
   * The API was documented as internal, i.e. not callable by third party developers.
   */
  Internal,
  /**
   * The API was documented as "alpha."  This status is not generally used.  See the
   * ApiPrinciplesAndProcess.md for details.
   */
  Alpha,
  /**
   * The API was documented as callable by third party developers, but at their own risk.
   * Web parts that call beta APIs should only be used for experimentation, because the Web Part
   * will break if Microsoft changes the API signature later.
   */
  Beta,
  /**
   * The API was documented as callable by third party developers, with a guarantee that Microsoft will
   * never make any breaking changes once the API is published.
   */
  Public
}

/**
 * A scope and package name are semantic information within an API reference expression.
 */
export interface IScopePackageName {
  /**
   * The scope name of an API reference expression.
   */
  scope: string;

  /**
   * The package name of an API reference expression.
   */
  package: string;
}

export default class ApiDocumentation {
  // For guidance about using these tags, please see this document:
  // https://onedrive.visualstudio.com/DefaultCollection/SPPPlat/_git/sp-client
  //    ?path=/common/docs/ApiPrinciplesAndProcess.md
  private static _allowedJsdocTags: string[] = [
    // (alphabetical order)
    '@alpha',
    '@beta',
    '@betadocumentation',
    '@inheritdoc',
    '@internal',
    '@internalremarks',
    '@link',
    '@param',
    '@preapproved',
    '@public',
    '@returns',
    '@see',
    '@summary',
    '@deprecated',
    '@readonly',
    '@remarks'
  ];

  /**
   * Match JsDoc block tags and inline tags
   * Example "@a @b@c d@e @f {whatever} {@link a} { @something } \@g" => ["@a", "@f", "{@link a}", "{ @something }"]
   */
  private static _jsdocTagsRegex: RegExp = /{\s*@(\\{|\\}|[^{}])*}|(?:^|\s)(\@[a-z_]+)(?=\s|$)/gi;

  /**
   * Splits an API reference expression into two parts, first part is the scopename/packageName and 
   * the second part is the exportName.memberName.
   */
  private static _packageRegEx: RegExp = /^([^:]*)\:(.*)$/;

  /**
   * Splits the exportName.memberName into two respective parts.
   */
  private static _memberRegEx: RegExp = /^([^.|:]*)(?:\.(\w+))?$/;

  /**
   * Used to ensure that the export name contains only text characters.
   */
  private static _exportRegEx: RegExp =  /^\w+/;

  /**
   * Corresponding ApiItem for this documentation object
   */
  public apiItem: ApiItem;

  /**
   * This returns the JSDoc comment block for the given item (without "/**" characters),
   * or an empty string if there is no comment.  This propery will never be undefined.
   *
   * Example: "Example Function\n@returns the number of items\n@internal"
   */
  public docComment: string;

  /**
   * The docComment text string split into an array of tokens.  The tokens are either
   * JSDoc tags (which start with the "@" character) or substrings containing the
   * remaining text.  The array can be empty, but not undefined.
   * Example:
   * docComment       = "Example Function\n@returns the number of items\n@internal  "
   * docCommentTokens = [ "Example Function\n", "@returns", "the number of items\n", "@internal", "  "]
   */
  public docCommentTokens: string[];

   /**
   * docCommentTokens that are parsed into Doc Elements.
   */
  public summary: IDocElement[];
  public deprecatedMessage: IDocElement[];
  public remarks: IDocElement[];
  public returnsMessage: IDocElement[];
  public parameters: Map<string, IParam>;

  /**
   * Indicates that this definition does not have adequate JSDoc comments.  If isMissing=true,
   * then this will be noted in the API file produced by ApiFileGenerator.  (The JSDoc
   * text itself is not included in that report, because documentation changes do not
   * require an API review, and thus should not cause a diff for that report.)
   */
  public isMissing: boolean;

  /**
   * An "API Tag" is a custom JSDoc tag which indicates whether this definition
   * is considered Public API for third party developers, as well as its release
   * stage (alpha, beta, etc).
   */
  public apiTag: ApiTag;

  /**
   * True if the "@preapproved" tag was specified.
   * Indicates that this internal API is exempt from further reviews.
   */
  public preapproved?: boolean;
  public deprecated?: string;
  public internalremarks?: string;
  public paramDocs?: Map<string, string>;
  public returns?: string;
  public see?: string[];
  public isDocBeta?: boolean;
  public isDocInherited?: boolean;
  public isDocInheritedDeprecated?: boolean;
  public isOverride?: boolean;
  public readonly?: boolean;

  public docItemLoader: DocItemLoader;
  public reportError: (message: string) => void;

  /**
   * For a scoped NPM package name this separates the scope and package parts.  For example:
   * parseScopedPackageName('@my-scope/myproject') = { scope: '@my-scope', package: 'myproject' }
   * parseScopedPackageName('myproject') = { scope: '', package: 'myproject' }
   */
  private  static parseScopedPackageName(scopedName: string): IScopePackageName {
    if (scopedName.substr(0, 1) !== '@') {
      return { scope: '', package: scopedName };
    }

    const slashIndex: number = scopedName.indexOf('/');
    if (slashIndex >= 0) {
      return { scope: scopedName.substr(0, slashIndex), package: scopedName.substr(slashIndex + 1) };
    } else {
      throw new Error('Invalid scoped name: ' + scopedName);
    }
  }

  constructor(apiItem: ApiItem, docItemLoader: DocItemLoader, errorLogger: (message: string) => void) {
    this.apiItem = apiItem;
    this.docItemLoader = docItemLoader;
    this.reportError = errorLogger;
    this.docComment = this._getJsDocs(apiItem);
    this.docCommentTokens = this._tokenizeDocs(this.docComment);
    this.parameters = new Map<string, IParam>();
    this._parseDocTokens(this.docCommentTokens);
  }

  protected _getJsDocs(apiItem: ApiItem): string {
    let jsdoc: string = '';
    const sourceFile: ts.SourceFile = apiItem.getDeclaration().getSourceFile();
    const comments: ts.CommentRange[] = TypeScriptHelpers.getJsDocComments(apiItem.getDeclaration(), sourceFile);
    if (comments) {
      for (const comment of comments) {
        const commentBody: string = sourceFile.text.substring(comment.pos, comment.end);
        jsdoc += TypeScriptHelpers.extractCommentContent(commentBody);
      }
    }

    // Eliminate tags and then count the English letters.  Are there at least 10 letters of text?
    // If not, we consider the definition to be "missingDocumentation".
    const condensedDocs: string = jsdoc
      .replace(ApiDocumentation._jsdocTagsRegex, '')
      .replace(/[^a-z]/gi, '');
    this.isMissing = apiItem.shouldHaveDocumentation() && condensedDocs.length <= 10;

    return jsdoc;
  }

  /**
   * Converts a JsDoc-like text block to an array of string tokens. Each token is either text, JsDocTag or inline tag
   * Example: "This is a JsDoc description with a {@link URL} and more text. @summary example @public"
   * => ["This is a JsDoc description with a", "{@link URL}", "and more text.", "@summary", "example", "@public"]
   */
  protected _tokenizeDocs(docs: string): string[] {
    const tokens: string[] = TypeScriptHelpers.splitStringWithRegEx(docs, ApiDocumentation._jsdocTagsRegex);
    return this._sanitizeDocTokens(tokens);
  }

  /**
   * Trims whitespaces on either end of the tokens, replaces \r and \n's with single whitespace, removes empty tokens
   * and checks for the following errors:
   * - Unsupported tags
   * - Unescaped { and }, which are only allowed for inline tags e.g. {@link URL}
   *
   * @param tokens - Array of token strings to be santitized
   */
  protected _sanitizeDocTokens(tokens: string[]): string[] {
    const result: string[] = [];
    for (let token of tokens) {
      token = token.replace(/(\\(r|n))+/gi, ' ');
      token = token.replace(/\s+/g, ' ');
      token = token.trim();

      if (token === '') {
        continue;
      }

      result.push(token);
    }

    return result;
  }

  protected _parseDocTokens(tokenStream: string[]): void {
    this.summary = DocElementParser.parse(tokenStream);
    this.returnsMessage = [];
    this.deprecatedMessage = [];
    this.remarks = [];
    this.apiTag = ApiTag.None;

    let apiTagCount: number = 0;
    let parsing: boolean = true;

    while (parsing) {
      const token: string = tokenStream.length === 0 ? undefined : tokenStream[0]; // peek
      if (!token) {
        parsing = false; // end of stream
        // Report error if @inheritdoc is deprecated but no @deprecated tag present here 
        if (this.isDocInheritedDeprecated && this.deprecatedMessage.length === 0) {
          // if this documentation inherits docs from a deprecated API item, then 
          // this documentation must either have a deprecated message or it must 
          // not use the @inheritdoc and copy+paste the documentation
          this.reportError(`Use of @inheritdoc API item reference that is deprecated. ` +
          'Either include @deprecated JSDoc with message on this item or remove the @inheritdoc tag ' +
          'and copy+paste the documentation.');
        }
        break;
      }

      switch (token) {
        case '@remarks':
          tokenStream.shift();
          this._checkInheritDocStatus();
          this.remarks = DocElementParser.parse(tokenStream);
          break;
        case '@returns':
          tokenStream.shift();
          this._checkInheritDocStatus();
          this.returnsMessage = DocElementParser.parse(tokenStream);
          break;
        case '@param':
          tokenStream.shift();
          this._checkInheritDocStatus();
          const param: IParam = this._parseParam(tokenStream);
          if (param) {
            this.parameters[param.name] = param;
          }
          break;
        case '@deprecated':
          tokenStream.shift();
          this.deprecatedMessage = DocElementParser.parse(tokenStream);
          if (!this.deprecatedMessage || this.deprecatedMessage.length === 0) {
            this.reportError(`deprecated description required after @deprecated JSDoc tag.`);
          }
          break;
        case '@internalremarks':
          // parse but discard
          tokenStream.shift();
          DocElementParser.parse(tokenStream);
          break;
        case '@public':
          tokenStream.shift();
          this.apiTag = ApiTag.Public;
          ++apiTagCount;
          break;
        case '@internal':
          tokenStream.shift();
          this.apiTag = ApiTag.Internal;
          ++apiTagCount;
          break;
        case '@alpha':
          tokenStream.shift();
          this.apiTag = ApiTag.Alpha;
          ++apiTagCount;
          break;
        case '@beta':
          tokenStream.shift();
          this.apiTag = ApiTag.Beta;
          ++apiTagCount;
          break;
        case '@preapproved':
          tokenStream.shift();
          this.preapproved = true;
          break;
        case '@readonly':
          tokenStream.shift();
          this.readonly = true;
          break;
        case '@summary':
          tokenStream.shift(); // consume the summary token
          break;
        case '@betadocumentation':
          tokenStream.shift();
          this.isDocBeta = true;
          break;
        default:
          tokenStream.shift();

          if (token.substr(0, 12) === '{@inheritdoc') {
            if (this.summary.length > 0) {
              this.reportError('Cannot provide summary in JsDoc if @inheritdoc tag is given');
            }
            this._parseInheritDoc(token);
            this.isDocInherited = true;
          } else if (token.charAt(0) === '@' && ApiDocumentation._allowedJsdocTags.indexOf(token) < 0) {
            this.reportError(`The JSDoc tag "${token}" is not allowed`);
          } else {
            console.log('Unexpected text: ' + token.toString());
          }
          break;
      }
    }

    if (apiTagCount > 1) {
      this.reportError('More than one API Tag was specified');
    }

    if (this.preapproved) {
      if (this.apiTag !== ApiTag.Internal) {
        this.reportError('The @preapproved tag may only be applied to @internal defintions');
        this.preapproved = false;
      } else if (!(this.apiItem.getDeclarationSymbol().flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.Class))) {
        this.reportError('The @preapproved tag may only be applied to classes and interfaces');
        this.preapproved = false;
      }
    }
  }

  /**
   * This method parses the semantic information in an \@inheritdoc JSDoc tag and sets
   * all the relevant documenation properties from the inherited doc onto the documenation 
   * of the current api item.
   * 
   * The format for the \@inheritdoc tag is {\@inheritdoc scopeName/packageName:exportName.memberName(s)}.
   * For more information on the format see IInheritdocRef.
   */
  protected _parseInheritDoc(tokenInline: string): void {
    // Enforce inheritdoc structure 
    if (tokenInline.charAt(0) !== '{' || tokenInline.charAt(tokenInline.length - 1) !== '}') {
      this.reportError('inheritdoc tags should be wrapped inside curly braces.');
      return;
    }
    const tokenContent: string = tokenInline.slice(1, tokenInline.length - 1).trim();

    const tokenChunks: string[] = tokenContent.split(' ');
    if (tokenChunks.length > 2) {
      this.reportError('Too many parameters for @inheritdoc inline tag.' +
        'The format should be {@inheritdoc scopeName/packageName:exportName}. Extra parameters are ignored');
      return;
    } else if (tokenChunks.length < 1) {
      this.reportError('Too few parameters for @inheritdoc inline tag.');
      return;
    }

    // Create the IApiDefinitionReference object 
    // Deconstruct the API reference expression 'scopeName/packageName:exportName.memberName' 
    const apiDefinitionRef: IApiDefinitionReference = this._parseApiReferenceExpression(tokenChunks[1]);
    // if API reference expression is formatted incorrectly then apiDefinitionRef will be undefined
    if (!apiDefinitionRef) {
      return;
    }

    // Atempt to locate the apiDefinitionRef
    const inheritedDoc: IDocItem = this.docItemLoader.getItem(apiDefinitionRef);

    // If no IDocItem found then nothing to inherit
    // But for the time being set the summary to a text object 
    if (!inheritedDoc) {
      const textDocItem: IDocElement = {
        kind: 'textDocElement',
        value: `See documentation for ${tokenChunks[1]}`
      };
      this.summary = [textDocItem];
      return;
    }

    // inheritdoc found, copy over IDocBase properties 
    this.summary =  inheritedDoc.summary;
    this.remarks = inheritedDoc.remarks;

    // Copy over detailed properties if neccessary
    // Add additional cases if needed 
    switch (inheritedDoc.kind) {
      case 'function':
        this.parameters = (inheritedDoc as IDocFunction).parameters;
        this.returnsMessage = (inheritedDoc as IDocFunction).returnValue.description;
        break;
    }

    // Check if inheritdoc is depreacted 
    // We need to check if this documentation has a deprecated message 
    // but it may not appear until after this token.
    this.isDocInheritedDeprecated = inheritedDoc.deprecatedMessage.length > 0 ? true : false;
  }

  /**
   * Takes an API reference expression of the form '@scopeName/packageName:exportName.memberName'
   * and deconstructs it into an IApiDefinitionReference interface object. 
   */
  protected _parseApiReferenceExpression(apiReferenceExpr: string): IApiDefinitionReference {
    if (!apiReferenceExpr) {
      this.reportError('API reference expression must be of the form: scopeName/packageName:exportName.memberName(s)');
      return undefined;
    }

    const apiDefitionRef: IApiDefinitionReference = { scopeName: '', packageName: '', exportName: '', memberName: ''};
    let parts: string[];

    // E.g. @microsoft/sp-core-library:Guid.equals
    parts = apiReferenceExpr.match(ApiDocumentation._packageRegEx);
    if (parts) {
      // parts[1] is of the form ‘@microsoft/sp-core-library’ or ‘sp-core-library’
      const scopePackageName: IScopePackageName = ApiDocumentation.parseScopedPackageName(parts[1]);
      apiDefitionRef.scopeName = scopePackageName.scope;
      apiDefitionRef.packageName = scopePackageName.package;
      apiReferenceExpr = parts[2]; // e.g. Guid.equals
    }

    // E.g. Guid.equals
    parts = apiReferenceExpr.match(ApiDocumentation._memberRegEx);
    if (parts) {
      apiDefitionRef.exportName = parts[1]; // e.g. Guid, can never be undefined
      apiDefitionRef.memberName = parts[2] ? parts[2] : ''; // e.g. equals
    } else {
      // the export name is required 
       throw this.reportError(`Api reference expression contains invalid characters: ${apiReferenceExpr}`);
    }

    if (!apiReferenceExpr.match(ApiDocumentation._exportRegEx)) {
      throw this.reportError(`Api reference expression contains invalid characters: ${apiReferenceExpr}`);
    }

    return apiDefitionRef;
  }

  protected _parseParam(tokenStream: string[]): IParam {
        const paramToken: string = tokenStream.shift();
        const hyphenIndex: number = paramToken ? paramToken.indexOf('-') : -1;
        if (!paramToken || paramToken.charAt(0) === '@') {
            this.reportError(`The documentation tag @param is missing required description.`);
        } else if (hyphenIndex < 0) {
            this.reportError('No hyphens found in the @param line. ' +
              'There should be a hyphen between the parameter name and its description.');
        } else {
            const name: string = paramToken.slice(0, hyphenIndex).trim();
            const comment: string = paramToken.substr(hyphenIndex + 1).trim();
            const commentTokens: string[] = this._tokenizeDocs(comment);
            tokenStream = commentTokens.concat(tokenStream);

            const paramDocElement: IParam = {
                name: name,
                description: DocElementParser.parse(tokenStream)
            };
            return paramDocElement;
        }
    }

  /**
   * Parse an inline tag and returns the output string for it
   * Example '{@link https://bing.com Bing}' => '{@link https://bing.com Bing}'
   *
   * @internalremarks Right now this is just returning the escaped input back, but we might need to
   * change this to return markdown
   */
  protected _parseDocsInline(token: string): string {
    if (token.charAt(0) !== '{' || token.charAt(token.length - 1) !== '}') {
      this.reportError('All inline tags should be wrapped inside curly braces.');
      return '';
    }
    const tokenContent: string = token.slice(1, token.length - 1).trim();

    if (tokenContent.charAt(0) !== '@') {
      this.reportError('Content of inline tags should start with a leading \'@\'.');
      return '';
    }

    const unescapedCurlyBraces: RegExp = /([^\\])({|}[^$])/gi;
    if (unescapedCurlyBraces.test(tokenContent)) {
      this.reportError(`Unescaped '{' or '}' detected inside an inline tag. ` +
        'Use \\ to escape curly braces inside inline tags.');
      return '';
    }

    // Split the inline tag content with whitespace
    // Example: '@link    https://bing.com    Bing' => ['@link', 'https://bing.com', 'Bing']
    const tokenChunks: string[] = tokenContent.split(/\s+/gi);
    if (tokenChunks[0] === '@link') {
      if (tokenChunks.length > 3) {
        this.reportError('Too many parameters for @link inline tag.' +
          'The format should be {@link URL [text]}. Extra parameters are ignored');
          return '';
      } else if (tokenChunks.length < 2) {
        this.reportError('Too few parameters for @link inline tag.');
        return '';
      }
      const url: string = tokenChunks[1];
      let result: string = `{@link ${url}`;
      const text: string = this._unescapeCurlyBraces(tokenChunks[2]);
      if (text) {
        result += ` ${text}`;
      }
      result += '}';
      return result;
    }

    this.reportError('Unknown tag name for inline tag.');
    return '';
  }

  /**
   * Validates that a description follows the tagName.
   *
   * If you provide a tag name, then there should be a description after the tagName, otherwise
   * will throw an error.
   */
  protected _parseDocsBlock(tokens: string[], startingIndex: number = 0, tagName?: string): string {
    let result: string = '';
    for (let i: number = startingIndex; i < tokens.length; i++) {
      if (tokens[i].charAt(0) === '@') {
        break;
      } else if (tokens[i].charAt(0) === '{') {
        // inline tag token
        result += this._parseDocsInline(tokens[i]);
      } else {
        const text: string = this._unescapeAtSign(tokens[i]);
        result += `${text} `;
      }
    }

    result = result.trim();

    if (result === '' && tagName) {
      this.reportError(`The documentation tag ${tagName} is missing required description.`);
    }

    return result;
  }

  private _unescapeCurlyBraces(text: string): string {
    return text ? text.replace('\\{', '{').replace('\\}', '}') : undefined;
  }

  private _unescapeAtSign(text: string): string {
    return text ? text.replace('\\@', '@') : undefined;
  }

  private _checkInheritDocStatus(): void {
    if (this.isDocInherited) {
      this.reportError('Cannot provide additional JSDoc tags if @inheritdoc tag is present');
    }
  }
}
