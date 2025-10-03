// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import * as tsdoc from '@microsoft/tsdoc';
import { ReleaseTag } from '@microsoft/api-extractor-model';

import type { Collector } from '../collector/Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import type { AstDeclaration } from '../analyzer/AstDeclaration';
import type { ApiItemMetadata } from '../collector/ApiItemMetadata';
import { ExtractorMessageId } from '../api/ExtractorMessageId';
import { VisitorState } from '../collector/VisitorState';
import { ResolverFailure } from '../analyzer/AstReferenceResolver';

export class DocCommentEnhancer {
  private readonly _collector: Collector;

  public constructor(collector: Collector) {
    this._collector = collector;
  }

  public static analyze(collector: Collector): void {
    const docCommentEnhancer: DocCommentEnhancer = new DocCommentEnhancer(collector);
    docCommentEnhancer.analyze();
  }

  public analyze(): void {
    for (const entity of this._collector.entities) {
      if (entity.astEntity instanceof AstSymbol) {
        if (
          entity.consumable ||
          this._collector.extractorConfig.apiReportIncludeForgottenExports ||
          this._collector.extractorConfig.docModelIncludeForgottenExports
        ) {
          entity.astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
            this._analyzeApiItem(astDeclaration);
          });
        }
      }
    }
  }

  private _analyzeApiItem(astDeclaration: AstDeclaration): void {
    const metadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
    if (metadata.docCommentEnhancerVisitorState === VisitorState.Visited) {
      return;
    }

    if (metadata.docCommentEnhancerVisitorState === VisitorState.Visiting) {
      this._collector.messageRouter.addAnalyzerIssue(
        ExtractorMessageId.CyclicInheritDoc,
        `The @inheritDoc tag for "${astDeclaration.astSymbol.localName}" refers to its own declaration`,
        astDeclaration
      );
      return;
    }
    metadata.docCommentEnhancerVisitorState = VisitorState.Visiting;

    if (metadata.tsdocComment && metadata.tsdocComment.inheritDocTag) {
      this._applyInheritDoc(astDeclaration, metadata.tsdocComment, metadata.tsdocComment.inheritDocTag);
    }

    this._analyzeNeedsDocumentation(astDeclaration, metadata);

    this._checkForBrokenLinks(astDeclaration, metadata);

    metadata.docCommentEnhancerVisitorState = VisitorState.Visited;
  }

  private _analyzeNeedsDocumentation(astDeclaration: AstDeclaration, metadata: ApiItemMetadata): void {
    if (astDeclaration.declaration.kind === ts.SyntaxKind.Constructor) {
      // Constructors always do pretty much the same thing, so it's annoying to require people to write
      // descriptions for them.  Instead, if the constructor lacks a TSDoc summary, then API Extractor
      // will auto-generate one.
      metadata.undocumented = false;

      // The class that contains this constructor
      const classDeclaration: AstDeclaration = astDeclaration.parent!;

      const configuration: tsdoc.TSDocConfiguration = this._collector.extractorConfig.tsdocConfiguration;

      if (!metadata.tsdocComment) {
        metadata.tsdocComment = new tsdoc.DocComment({ configuration });
      }

      if (!tsdoc.PlainTextEmitter.hasAnyTextContent(metadata.tsdocComment.summarySection)) {
        metadata.tsdocComment.summarySection.appendNodesInParagraph([
          new tsdoc.DocPlainText({ configuration, text: 'Constructs a new instance of the ' }),
          new tsdoc.DocCodeSpan({
            configuration,
            code: classDeclaration.astSymbol.localName
          }),
          new tsdoc.DocPlainText({ configuration, text: ' class' })
        ]);
      }

      const apiItemMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(astDeclaration);
      if (apiItemMetadata.effectiveReleaseTag === ReleaseTag.Internal) {
        // If the constructor is marked as internal, then add a boilerplate notice for the containing class
        const classMetadata: ApiItemMetadata = this._collector.fetchApiItemMetadata(classDeclaration);

        if (!classMetadata.tsdocComment) {
          classMetadata.tsdocComment = new tsdoc.DocComment({ configuration });
        }

        if (classMetadata.tsdocComment.remarksBlock === undefined) {
          classMetadata.tsdocComment.remarksBlock = new tsdoc.DocBlock({
            configuration,
            blockTag: new tsdoc.DocBlockTag({
              configuration,
              tagName: tsdoc.StandardTags.remarks.tagName
            })
          });
        }

        classMetadata.tsdocComment.remarksBlock.content.appendNode(
          new tsdoc.DocParagraph({ configuration }, [
            new tsdoc.DocPlainText({
              configuration,
              text:
                `The constructor for this class is marked as internal. Third-party code should not` +
                ` call the constructor directly or create subclasses that extend the `
            }),
            new tsdoc.DocCodeSpan({
              configuration,
              code: classDeclaration.astSymbol.localName
            }),
            new tsdoc.DocPlainText({ configuration, text: ' class.' })
          ])
        );
      }
      return;
    } else {
      // For non-constructor items, we will determine whether or not the item is documented as follows:
      // 1. If it contains a summary section with at least 10 characters, then it is considered "documented".
      // 2. If it contains an @inheritDoc tag, then it *may* be considered "documented", depending on whether or not
      //    the tag resolves to a "documented" API member.
      //    - Note: for external members, we cannot currently determine this, so we will consider the "documented"
      //      status to be unknown.
      if (metadata.tsdocComment) {
        if (tsdoc.PlainTextEmitter.hasAnyTextContent(metadata.tsdocComment.summarySection, 10)) {
          // If the API item has a summary comment block (with at least 10 characters), mark it as "documented".
          metadata.undocumented = false;
        } else if (metadata.tsdocComment.inheritDocTag) {
          if (
            this._refersToDeclarationInWorkingPackage(
              metadata.tsdocComment.inheritDocTag.declarationReference
            )
          ) {
            // If the API item has an `@inheritDoc` comment that points to an API item in the working package,
            // then the documentation contents should have already been copied from the target via `_applyInheritDoc`.
            // The continued existence of the tag indicates that the declaration reference was invalid, and not
            // documentation contents could be copied.
            // An analyzer issue will have already been logged for this.
            // We will treat such an API as "undocumented".
            metadata.undocumented = true;
          } else {
            // If the API item has an `@inheritDoc` comment that points to an external API item, we cannot currently
            // determine whether or not the target is "documented", so we cannot say definitively that this is "undocumented".
            metadata.undocumented = false;
          }
        } else {
          // If the API item has neither a summary comment block, nor an `@inheritDoc` comment, mark it as "undocumented".
          metadata.undocumented = true;
        }
      } else {
        // If there is no tsdoc comment at all, mark "undocumented".
        metadata.undocumented = true;
      }
    }
  }

  private _checkForBrokenLinks(astDeclaration: AstDeclaration, metadata: ApiItemMetadata): void {
    if (!metadata.tsdocComment) {
      return;
    }
    this._checkForBrokenLinksRecursive(astDeclaration, metadata.tsdocComment);
  }

  private _checkForBrokenLinksRecursive(astDeclaration: AstDeclaration, node: tsdoc.DocNode): void {
    if (node instanceof tsdoc.DocLinkTag) {
      if (node.codeDestination) {
        // Is it referring to the working package?  If not, we don't do any link validation, because
        // AstReferenceResolver doesn't support it yet (but ModelReferenceResolver does of course).
        // Tracked by:  https://github.com/microsoft/rushstack/issues/1195
        if (this._refersToDeclarationInWorkingPackage(node.codeDestination)) {
          const referencedAstDeclaration: AstDeclaration | ResolverFailure =
            this._collector.astReferenceResolver.resolve(node.codeDestination);

          if (referencedAstDeclaration instanceof ResolverFailure) {
            this._collector.messageRouter.addAnalyzerIssue(
              ExtractorMessageId.UnresolvedLink,
              'The @link reference could not be resolved: ' + referencedAstDeclaration.reason,
              astDeclaration
            );
          }
        }
      }
    }
    for (const childNode of node.getChildNodes()) {
      this._checkForBrokenLinksRecursive(astDeclaration, childNode);
    }
  }

  /**
   * Follow an `{@inheritDoc ___}` reference and copy the content that we find in the referenced comment.
   */
  private _applyInheritDoc(
    astDeclaration: AstDeclaration,
    docComment: tsdoc.DocComment,
    inheritDocTag: tsdoc.DocInheritDocTag
  ): void {
    if (!inheritDocTag.declarationReference) {
      this._collector.messageRouter.addAnalyzerIssue(
        ExtractorMessageId.UnresolvedInheritDocBase,
        'The @inheritDoc tag needs a TSDoc declaration reference; signature matching is not supported yet',
        astDeclaration
      );
      return;
    }

    if (!this._refersToDeclarationInWorkingPackage(inheritDocTag.declarationReference)) {
      // The `@inheritDoc` tag is referencing an external package. Skip it, since AstReferenceResolver doesn't
      // support it yet.  As a workaround, this tag will get handled later by api-documenter.
      // Tracked by:  https://github.com/microsoft/rushstack/issues/1195
      return;
    }

    const referencedAstDeclaration: AstDeclaration | ResolverFailure =
      this._collector.astReferenceResolver.resolve(inheritDocTag.declarationReference);

    if (referencedAstDeclaration instanceof ResolverFailure) {
      this._collector.messageRouter.addAnalyzerIssue(
        ExtractorMessageId.UnresolvedInheritDocReference,
        'The @inheritDoc reference could not be resolved: ' + referencedAstDeclaration.reason,
        astDeclaration
      );
      return;
    }

    this._analyzeApiItem(referencedAstDeclaration);

    const referencedMetadata: ApiItemMetadata =
      this._collector.fetchApiItemMetadata(referencedAstDeclaration);

    if (referencedMetadata.tsdocComment) {
      this._copyInheritedDocs(docComment, referencedMetadata.tsdocComment);
    }
  }

  /**
   * Copy the content from `sourceDocComment` to `targetDocComment`.
   */
  private _copyInheritedDocs(targetDocComment: tsdoc.DocComment, sourceDocComment: tsdoc.DocComment): void {
    targetDocComment.summarySection = sourceDocComment.summarySection;
    targetDocComment.remarksBlock = sourceDocComment.remarksBlock;

    targetDocComment.params.clear();
    for (const param of sourceDocComment.params) {
      targetDocComment.params.add(param);
    }
    for (const typeParam of sourceDocComment.typeParams) {
      targetDocComment.typeParams.add(typeParam);
    }
    targetDocComment.returnsBlock = sourceDocComment.returnsBlock;

    targetDocComment.inheritDocTag = undefined;
  }

  /**
   * Determines whether or not the provided declaration reference points to an item in the working package.
   */
  private _refersToDeclarationInWorkingPackage(
    declarationReference: tsdoc.DocDeclarationReference | undefined
  ): boolean {
    return (
      declarationReference?.packageName === undefined ||
      declarationReference.packageName === this._collector.workingPackage.name
    );
  }
}
