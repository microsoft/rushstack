// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */
/* tslint:disable:member-ordering */

import {
  TSDocParser,
  TSDocTagDefinition,
  TextRange,
  ParserContext,
  ModifierTagSet,
  DocBlockTag,
  StandardTags,
  StandardModifierTagSet,
  DocBlock,
  DocComment,
  DocSection,
  DocNodeKind,
  DocPlainText,
  DocCodeSpan,
  DocErrorText,
  DocEscapedText,
  DocNode,
  DocParagraph,
  DocFencedCode,
  DocHtmlStartTag,
  DocHtmlEndTag,
  DocInlineTag,
  DocLinkTag,
  DocDeclarationReference,
  DocMemberReference,
  DocNodeTransforms
} from '@microsoft/tsdoc';
import { AstPackage } from '../ast/AstPackage';
import { ApiDefinitionReference, IApiDefinitionReferenceParts } from '../ApiDefinitionReference';
import { ExtractorContext } from '../ExtractorContext';
import { ResolvedApiItem } from '../ResolvedApiItem';
import { ReleaseTag } from './ReleaseTag';
import {
  MarkupElement,
  MarkupBasicElement,
  IMarkupApiLink,
  MarkupHighlighter
} from '../markup/MarkupElement';
import { Markup } from '../markup/Markup';
import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';
import { AedocDefinitions } from './AedocDefinitions';
import { IApiItemReference } from '../api/ApiItem';
import { PackageName, IParsedPackageNameOrError } from '@microsoft/node-core-library';
import { AstItemKind } from '../ast/AstItem';

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
    warnings: string[]): ResolvedApiItem | undefined;
}

/**
 * Used by ApiDocumentation to represent the AEDoc description for a function parameter.
 */
export interface IAedocParameter {
  name: string;
  description: MarkupBasicElement[];
}

export class ApiDocumentation {
  /**
   * docCommentTokens that are parsed into Doc Elements.
   */
  public summary: MarkupElement[];
  public deprecatedMessage: MarkupBasicElement[];
  public remarks: MarkupElement[];
  public returnsMessage: MarkupBasicElement[];
  public parameters: { [name: string]: IAedocParameter; };

  /**
   * A list of \@link elements to be post-processed after all basic documentation has been created
   * for all items in the project.  We save the processing for later because we need ReleaseTag
   * information before we can determine whether a link element is valid.
   * Example: If API item A has a \@link in its documentation to API item B, then B must not
   * have ReleaseTag.Internal.
   */
  public incompleteLinks: IMarkupApiLink[];

  /**
   * A "release tag" is an AEDoc tag which indicates whether this definition
   * is considered Public API for third party developers, as well as its release
   * stage (alpha, beta, etc).
   */
  public releaseTag: ReleaseTag;

  /**
   * True if the "\@preapproved" tag was specified.
   * Indicates that this internal API is exempt from further reviews.
   */
  public preapproved: boolean | undefined;

  /**
   * True if the "\@packagedocumentation" tag was specified.
   */
  public isPackageDocumentation: boolean | undefined;

  /**
   * True if the documentation content has not been reviewed yet.
   */
  public isDocBeta: boolean | undefined;

  /**
   * True if the \@eventproperty tag was specified.  This means class/interface property
   * represents and event.  It should be a read-only property that returns a user-defined class
   * with operations such as addEventHandler() or removeEventHandler().
   */
  public isEventProperty: boolean | undefined;

  /**
   * True if the \@inheritdoc tag was specified.
   */
  public isDocInherited: boolean | undefined;

  /**
   * True if the \@inheritdoc tag was specified and is inheriting from a target object
   * that was marked as \@deprecated.
   */
  public isDocInheritedDeprecated: boolean | undefined;

  /**
   * True if the \@readonly tag was specified.
   */
  public hasReadOnlyTag: boolean | undefined;

  public warnings: string[];

  /**
   * Whether the "\@sealed" AEDoc tag was specified.
   */
  public isSealed: boolean;

  /**
   * Whether the "\@virtual" AEDoc tag was specified.
   */
  public isVirtual: boolean;

  /**
   * Whether the "\@override" AEDoc tag was specified.
   */
  public isOverride: boolean;

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
  public context: ExtractorContext;

  /**
   * True if any errors were encountered while parsing the AEDoc tokens.
   * This is used to suppress other "collateral damage" errors, e.g. if "@public" was
   * misspelled then we shouldn't also complain that the "@public" tag is missing.
   */
  public failedToParse: boolean;

  public readonly reportError: (message: string, startIndex?: number) => void;

  private _parserContext: ParserContext | undefined;
  private _docComment: DocComment | undefined;

  constructor(inputTextRange: TextRange,
    referenceResolver: IReferenceResolver,
    context: ExtractorContext,
    errorLogger: (message: string, startIndex?: number) => void,
    warnings: string[]) {

    this.reportError = (message: string, startIndex?: number) => {
      errorLogger(message, startIndex);
      this.failedToParse = true;
    };

    this.referenceResolver = referenceResolver;
    this.context = context;
    this.reportError = errorLogger;
    this.parameters = {};
    this.warnings = warnings;

    this.isSealed = false;
    this.isVirtual = false;
    this.isOverride = false;

    this.summary = [];
    this.returnsMessage = [];
    this.deprecatedMessage = [];
    this.remarks = [];
    this.incompleteLinks = [];
    this.releaseTag = ReleaseTag.None;

    this._parserContext = undefined;
    this._docComment = undefined;

    if (!inputTextRange.isEmpty()) {
      this._parseDocs(inputTextRange);
    }
  }

  /**
   * Returns true if an AEDoc comment was parsed for the API item.
   */
  public get aedocCommentFound(): boolean {
    if (this._parserContext) {
      return this._parserContext.tokens.length > 0;
    }
    return false;
  }

  /**
   * Returns the original AEDoc comment
   */
  public emitNormalizedComment(): string {
    if (this._parserContext) {
      const content: string = this._parserContext.lines.map(x => x.toString()).join('\n');
      return TypeScriptHelpers.formatJSDocContent(content);
    }
    return '';
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

  private _parseDocs(inputTextRange: TextRange): void {
    const tsdocParser: TSDocParser = new TSDocParser(AedocDefinitions.parserConfiguration);
    this._parserContext = tsdocParser.parseRange(inputTextRange);
    this._docComment = this._parserContext.docComment;

    for (const message of this._parserContext.log.messages) {
      this.reportError(message.unformattedText, message.textRange.pos);
    }

    this._parseModifierTags();
    this._parseSections();
  }

  private _parseModifierTags(): void {
    if (!this._docComment) {
      return;
    }
    const modifierTagSet: StandardModifierTagSet = this._docComment.modifierTagSet;

    // The first function call that encounters a duplicate will return false.
    // When there are duplicates, the broadest release tag wins.
    // tslint:disable-next-line:no-unused-expression
    this._parseReleaseTag(modifierTagSet, StandardTags.public, ReleaseTag.Public)
      && this._parseReleaseTag(modifierTagSet, StandardTags.beta, ReleaseTag.Beta)
      && this._parseReleaseTag(modifierTagSet, StandardTags.alpha, ReleaseTag.Alpha)
      && this._parseReleaseTag(modifierTagSet, StandardTags.internal, ReleaseTag.Internal);

    this.preapproved = modifierTagSet.hasTag(AedocDefinitions.preapprovedTag);

    this.isPackageDocumentation = modifierTagSet.isPackageDocumentation();
    this.hasReadOnlyTag = modifierTagSet.isReadonly();
    this.isDocBeta = modifierTagSet.hasTag(AedocDefinitions.betaDocumentation);
    this.isEventProperty = modifierTagSet.isEventProperty();
    this.isSealed = modifierTagSet.isSealed();
    this.isVirtual = modifierTagSet.isVirtual();
    this.isOverride = modifierTagSet.isOverride();

    if (this.preapproved && this.releaseTag !== ReleaseTag.Internal) {
      this.reportError('The @preapproved tag may only be applied to @internal definitions');
      this.preapproved = false;
    }

    if (this.isSealed && this.isVirtual) {
      this.reportError('The @sealed and @virtual tags may not be used together');
    }

    if (this.isVirtual && this.isOverride) {
      this.reportError('The @virtual and @override tags may not be used together');
    }
  }

  private _parseReleaseTag(modifierTagSet: ModifierTagSet, tagDefinition: TSDocTagDefinition,
    releaseTag: ReleaseTag): boolean {

    const node: DocBlockTag | undefined = modifierTagSet.tryGetTag(tagDefinition);
    if (node) {
      if (this.releaseTag !== ReleaseTag.None) {
        this.reportError('More than one release tag was specified (@alpha, @beta, @public, @internal)');
        return false;
      }
      this.releaseTag = releaseTag;
    }

    return true;
  }

  private _parseSections(): void {
    if (!this._docComment) {
      return;
    }

    this._renderAsMarkupElementsInto(this.summary, this._docComment.summarySection,
      'the summary section', false);

    if (this._docComment.remarksBlock) {
      this._renderAsMarkupElementsInto(this.remarks, this._docComment.remarksBlock,
        'the remarks section', true);
    }

    if (this._docComment.deprecatedBlock) {
      this._renderAsMarkupElementsInto(this.deprecatedMessage, this._docComment.deprecatedBlock,
        'a deprecation notice', false);
    }

    if (this._docComment.returnsBlock) {
      this._renderAsMarkupElementsInto(this.returnsMessage, this._docComment.returnsBlock,
        'a return value description', false);
    }

    for (const paramBlock of this._docComment.params.blocks) {
      const aedocParameter: IAedocParameter = {
        name: paramBlock.parameterName,
        description: []
      };
      this._renderAsMarkupElementsInto(aedocParameter.description, paramBlock,
        'a parameter description', false);

      this.parameters[paramBlock.parameterName] = aedocParameter;
    }
  }

  private _renderAsMarkupElementsInto(result: MarkupElement[], node: DocNode, sectionName: string,
    allowStructuredContent: boolean): void {
    switch (node.kind) {
      case DocNodeKind.Block:
      case DocNodeKind.ParamBlock:
        const docBlock: DocBlock = node as DocBlock;
        this._renderAsMarkupElementsInto(result, docBlock.content, sectionName, allowStructuredContent);
        break;
      case DocNodeKind.Section:
        const docSection: DocSection = node as DocSection;
        for (const childNode of docSection.nodes) {
          this._renderAsMarkupElementsInto(result, childNode, sectionName, allowStructuredContent);
        }
        break;
      case DocNodeKind.BlockTag:
        // If an unrecognized TSDoc block tag appears in the content, don't render it
        break;
      case DocNodeKind.CodeSpan:
        const docCodeSpan: DocCodeSpan = node as DocCodeSpan;
        result.push(Markup.createCode(docCodeSpan.code));
        break;
      case DocNodeKind.ErrorText:
        const docErrorText: DocErrorText = node as DocErrorText;
        Markup.appendTextElements(result, docErrorText.text);
        break;
      case DocNodeKind.EscapedText:
        const docEscapedText: DocEscapedText = node as DocEscapedText;
        Markup.appendTextElements(result, docEscapedText.decodedText);
        break;
      case DocNodeKind.FencedCode:
        if (allowStructuredContent) {
          const docCodeFence: DocFencedCode = node as DocFencedCode;
          let markupHighlighter: MarkupHighlighter = 'plain';
          switch (docCodeFence.language.toUpperCase()) {
            case 'TS':
            case 'TYPESCRIPT':
            case 'JS':
            case 'JAVASCRIPT':
              markupHighlighter = 'javascript';
              break;
          }
          result.push(Markup.createCodeBox(docCodeFence.code, markupHighlighter));
        } else {
          this._reportIncorrectStructuredContent('a fenced code block', sectionName);
          return;
        }
        break;
      case DocNodeKind.HtmlStartTag:
        const docHtmlStartTag: DocHtmlStartTag = node as DocHtmlStartTag;
        let htmlStartTag: string = '<';
        htmlStartTag += docHtmlStartTag.name;
        for (const attribute of docHtmlStartTag.htmlAttributes) {
          htmlStartTag += ` ${attribute.name}=${attribute.value}`;
        }
        if (docHtmlStartTag.selfClosingTag) {
          htmlStartTag += '/';
        }
        htmlStartTag += '>';
        result.push(Markup.createHtmlTag(htmlStartTag));
        break;
      case DocNodeKind.HtmlEndTag:
        const docHtmlEndTag: DocHtmlEndTag = node as DocHtmlEndTag;
        result.push(Markup.createHtmlTag(`</${docHtmlEndTag.name}>`));
        break;
      case DocNodeKind.InlineTag:
        const docInlineTag: DocInlineTag = node as DocInlineTag;
        Markup.appendTextElements(result, '{' + docInlineTag.tagName + '}');
        break;
      case DocNodeKind.LinkTag:
        const docLinkTag: DocLinkTag = node as DocLinkTag;
        if (docLinkTag.urlDestination) {
          result.push(Markup.createWebLinkFromText(docLinkTag.linkText || docLinkTag.urlDestination,
            docLinkTag.urlDestination));
        } else if (docLinkTag.codeDestination) {
          const apiItemReference: IApiItemReference | undefined
            = this._tryCreateApiItemReference(docLinkTag.codeDestination);
          if (apiItemReference) {
            let linkText: string | undefined = docLinkTag.linkText;
            if (!linkText) {
              linkText = apiItemReference.exportName;
              if (apiItemReference.memberName) {
                linkText += '.' + apiItemReference.memberName;
              }
            }
            const linkElement: IMarkupApiLink = Markup.createApiLinkFromText(linkText, apiItemReference);
            result.push(linkElement);

            // The link will get resolved later in _completeLinks()
            this.incompleteLinks.push(linkElement);
          }
        }
        break;
      case DocNodeKind.Paragraph:
        if (result.length > 0) {
          switch (result[result.length - 1].kind) {
            case 'code-box':
            case 'heading1':
            case 'heading2':
            case 'note-box':
            case 'page':
            case 'paragraph':
            case 'table':
              // Don't put a Markup.PARAGRAPH after a structural element,
              // since it is implicit.
              break;
            default:
              result.push(Markup.PARAGRAPH);
              break;
          }
        }
        const docParagraph: DocParagraph = node as DocParagraph;
        for (const childNode of DocNodeTransforms.trimSpacesInParagraph(docParagraph).nodes) {
          this._renderAsMarkupElementsInto(result, childNode, sectionName, allowStructuredContent);
        }
        break;
      case DocNodeKind.PlainText:
        const docPlainText: DocPlainText = node as DocPlainText;
        Markup.appendTextElements(result, docPlainText.text);
        break;
      case DocNodeKind.SoftBreak:
        Markup.appendTextElements(result, ' ');
        break;
      default:
        this.reportError('Unsupported TSDoc element: ' + node.kind);
    }
  }

  private _reportIncorrectStructuredContent(constructName: string, sectionName: string): void {
    this.reportError(`Structured content such as ${constructName} cannot be used in ${sectionName}`);
  }

  // This is a temporary adapter until we fully generalize IApiItemReference to support TSDoc declaration references
  private _tryCreateApiItemReference(declarationReference: DocDeclarationReference): IApiItemReference | undefined {
    if (declarationReference.importPath) {
      this.reportError(`API Extractor does not yet support TSDoc declaration references containing an import path:`
        + ` "(declarationReference.importPath)"`);
      return undefined;
    }

    const memberReferences: ReadonlyArray<DocMemberReference> = declarationReference.memberReferences;
    if (memberReferences.length > 2) {
      // This will get be fixed soon
      this.reportError('API Extractor does not yet support TSDoc declaration references containing'
        + ' more than 2 levels of nesting');
      return undefined;
    }
    if (memberReferences.length === 0) {
      this.reportError('API Extractor does not yet support TSDoc declaration references without a member reference');
      return undefined;
    }

    const apiItemReference: IApiItemReference = {
      scopeName: '',
      packageName: '',
      exportName: '',
      memberName: ''
    };

    if (declarationReference.packageName) {
      const parsedPackageName: IParsedPackageNameOrError = PackageName.tryParse(declarationReference.packageName);
      if (parsedPackageName.error) {
        this.reportError(`Invalid package name ${declarationReference.packageName}: ${parsedPackageName.error}`);
        return undefined;
      }

      apiItemReference.scopeName = parsedPackageName.scope;
      apiItemReference.packageName = parsedPackageName.unscopedName;
    } else {

      // If the package name is unspecified, assume it is the current package
      apiItemReference.scopeName = this.context.parsedPackageName.scope;
      apiItemReference.packageName = this.context.parsedPackageName.unscopedName;
    }

    let identifier: string | undefined = this._tryGetMemberReferenceIdentifier(memberReferences[0]);
    if (!identifier) {
      return undefined;
    }
    apiItemReference.exportName = identifier;

    if (memberReferences.length > 1) {
      identifier = this._tryGetMemberReferenceIdentifier(memberReferences[1]);
      if (!identifier) {
        return undefined;
      }
      apiItemReference.memberName = identifier;
    }

    return apiItemReference;
  }

  private _tryGetMemberReferenceIdentifier(memberReference: DocMemberReference): string | undefined {
    if (!memberReference.memberIdentifier) {
      this.reportError('API Extractor currently only supports TSDoc member references using identifiers');
      return undefined;
    }

    if (memberReference.memberIdentifier.hasQuotes) {
      // Allow quotes if the identifier is being quoted because it is a system name.
      // (What's not supported is special characters in the identifier.)
      if (!/[_a-z][_a-z0-0]*/i.test(memberReference.memberIdentifier.identifier)) {
        this.reportError('API Extractor does not yet support TSDoc member references using quotes');
        return undefined;
      }
    }

    return memberReference.memberIdentifier.identifier;
  }

  /**
   * A processing of linkDocElements that refer to an ApiDefinitionReference. This method
   * ensures that the reference is to an API item that is not 'Internal'.
   */
  private _completeLinks(): void {
    for ( ; ; ) {
      const codeLink: IMarkupApiLink | undefined = this.incompleteLinks.pop();
      if (!codeLink) {
        break;
      }

      const parts: IApiDefinitionReferenceParts = {
        scopeName: codeLink.target.scopeName,
        packageName: codeLink.target.packageName,
        exportName: codeLink.target.exportName,
        memberName: codeLink.target.memberName
      };

      const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(parts);
      const resolvedAstItem: ResolvedApiItem | undefined =  this.referenceResolver.resolve(
        apiDefinitionRef,
        this.context.package,
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
    if (!this._docComment || !this._docComment.inheritDocTag) {
      return;
    }
    if (!this._docComment.inheritDocTag.declarationReference) {
      return;
    }
    const apiItemReference: IApiItemReference | undefined = this._tryCreateApiItemReference(
      this._docComment.inheritDocTag.declarationReference);
    if (!apiItemReference) {
      return;
    }

    const apiDefinitionRef: ApiDefinitionReference = ApiDefinitionReference.createFromParts(apiItemReference);

    // Atempt to locate the apiDefinitionRef
    const resolvedAstItem: ResolvedApiItem | undefined = this.referenceResolver.resolve(
      apiDefinitionRef,
      this.context.package,
      warnings
    );

    // If no resolvedAstItem found then nothing to inherit
    // But for the time being set the summary to a text object
    if (!resolvedAstItem) {
      let unresolvedAstItemName: string = apiDefinitionRef.exportName;
      if (apiDefinitionRef.memberName) {
        unresolvedAstItemName += '.' + apiDefinitionRef.memberName;
      }
      this.summary.push(...Markup.createTextElements(
        `See documentation for ${unresolvedAstItemName}`));
      return;
    }

    // We are going to copy the resolvedAstItem's documentation
    // We must make sure it's documentation can be completed,
    // if we cannot, an error will be reported viathe documentation error handler.
    // This will only be the case our resolvedAstItem was created from a local
    // AstItem. Resolutions from JSON will have an undefined 'astItem' property.
    // Example: a circular reference will report an error.
    if (resolvedAstItem.astItem) {
      resolvedAstItem.astItem.completeInitialization();
    }

    // inheritdoc found, copy over IApiBaseDefinition properties
    this.summary = resolvedAstItem.summary;
    this.remarks = resolvedAstItem.remarks;

    // Copy over detailed properties if neccessary
    // Add additional cases if needed
    switch (resolvedAstItem.kind) {
      case AstItemKind.Function:
        this.parameters = resolvedAstItem.params || { };
        this.returnsMessage = resolvedAstItem.returnsMessage || [];
        break;
      case AstItemKind.Method:
      case AstItemKind.Constructor:
        this.parameters = resolvedAstItem.params || { };
        this.returnsMessage = resolvedAstItem.returnsMessage || [];
        break;
    }

    // Check if inheritdoc is depreacted
    // We need to check if this documentation has a deprecated message
    // but it may not appear until after this token.
    if (resolvedAstItem.deprecatedMessage && resolvedAstItem.deprecatedMessage.length > 0) {
      this.isDocInheritedDeprecated = true;
    }
  }
}
