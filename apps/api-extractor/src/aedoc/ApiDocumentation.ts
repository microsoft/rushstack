// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */
/* tslint:disable:member-ordering */

import { AstPackage } from '../ast/AstPackage';
import { ApiDefinitionReference, IApiDefinitionReferenceParts } from '../ApiDefinitionReference';
import { ExtractorContext } from '../ExtractorContext';
import { ResolvedApiItem } from '../ResolvedApiItem';
import { ReleaseTag } from './ReleaseTag';
import {
  MarkupElement,
  MarkupBasicElement,
  IMarkupApiLink
} from '../markup/MarkupElement';

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
   * The original AEDoc comment, with the "/**" characters already removed.
   *
   * Example: "This is a summary. \{\@link a\} \@remarks These are remarks."
   */
  public originalAedoc: string;

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
   * A list of 'Token' objects that have been recognized as \@inheritdoc tokens that will be processed
   * after the basic documentation for all API items is complete. We postpone the processing
   * because we need ReleaseTag information before we can determine whether an \@inheritdoc token
   * is valid.
   */
  private incompleteInheritdocs: {}[];

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

  public readonly reportError: (message: string) => void;

  constructor(originalAedoc: string,
    referenceResolver: IReferenceResolver,
    context: ExtractorContext,
    errorLogger: (message: string) => void,
    warnings: string[]) {

    this.reportError = (message: string) => {
      errorLogger(message);
      this.failedToParse = true;
    };

    this.originalAedoc = originalAedoc;
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
    this.incompleteInheritdocs = [];
    this.releaseTag = ReleaseTag.None;

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

  private _parseDocs(): void {
    // ...
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
    // ...
  }
}
