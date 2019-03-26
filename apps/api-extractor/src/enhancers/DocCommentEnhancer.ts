// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import { Collector } from '../collector/Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { DeclarationMetadata } from '../collector/DeclarationMetadata';
import { AedocDefinitions } from '@microsoft/api-extractor-model';
import { InternalError } from '@microsoft/node-core-library';
import { ExtractorMessageId } from '../api/ExtractorMessageId';
import { VisitorState } from '../collector/VisitorState';

export class DocCommentEnhancer {
  private readonly _collector: Collector;

  constructor(collector: Collector) {
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
      throw new InternalError('Infinite loop in DocCommentEnhancer._analyzeDeclaration()');
    }
    metadata.docCommentEnhancerVisitorState = VisitorState.Visiting;

    if (metadata.tsdocComment && metadata.tsdocComment.inheritDocTag) {
      this._analyzeInheritDoc(astDeclaration, metadata.tsdocComment, metadata.tsdocComment.inheritDocTag);
    }

    this._analyzeNeedsDocumentation(astDeclaration, metadata);

    metadata.docCommentEnhancerVisitorState = VisitorState.Visited;
  }

  private _analyzeNeedsDocumentation(astDeclaration: AstDeclaration, metadata: DeclarationMetadata): void {

    if (astDeclaration.declaration.kind === ts.SyntaxKind.Constructor) {
      // Constructors always do pretty much the same thing, so it's annoying to require people to write
      // descriptions for them.  Instead, if the constructor lacks a TSDoc summary, then API Extractor
      // will auto-generate one.
      metadata.needsDocumentation = false;

      const configuration: tsdoc.TSDocConfiguration = AedocDefinitions.tsdocConfiguration;

      if (!metadata.tsdocComment) {
        metadata.tsdocComment = new tsdoc.DocComment({ configuration });
      }

      if (!tsdoc.PlainTextEmitter.hasAnyTextContent(metadata.tsdocComment.summarySection)) {
        metadata.tsdocComment.summarySection.appendNodesInParagraph([
          new tsdoc.DocPlainText({ configuration, text: 'Constructs a new instance of the ' }),
          new tsdoc.DocCodeSpan({
            configuration,
            code: astDeclaration.astSymbol.parentAstSymbol!.localName
          }),
          new tsdoc.DocPlainText({ configuration, text: ' class' })
        ]);
      }

    } else if (metadata.tsdocComment) {
      // Require the summary to contain at least 10 non-spacing characters
      metadata.needsDocumentation = !tsdoc.PlainTextEmitter.hasAnyTextContent(
        metadata.tsdocComment.summarySection, 10);
    } else {
      metadata.needsDocumentation = true;
    }
  }

  /**
   * Follow an `{@inheritDoc ___}` reference and copy the content that we find in the referenced comment.
   */
  private _analyzeInheritDoc(astDeclaration: AstDeclaration, docComment: tsdoc.DocComment,
    inheritDocTag: tsdoc.DocInheritDocTag): void {

    if (!inheritDocTag.declarationReference) {
      this._collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.UnresolvedInheritDocBase,
        'The `@inheritDoc` tag needs a TSDoc declaration reference; signature matching is not supported yet',
        astDeclaration);
      return;
    }

    const referencedAstDeclaration: AstDeclaration | Error = this._collector.astReferenceResolver
      .resolve(inheritDocTag.declarationReference);

    if (referencedAstDeclaration instanceof Error) {
      this._collector.messageRouter.addAnalyzerIssue(ExtractorMessageId.UnresolvedInheritDocReference,
        'The `@inheritDoc` reference could not be resolved: ' + referencedAstDeclaration.message, astDeclaration);
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
