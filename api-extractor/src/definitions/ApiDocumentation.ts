/* tslint:disable:no-bitwise */

import ApiItem, { ApiItemKind } from './ApiItem';
import ApiPackage from './ApiPackage';
import DocElementParser from '../DocElementParser';
import { IDocElement, IParam, ICodeLinkElement } from '../IDocElement';
import { IDocItem } from '../IDocItem';
import ApiDefinitionReference, { IApiDefinintionReferenceParts } from '../ApiDefinitionReference';
import Token, { TokenType } from '../Token';
import Tokenizer from '../Tokenizer';
import Extractor from '../Extractor';
import ResolvedApiItem from '../ResolvedApiItem';

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
  None = 0,
  /**
   * The API was documented as internal, i.e. not callable by third party developers.
   */
  Internal = 1,
  /**
   * The API was documented as "alpha."  This status is not generally used.  See the
   * ApiPrinciplesAndProcess.md for details.
   */
  Alpha = 2,
  /**
   * The API was documented as callable by third party developers, but at their own risk.
   * Web parts that call beta APIs should only be used for experimentation, because the Web Part
   * will break if Microsoft changes the API signature later.
   */
  Beta = 3,
  /**
   * The API was documented as callable by third party developers, with a guarantee that Microsoft will
   * never make any breaking changes once the API is published.
   */
  Public = 4
}

/**
 * A dependency for ApiDocumentation constructor that abstracts away the function 
 * of resolving an API definition reference.
 * 
 * @internalremarks reportError() will be called if the apiDefinitionRef is to a non local 
 * item and the package of that non local item can not be found. 
 * If there is no package given and an  item can not be found we will return undefined. 
 * Once we support local references, we can be sure that reportError will only be 
 * called once if the item can not be found (and undefined will be retured by the reference 
 * function).
 */
export interface IReferenceResolver {
  resolve(
    apiDefinitionRef: ApiDefinitionReference,
    apiPackage: ApiPackage,
    reportError: (message: string) => void): ResolvedApiItem;
}

export default class ApiDocumentation {
  /**
   * Match JsDoc block tags and inline tags
   * Example "@a @b@c d@e @f {whatever} {@link a} { @something } \@g" => ["@a", "@f", "{@link a}", "{ @something }"]
   */
  public static readonly _jsdocTagsRegex: RegExp = /{\s*@(\\{|\\}|[^{}])*}|(?:^|\s)(\@[a-z_]+)(?=\s|$)/gi;

  // For guidance about using these tags, please see this document:
  // https://onedrive.visualstudio.com/DefaultCollection/SPPPlat/_git/sp-client
  //    ?path=/common/docs/ApiPrinciplesAndProcess.md
  private static _allowedRegularJsdocTags: string[] = [
    // (alphabetical order)
    '@alpha',
    '@beta',
    '@betadocumentation',
    '@internal',
    '@internalremarks',
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

  private static _allowedInlineJsdocTags: string[] = [
    // (alphabetical order)
    '@inheritdoc',
    '@link'
  ];

  /**
   * The original JsDoc comment.
   *
   * Example: "This is a summary. \{\@link a\} \@remarks These are remarks."
   */
  public originalJsDoc: string;

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
  public parameters: { [name: string]: IParam; };

  /**
   * A list of link elements to be processed after all basic documentation has been created 
   * for all items in the project. We save the processing for later because we need ApiTag 
   * information before we can deem a link element is valid.
   * Example: If API item A has a link in it's documentation to API item B, then B must not
   * have ApiTag.Internal. 
   */
  public incompleteLinks: ICodeLinkElement[];

  /**
   * A list of 'Tokens' that have been recognized as inheritdoc tokens that will be processed 
   * after the basic documentation for all API items is complete. We save the processing for after 
   * because we need ApiTag information before we can deem an inheritdoc token as valid.
   */
  public incompleteInheritdocs: Token[];

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
  public hasReadOnlyTag?: boolean;

  /**
   * A function type interface that abstracts away resolving 
   * an API definition reference to an item that has friendly 
   * assessible ApiItem properties. 
   * 
   * Ex: this is useful in the case of parsing inheritdoc expressions,
   * in the sense that we do not know if we the inherited documentation 
   * is coming from an ApiItem or a IDocItem.
   */
  public referenceResolver: IReferenceResolver;

  /**
   * We need the extractor to access the package that this ApiItem
   * belongs to in order to resolve references.
   */
  public extractor: Extractor;

  public reportError: (message: string) => void;

  constructor(docComment: string,
    referenceResolver: IReferenceResolver,
    extractor: Extractor,
    errorLogger: (message: string) => void) {
    this.originalJsDoc = docComment;
    this.referenceResolver = referenceResolver;
    this.extractor = extractor;
    this.reportError = errorLogger;
    this.parameters = {};
    this._parseDocs();
  }

  /**
   * Executes the implementation details involved in completing the documentation initialization.
   * Currently completes link and inheritdocs.
   */
  public completeInitialization(): void {
    // Ensure links are valid
    this._completeLinks();
    // Ensure inheritdocs are valid
    this._completeInheritdocs();
  }

  protected _parseDocs(): void {
    this.summary = [];
    this.returnsMessage = [];
    this.deprecatedMessage = [];
    this.remarks = [];
    this.incompleteLinks = [];
    this.incompleteInheritdocs = [];
    this.apiTag = ApiTag.None;
    const tokenizer: Tokenizer = new Tokenizer(this.originalJsDoc, this.reportError);
    this.summary = DocElementParser.parse(this, tokenizer);

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
          this.reportError(`A deprecation message must be included after the @deprecated tag.`);
        }
        break;
      }

      if (token.type === TokenType.Tag) {
        switch (token.tag) {
          case '@remarks':
            tokenizer.getToken();
            this._checkInheritDocStatus();
            this.remarks = DocElementParser.parse(this, tokenizer);
            break;
          case '@returns':
            tokenizer.getToken();
            this._checkInheritDocStatus();
            this.returnsMessage = DocElementParser.parse(this, tokenizer);
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
            this.deprecatedMessage = DocElementParser.parse(this, tokenizer);
            if (!this.deprecatedMessage || this.deprecatedMessage.length === 0) {
              this.reportError(`deprecated description required after @deprecated JSDoc tag.`);
            }
            break;
          case '@internalremarks':
            // parse but discard
            tokenizer.getToken();
            DocElementParser.parse(this, tokenizer);
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
            this.hasReadOnlyTag = true;
            break;
          case '@betadocumentation':
            tokenizer.getToken();
            this.isDocBeta = true;
            break;
          default:
            tokenizer.getToken();
            this._reportBadJSDocTag(token);
        }
      } else if (token.type === TokenType.Inline) {
        switch (token.tag) {
          case '@inheritdoc':
            DocElementParser.parse(this, tokenizer);
            break;
          case '@link':
            DocElementParser.parse(this, tokenizer);
            break;
          default:
            tokenizer.getToken();
            this._reportBadJSDocTag(token);
            break;
        }
      } else if (token.type === TokenType.Text)  {
        tokenizer.getToken();
        // Shorten "This is too long text" to "This is..."
        const MAX_LENGTH: number = 40;
        let problemText: string = token.text.trim();
        if (problemText.length > MAX_LENGTH) {
          problemText = problemText.substr(0, MAX_LENGTH - 3).trim() + '...';
        }
        this.reportError(`Unexpected text in JSDoc comment: "${problemText}"`);
      } else {
        tokenizer.getToken();
        // This would be a program bug
        this.reportError(`Unexpected token: ${token.type} ${token.tag} ${token.text}`);
      }
    }

    if (apiTagCount > 1) {
      this.reportError('More than one API Tag was specified');
    }

    if (this.preapproved && this.apiTag !== ApiTag.Internal) {
      this.reportError('The @preapproved tag may only be applied to @internal defintions');
      this.preapproved = false;
    }
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
      const remainingElements: IDocElement[] = DocElementParser.parse(this, tokenizer);
      const descriptionElements: IDocElement[] = [commentTextElement].concat(remainingElements);

      const paramDocElement: IParam = {
        name: name,
        description: descriptionElements
      };
      return paramDocElement;
      }
  }

    /**
   * A processing of linkDocElements that refer to an ApiDefinitionReference. This method 
   * ensures that the reference is to an API item that is not 'Internal'.
   */
  private _completeLinks(): void {
    while (this.incompleteLinks.length) {
      const codeLink: ICodeLinkElement = this.incompleteLinks.pop();
      const parts: IApiDefinintionReferenceParts = {
        scopeName: codeLink.scopeName,
        packageName: codeLink.packageName,
        exportName: codeLink.exportName,
        memberName: codeLink.memberName
      };

      const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(parts);
      const resolvedApiItem: ResolvedApiItem =  this.referenceResolver.resolve(
        apiDefinitionRef,
        this.extractor.package,
        this.reportError
      );

      // If the apiDefinitionRef can not be found the resolcedApiItem will be
      // undefined and an error will have been reported via this.reportError
      if (resolvedApiItem && resolvedApiItem.apiTag === ApiTag.Internal) {
        this.reportError('Unable to link to \"Internal\" API item');
      }
    }
  }

  /**
   * A processing of inheritdoc 'Tokens'. This processing occurs after we have created documentation 
   * for all API items. 
   */
  private _completeInheritdocs(): void {
    while (this.incompleteInheritdocs.length) {
      const token: Token = this.incompleteInheritdocs.pop();
      DocElementParser.parseInheritDoc(this, token);
    }
  }

  private _reportBadJSDocTag(token: Token): void {
    const supportsRegular: boolean = ApiDocumentation._allowedRegularJsdocTags.indexOf(token.tag) >= 0;
    const supportsInline: boolean = ApiDocumentation._allowedInlineJsdocTags.indexOf(token.tag) >= 0;

    if (!supportsRegular && !supportsInline) {
      this.reportError(`Unknown JSDoc tag \"${token.tag}\"`);
      return;
    }

    if (token.type === TokenType.Inline && !supportsInline) {
      this.reportError(`The JSDoc tag \"${token.tag}\" must not use the non-inline syntax (no curly braces)`);
      return;
    }
    if (token.type === TokenType.Tag && !supportsRegular) {
      this.reportError(`The JSDoc tag \"${token.tag}\" must use the inline syntax (with curly braces)`);
      return;
    }

    this.reportError(`The JSDoc tag \"${token.tag}\" is not supported in this context`);
    return;
  }

  private _checkInheritDocStatus(): void {
    if (this.isDocInherited) {
      this.reportError('Cannot provide additional JSDoc tags if @inheritdoc tag is present');
    }
  }
}
