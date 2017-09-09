// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import AstPackage from '../ast/AstPackage';
import DocElementParser from '../DocElementParser';
import { IDocElement, ICodeLinkElement } from '../markup/OldMarkup';
import ApiDefinitionReference, { IApiDefinitionReferenceParts } from '../ApiDefinitionReference';
import Token, { TokenType } from './Token';
import Tokenizer from './Tokenizer';
import Extractor from '../Extractor';
import ResolvedApiItem from '../ResolvedApiItem';
import { ReleaseTag } from './ReleaseTag';

/**
 * A dependency for ApiDocumentation constructor that abstracts away the function
 * of resolving an API definition reference.
 *
 * @internalremarks reportError() will be called if the apiDefinitionRef is to a non local
 * item and the package of that non local item can not be found.
 * If there is no package given and an  item can not be found we will return undefined.
 * Once we support local references, we can be sure that reportError will only be
 * called once if the item can not be found (and undefined will be returned by the reference
 * function).
 */
export interface IReferenceResolver {
  resolve(
    apiDefinitionRef: ApiDefinitionReference,
    astPackage: AstPackage,
    warnings: string[]): ResolvedApiItem;
}

/**
 * Used by ApiDocumentation to represent the AEDoc description for a function parameter.
 */
export interface IAedocParameter {
  name: string;
  description: IDocElement[];
}

export default class ApiDocumentation {
  /**
   * Match AEDoc block tags and inline tags
   * Example "@a @b@c d@e @f {whatever} {@link a} { @something } \@g" => ["@a", "@f", "{@link a}", "{ @something }"]
   */
  public static readonly _aedocTagsRegex: RegExp = /{\s*@(\\{|\\}|[^{}])*}|(?:^|\s)(\@[a-z_]+)(?=\s|$)/gi;

  // For guidance about using these tags, please see this documentation:
  // https://github.com/Microsoft/web-build-tools/wiki/API-Extractor-~-AEDoc-tags
  private static _allowedRegularAedocTags: string[] = [
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
    '@deprecated',
    '@readonly',
    '@remarks'
  ];

  private static _allowedInlineAedocTags: string[] = [
    // (alphabetical order)
    '@inheritdoc',
    '@link'
  ];

  /**
   * The original AEDoc comment.
   *
   * Example: "This is a summary. \{\@link a\} \@remarks These are remarks."
   */
  public originalAedoc: string;

  /**
   * The docComment text string split into an array of ITokenItems.  The tokens are essentially either
   * AEDoc tags (which start with the "@" character) or substrings containing the
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
  public parameters: { [name: string]: IAedocParameter; };

  /**
   * A list of \@link elements to be post-processed after all basic documentation has been created
   * for all items in the project.  We save the processing for later because we need ReleaseTag
   * information before we can determine whether a link element is valid.
   * Example: If API item A has a \@link in its documentation to API item B, then B must not
   * have ReleaseTag.Internal.
   */
  public incompleteLinks: ICodeLinkElement[];

  /**
   * A list of 'Token' objects that have been recognized as \@inheritdoc tokens that will be processed
   * after the basic documentation for all API items is complete. We postpone the processing
   * because we need ReleaseTag information before we can determine whether an \@inheritdoc token
   * is valid.
   */
  public incompleteInheritdocs: Token[];

  /**
   * A "release tag" is an AEDoc tag which indicates whether this definition
   * is considered Public API for third party developers, as well as its release
   * stage (alpha, beta, etc).
   */
  public releaseTag: ReleaseTag;

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
  public warnings: string[];

  /**
   * A function type interface that abstracts away resolving
   * an API definition reference to an item that has friendly
   * accessible AstItem properties.
   *
   * Ex: this is useful in the case of parsing inheritdoc expressions,
   * in the sense that we do not know if we the inherited documentation
   * is coming from an AstItem or a ApiItem.
   */
  public referenceResolver: IReferenceResolver;

  /**
   * We need the extractor to access the package that this AstItem
   * belongs to in order to resolve references.
   */
  public extractor: Extractor;

  /**
   * True if any errors were encountered while parsing the AEDoc tokens.
   * This is used to suppress other "collateral damage" errors, e.g. if "@public" was
   * misspelled then we shouldn't also complain that the "@public" tag is missing.
   */
  public failedToParse: boolean;

  public readonly reportError: (message: string) => void;

  constructor(docComment: string,
    referenceResolver: IReferenceResolver,
    extractor: Extractor,
    errorLogger: (message: string) => void,
    warnings: string[]) {

    this.reportError = (message: string) => {
      errorLogger(message);
      this.failedToParse = true;
    };

    this.originalAedoc = docComment;
    this.referenceResolver = referenceResolver;
    this.extractor = extractor;
    this.reportError = errorLogger;
    this.parameters = {};
    this.warnings = warnings;
    this._parseDocs();
  }

  /**
   * Executes the implementation details involved in completing the documentation initialization.
   * Currently completes link and inheritdocs.
   */
  public completeInitialization(warnings: string[]): void {
    // Ensure links are valid
    this._completeLinks();
    // Ensure inheritdocs are valid
    this._completeInheritdocs(warnings);
  }

  protected _parseDocs(): void {
    this.summary = [];
    this.returnsMessage = [];
    this.deprecatedMessage = [];
    this.remarks = [];
    this.incompleteLinks = [];
    this.incompleteInheritdocs = [];
    this.releaseTag = ReleaseTag.None;
    const tokenizer: Tokenizer = new Tokenizer(this.originalAedoc, this.reportError);
    this.summary = DocElementParser.getTrimmedSpan(DocElementParser.parse(this, tokenizer));

    let releaseTagCount: number = 0;
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

      if (token.type === TokenType.BlockTag) {
        switch (token.tag) {
          case '@remarks':
            tokenizer.getToken();
            this._checkInheritDocStatus(token.tag);
            this.remarks = DocElementParser.getTrimmedSpan(DocElementParser.parse(this, tokenizer));
            break;
          case '@returns':
            tokenizer.getToken();
            this._checkInheritDocStatus(token.tag);
            this.returnsMessage = DocElementParser.getTrimmedSpan(DocElementParser.parse(this, tokenizer));
            break;
          case '@param':
            tokenizer.getToken();
            this._checkInheritDocStatus(token.tag);
            const param: IAedocParameter = this._parseParam(tokenizer);
            if (param) {
               this.parameters[param.name] = param;
            }
            break;
          case '@deprecated':
            tokenizer.getToken();
            this.deprecatedMessage = DocElementParser.getTrimmedSpan(DocElementParser.parse(this, tokenizer));
            if (!this.deprecatedMessage || this.deprecatedMessage.length === 0) {
              this.reportError(`deprecated description required after @deprecated AEDoc tag.`);
            }
            break;
          case '@internalremarks':
            // parse but discard
            tokenizer.getToken();
            DocElementParser.parse(this, tokenizer);
            break;
          case '@public':
            tokenizer.getToken();
            this.releaseTag = ReleaseTag.Public;
            ++releaseTagCount;
            break;
          case '@internal':
            tokenizer.getToken();
            this.releaseTag = ReleaseTag.Internal;
            ++releaseTagCount;
            break;
          case '@alpha':
            tokenizer.getToken();
            this.releaseTag = ReleaseTag.Alpha;
            ++releaseTagCount;
            break;
          case '@beta':
            tokenizer.getToken();
            this.releaseTag = ReleaseTag.Beta;
            ++releaseTagCount;
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
            this._reportBadAedocTag(token);
        }
      } else if (token.type === TokenType.InlineTag) {
        switch (token.tag) {
          case '@inheritdoc':
            DocElementParser.parse(this, tokenizer);
            break;
          case '@link':
            DocElementParser.parse(this, tokenizer);
            break;
          default:
            tokenizer.getToken();
            this._reportBadAedocTag(token);
            break;
        }
      } else if (token.type === TokenType.Text)  {
        tokenizer.getToken();

        if (token.text.trim().length) {
          // Shorten "This is too long text" to "This is..."
          const MAX_LENGTH: number = 40;
          let problemText: string = token.text.trim();
          if (problemText.length > MAX_LENGTH) {
            problemText = problemText.substr(0, MAX_LENGTH - 3).trim() + '...';
          }
          this.reportError(`Unexpected text in AEDoc comment: "${problemText}"`);
        }
      } else {
        tokenizer.getToken();
        // This would be a program bug
        this.reportError(`Unexpected token: ${token.type} ${token.tag} "${token.text}"`);
      }
    }

    if (releaseTagCount > 1) {
      this.reportError('More than one release tag (@alpha, @beta, etc) was specified');
    }

    if (this.preapproved && this.releaseTag !== ReleaseTag.Internal) {
      this.reportError('The @preapproved tag may only be applied to @internal definitions');
      this.preapproved = false;
    }
  }

  protected _parseParam(tokenizer: Tokenizer): IAedocParameter {
    const paramDescriptionToken: Token = tokenizer.getToken();
    if (!paramDescriptionToken) {
      this.reportError('The @param tag is missing a parameter description');
      return;
    }
    const hyphenIndex: number = paramDescriptionToken ? paramDescriptionToken.text.indexOf('-') : -1;
    if (hyphenIndex < 0) {
      this.reportError('The @param tag is missing the hyphen that delimits the parameter name '
        + ' and description');
      return;
    } else {
      const name: string = paramDescriptionToken.text.slice(0, hyphenIndex).trim();
      const comment: string = paramDescriptionToken.text.substr(hyphenIndex + 1).trim();

      if (!comment) {
        this.reportError('The @param tag is missing a parameter description');
        return;
      }

      const commentTextElement: IDocElement = DocElementParser.makeTextElement(comment);
      // Full param description may contain additional Tokens (Ex: @link)
      const remainingElements: IDocElement[] = DocElementParser.parse(this, tokenizer);
      const descriptionElements: IDocElement[] = [commentTextElement].concat(remainingElements);

      const paramDocElement: IAedocParameter = {
        name: name,
        description: DocElementParser.getTrimmedSpan(descriptionElements)
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
      const parts: IApiDefinitionReferenceParts = {
        scopeName: codeLink.scopeName,
        packageName: codeLink.packageName,
        exportName: codeLink.exportName,
        memberName: codeLink.memberName
      };

      const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(parts);
      const resolvedAstItem: ResolvedApiItem =  this.referenceResolver.resolve(
        apiDefinitionRef,
        this.extractor.package,
        this.warnings
      );

      // If the apiDefinitionRef can not be found the resolvedAstItem will be
      // undefined and an error will have been reported via this.reportError
      if (resolvedAstItem) {
        if (resolvedAstItem.releaseTag === ReleaseTag.Internal
          || resolvedAstItem.releaseTag === ReleaseTag.Alpha) {

          this.reportError('The {@link} tag references an @internal or @alpha API item, '
            + 'which will not appear in the generated documentation');
        }
      }
    }
  }

  /**
   * A processing of inheritdoc 'Tokens'. This processing occurs after we have created documentation
   * for all API items.
   */
  private _completeInheritdocs(warnings: string[]): void {
    while (this.incompleteInheritdocs.length) {
      const token: Token = this.incompleteInheritdocs.pop();
      DocElementParser.parseInheritDoc(this, token, warnings);
    }
  }

  private _reportBadAedocTag(token: Token): void {
    const supportsRegular: boolean = ApiDocumentation._allowedRegularAedocTags.indexOf(token.tag) >= 0;
    const supportsInline: boolean = ApiDocumentation._allowedInlineAedocTags.indexOf(token.tag) >= 0;

    if (!supportsRegular && !supportsInline) {
      this.reportError(`The JSDoc tag \"${token.tag}\" is not supported by AEDoc`);
      return;
    }

    if (token.type === TokenType.InlineTag && !supportsInline) {
      this.reportError(`The AEDoc tag \"${token.tag}\" must use the inline tag notation (i.e. with curly braces)`);
      return;
    }
    if (token.type === TokenType.BlockTag && !supportsRegular) {
      this.reportError(`The AEDoc tag \"${token.tag}\" must use the block tag notation (i.e. no curly braces)`);
      return;
    }

    this.reportError(`The AEDoc tag \"${token.tag}\" is not supported in this context`);
    return;
  }

  private _checkInheritDocStatus(aedocTag: string): void {
    if (this.isDocInherited) {
      this.reportError(`The ${aedocTag} tag may not be used because this state is provided by the @inheritdoc target`);
    }
  }
}
