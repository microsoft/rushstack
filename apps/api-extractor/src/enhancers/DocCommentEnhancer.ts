// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import { Collector } from '../collector/Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { DeclarationMetadata } from '../collector/DeclarationMetadata';
import { AedocDefinitions, ReleaseTag } from '@microsoft/api-extractor-model';
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
        if (entity.exported) {
          entity.astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
            this._analyzeDeclaration(astDeclaration);
          });
        }
      }
    }
  }

  private _analyzeDeclaration(astDeclaration: AstDeclaration): void {
    const metadata: DeclarationMetadata = this._collector.fetchMetadata(astDeclaration);
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

  private _analyzeNeedsDocumentation(astDeclaration: AstDeclaration, metadata: DeclarationMetadata): void {

    if (astDeclaration.declaration.kind === ts.SyntaxKind.Constructor) {
      // Constructors always do pretty much the same thing, so it's annoying to require people to write
      // descriptions for them.  Instead, if the constructor lacks a TSDoc summary, then API Extractor
      // will auto-generate one.
      metadata.needsDocumentation = false;

      // The class that contains this constructor
      const classDeclaration: AstDeclaration = astDeclaration.parent!;

      const configuration: tsdoc.TSDocConfiguration = AedocDefinitions.tsdocConfiguration;

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

      const declarationMetadata: DeclarationMetadata = this._collector.fetchMetadata(astDeclaration);
      if (declarationMetadata.effectiveReleaseTag === ReleaseTag.Internal) {
        // If the constructor is marked as internal, then add a boilerplate notice for the containing class
        const classMetadata: DeclarationMetadata = this._collector.fetchMetadata(classDeclaration);

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
              text: `The constructor for this class is marked as internal. Third-party code should not`
                + ` call the constructor directly or create subclasses that extend the `
            }),
            new tsdoc.DocCodeSpan({
              configuration,
              code: classDeclaration.astSymbol.localName
            }),
            new tsdoc.DocPlainText({ configuration, text: ' class.' })
          ])
        );

      }

    } else if (metadata.tsdocComment) {
      // Require the summary to contain at least 10 non-spacing characters
      metadata.needsDocumentation = !tsdoc.PlainTextEmitter.hasAnyTextContent(
        metadata.tsdocComment.summarySection, 10);
    } else {
      metadata.needsDocumentation = true;
    }
  }

  private _checkForBrokenLinks(astDeclaration: AstDeclaration, metadata: DeclarationMetadata): void {
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
        if (node.codeDestination.packageName === undefined
          || node.codeDestination.packageName === this._collector.workingPackage.name) {

          const referencedAstDeclaration: AstDeclaration | ResolverFailure = this._collector.astReferenceResolver
            .resolve(node.codeDestination);

          if (referencedAstDeclaration instanceof ResolverFailure) {
            this._collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.UnresolvedLink,
              'The @link reference could not be resolved: ' + referencedAstDeclaration.reason,
              astDeclaration);
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
  private _applyInheritDoc(astDeclaration: AstDeclaration, docComment: tsdoc.DocComment,
    inheritDocTag: tsdoc.DocInheritDocTag): void {

    if (!inheritDocTag.declarationReference) {
      this._collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.UnresolvedInheritDocBase,
        'The @inheritDoc tag needs a TSDoc declaration reference; signature matching is not supported yet',
        astDeclaration);
      return;
    }

    // Is it referring to the working package?
    if (!(inheritDocTag.declarationReference.packageName === undefined
      || inheritDocTag.declarationReference.packageName === this._collector.workingPackage.name)) {

      // It's referencing an external package, so skip this inheritDoc tag, since AstReferenceResolver doesn't
      // support it yet.  As a workaround, this tag will get handled later by api-documenter.
      // Tracked by:  https://github.com/microsoft/rushstack/issues/1195
      return;
    }

    const referencedAstDeclaration: AstDeclaration | ResolverFailure = this._collector.astReferenceResolver
      .resolve(inheritDocTag.declarationReference);

    if (referencedAstDeclaration instanceof ResolverFailure) {
      this._collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.UnresolvedInheritDocReference,
        'The @inheritDoc reference could not be resolved: ' + referencedAstDeclaration.reason, astDeclaration);
      return;
    }

    this._analyzeDeclaration(referencedAstDeclaration);

    const referencedMetadata: DeclarationMetadata = this._collector.fetchMetadata(referencedAstDeclaration);

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

}
