// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import { Collector } from '../collector/Collector';
import { AstSymbol } from '../analyzer/AstSymbol';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { DeclarationMetadata } from '../collector/DeclarationMetadata';
import { AedocDefinitions } from '@microsoft/api-extractor-model';

export class DocCommentEnhancer {
  public static analyze(collector: Collector): void {
    for (const entity of collector.entities) {
      if (entity.astEntity instanceof AstSymbol) {
        if (entity.exported) {
          entity.astEntity.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
            DocCommentEnhancer._analyzeNeedsDocumentation(collector, astDeclaration);

          });
        }
      }
    }
  }

  private static _analyzeNeedsDocumentation(collector: Collector, astDeclaration: AstDeclaration): void {
    const metadata: DeclarationMetadata = collector.fetchMetadata(astDeclaration);

    if (astDeclaration.declaration.kind === ts.SyntaxKind.Constructor) {
      // Constructors always do pretty much the same thing, so it's annoying to require people to write
      // descriptions for them.  Instead, if the constructor lacks a TSDoc summary, then API Extractor
      // will auto-generate one.
      metadata.needsDocumentation = false;

      const configuration: tsdoc.TSDocConfiguration = AedocDefinitions.tsdocConfiguration;
      if (metadata.tsdocComment === undefined) {
        metadata.tsdocComment = new tsdoc.DocComment({ configuration });
      }

      const docComment: tsdoc.DocComment = metadata.tsdocComment;

      if (!tsdoc.PlainTextEmitter.hasAnyTextContent(docComment.summarySection)) {
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

}
