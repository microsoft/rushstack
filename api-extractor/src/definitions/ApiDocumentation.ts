/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import TypeScriptHelpers from '../TypeScriptHelpers';
import ApiItem from './ApiItem';
import DocElementParser from '../DocElementParser';
import { IDocElement, IParam, IHrefLinkElement, ICodeLinkElement, ITextElement } from '../IDocElement';
import { IDocItem, IDocFunction } from '../IDocItem';
import DocItemLoader from '../DocItemLoader';
import { IApiDefinitionReference } from '../IApiDefinitionReference';
import Token from '../Token';
import Tokenizer from '../Tokenizer';

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
   * The docComment text string split into an array of ITokenItems.  The tokens are essentially either
   * JSDoc tags (which start with the "@" character) or substrings containing the
   * remaining text.  The array can be empty, but not undefined.
   * Example:
   * docComment       = "Example Function\n@returns the number of items\n@internal  "
   * docCommentTokens = [
   *  {tokenType: 'text', parameter: 'Example Function\n'},
   *  {tokenType: '\@returns', parameter: ''}
   *  {tokenType: 'text', parameter: 'the number of items\n'}
   *  {tokenType: '@internal', parameter: ''}
   * ];
   */
  public docCommentTokens: Token[];

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
   * Takes an API reference expression of the form '@scopeName/packageName:exportName.memberName'
   * and deconstructs it into an IApiDefinitionReference interface object.
   */
  public static parseApiReferenceExpression(
    apiReferenceExpr: string,
    reportError: (message: string) => void): IApiDefinitionReference {
    if (!apiReferenceExpr || apiReferenceExpr.split(' ').length > 1) {
      reportError('API reference expression must be of the form: ' +
        '\'scopeName/packageName:exportName.memberName | display text\'' +
        'where the \'|\' is required if a display text is provided');
      return;
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
       throw reportError(`Api reference expression contains invalid characters: ${apiReferenceExpr}`);
    }

    if (!apiReferenceExpr.match(ApiDocumentation._exportRegEx)) {
      throw reportError(`Api reference expression contains invalid characters: ${apiReferenceExpr}`);
    }

    return apiDefitionRef;
  }

  /**
   * For a scoped NPM package name this separates the scope and package parts.  For example:
   * parseScopedPackageName('@my-scope/myproject') = { scope: '@my-scope', package: 'myproject' }
   * parseScopedPackageName('myproject') = { scope: '', package: 'myproject' }
   */
  private static parseScopedPackageName(scopedName: string): IScopePackageName {
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
    this.parameters = new Map<string, IParam>();
    this._parseDocs();
  }

  protected _getJsDocs(apiItem: ApiItem): string {
    const sourceFile: ts.SourceFile = apiItem.getDeclaration().getSourceFile();
    let jsDoc: string = TypeScriptHelpers.getJsDocComments(apiItem.getDeclaration(), sourceFile);

    // Eliminate tags and then count the English letters.  Are there at least 10 letters of text?
    // If not, we consider the definition to be "missingDocumentation".
    const condensedDocs: string = jsDoc
      .replace(ApiDocumentation._jsdocTagsRegex, '')
      .replace(/[^a-z]/gi, '');
    this.isMissing = apiItem.shouldHaveDocumentation() && condensedDocs.length <= 10;

    return jsDoc;
  }

  protected _parseDocs(): void {
    const tokenizer: Tokenizer = new Tokenizer(this.docComment, this.reportError);
    this.summary = DocElementParser.parse(tokenizer, this.reportError);
    this.returnsMessage = [];
    this.deprecatedMessage = [];
    this.remarks = [];
    this.apiTag = ApiTag.None;

    let apiTagCount: number = 0;
    let parsing: boolean = true;

    while (parsing) {
      const token: Token = tokenizer.peekToken();
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

      if (token.type === 'Tag') {
        switch (token.tag) {
          case '@remarks':
            tokenizer.getToken();
            this._checkInheritDocStatus();
            this.remarks = DocElementParser.parse(tokenizer, this.reportError);
            break;
          case '@returns':
            tokenizer.getToken();
            this._checkInheritDocStatus();
            this.returnsMessage = DocElementParser.parse(tokenizer, this.reportError);
            break;
          case '@param':
            tokenizer.getToken();
            this._checkInheritDocStatus();
            const param: IParam = this._parseParam(tokenizer);
            if (param) {
               this.parameters[param.name] = param;
            }
            break;
          case '@deprecated':
            tokenizer.getToken();
            this.deprecatedMessage = DocElementParser.parse(tokenizer, this.reportError);
            if (!this.deprecatedMessage || this.deprecatedMessage.length === 0) {
              this.reportError(`deprecated description required after @deprecated JSDoc tag.`);
            }
            break;
          case '@internalremarks':
            // parse but discard
            tokenizer.getToken();
            DocElementParser.parse(tokenizer, this.reportError);
            break;
          case '@public':
            tokenizer.getToken();
            this.apiTag = ApiTag.Public;
            ++apiTagCount;
            break;
          case '@internal':
            tokenizer.getToken();
            this.apiTag = ApiTag.Internal;
            ++apiTagCount;
            break;
          case '@alpha':
            tokenizer.getToken();
            this.apiTag = ApiTag.Alpha;
            ++apiTagCount;
            break;
          case '@beta':
            tokenizer.getToken();
            this.apiTag = ApiTag.Beta;
            ++apiTagCount;
            break;
          case '@preapproved':
            tokenizer.getToken();
            this.preapproved = true;
            break;
          case '@readonly':
            tokenizer.getToken();
            this.readonly = true;
            break;
          case '@betadocumentation':
            tokenizer.getToken();
            this.isDocBeta = true;
            break;
          default:
            tokenizer.getToken();
            if (ApiDocumentation._allowedJsdocTags.indexOf(token.tag) < 0) {
              this.reportError(`The JSDoc tag \"${token.tag}\" is not allowed`);
              break;
            } else {
              this.reportError(`Error formatting token tag: ${token.tag}`);
              break;
            }
        }
      } else if (token.type === 'Inline') {
        switch (token.tag) {
          case '@inheritdoc':
            tokenizer.getToken();
            if (this.summary.length > 0) {
              this.reportError('Cannot provide summary in JsDoc if @inheritdoc tag is given');
            }
            this._parseInheritDoc(token);
            this.isDocInherited = true;
            break;
          case '@link':
            const linkDocElement: IHrefLinkElement | ICodeLinkElement = DocElementParser.parseLinkTag(
            tokenizer.getToken(),
            this.reportError);
            if (linkDocElement) {
              this.summary.push(linkDocElement);
            }
            break;
          default:
            tokenizer.getToken();
            this.reportError(`Unidentifiable inline token ${token.tag}`);
            break;
        }
      } else if (token.type === 'Text')  {
        tokenizer.getToken();
        this.reportError('Unexpected text. Text must either be the first sentences of the JSDoc, or if too long for ' +
        'the first 2-3 sentences the text must be preceded by a @internalremarks tag.');
      } else {
        tokenizer.getToken();
        this.reportError(`Unexpected token: ${token.type} ${token.tag} ${token.text}`);
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
   * The format for the \@inheritdoc tag is {\@inheritdoc scopeName/packageName:exportName.memberName}.
   * For more information on the format see IInheritdocRef.
   */
  protected _parseInheritDoc(token: Token): void {

    // Check to make sure the API definition reference is at most one string
    const tokenChunks: string[] = token.text.split(' ');
    if (tokenChunks.length > 1) {
      this.reportError('Too many parameters for @inheritdoc inline tag.' +
        'The format should be {@inheritdoc scopeName/packageName:exportName}. Extra parameters are ignored');
      return;
    }

    // Create the IApiDefinitionReference object
    // Deconstruct the API reference expression 'scopeName/packageName:exportName.memberName'
    const apiDefinitionRef: IApiDefinitionReference = ApiDocumentation.parseApiReferenceExpression(
      token.text,
      this.reportError
    );
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
        value: `See documentation for ${tokenChunks[0]}`
      } as ITextElement;
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

  protected _parseParam(tokenizer: Tokenizer): IParam {
        const paramDescriptionToken: Token = tokenizer.getToken();
        if (!paramDescriptionToken) {
          this.reportError('@param tag missing required description');
          return;
        }
        const hyphenIndex: number = paramDescriptionToken ? paramDescriptionToken.text.indexOf('-') : -1;
        if (hyphenIndex < 0) {
          this.reportError('No hyphens found in the @param line. ' +
              'There should be a hyphen between the parameter name and its description.');
          return;
        } else {
          const name: string = paramDescriptionToken.text.slice(0, hyphenIndex).trim();
          const comment: string = paramDescriptionToken.text.substr(hyphenIndex + 1).trim();

          if (!comment) {
            this.reportError('@param tag requires a description following the hyphen');
            return;
          }

          const commentTextElement: IDocElement = DocElementParser.makeTextElement(comment);
          // Full param description may contain additional Tokens (Ex: @link)
          const remainingElements: IDocElement[] = DocElementParser.parse(tokenizer, this.reportError);
          const descriptionElements: IDocElement[] = [commentTextElement].concat(remainingElements);

          const paramDocElement: IParam = {
              name: name,
              description: descriptionElements
          };
          return paramDocElement;
        }
    }

  private _checkInheritDocStatus(): void {
    if (this.isDocInherited) {
      this.reportError('Cannot provide additional JSDoc tags if @inheritdoc tag is present');
    }
  }
}
