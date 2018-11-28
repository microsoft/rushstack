// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import {
  ExcerptToken,
  ExcerptTokenKind,
  IDeclarationExcerpt,
  ExcerptName,
  IExcerptToken
} from '../api/mixins/Excerpt';
import { Span } from '../analyzer/Span';

export interface IExcerptBuilderEmbeddedExcerpt {
  embeddedExcerptName: ExcerptName;
  node: ts.Node | undefined;
}

export interface ISignatureBuilderOptions {
  startingNode: ts.Node;
  nodeToStopAt?: ts.SyntaxKind;
  embeddedExcerpts?: IExcerptBuilderEmbeddedExcerpt[];
}

interface IBuildSpanOptions {
  nodeToStopAt?: ts.SyntaxKind;
  nameByNode: Map<ts.Node, ExcerptName>;
  remainingExcerptNames: Set<ExcerptName>;
  lastReferencedIndex: number;
}

export class ExcerptBuilder {
  public static build(options: ISignatureBuilderOptions): IDeclarationExcerpt {
    const span: Span = new Span(options.startingNode);

    const remainingExcerptNames: Set<ExcerptName> = new Set<ExcerptName>();

    const nameByNode: Map<ts.Node, ExcerptName> = new Map<ts.Node, ExcerptName>();
    for (const excerpt of options.embeddedExcerpts || []) {
      // Collect all names
      remainingExcerptNames.add(excerpt.embeddedExcerptName);

      // If nodes were specify, add them to our map so we will look for them
      if (excerpt.node) {
        nameByNode.set(excerpt.node, excerpt.embeddedExcerptName);
      }
    }

    const declarationExcerpt: IDeclarationExcerpt = {
      excerptTokens: [ ],
      embeddedExcerpts: { }
    };

    ExcerptBuilder._buildSpan(declarationExcerpt, span, {
      nodeToStopAt: options.nodeToStopAt,
      nameByNode,
      remainingExcerptNames,
      lastReferencedIndex: 0
    });

    // For any excerpts that we didn't find, add empty entries
    for (const embeddedExcerptName of remainingExcerptNames) {
      declarationExcerpt.embeddedExcerpts[embeddedExcerptName] = { startIndex: 0, endIndex: 0 };
    }

    return declarationExcerpt;
  }

  private static _buildSpan(declarationExcerpt: IDeclarationExcerpt, span: Span,
    options: IBuildSpanOptions): boolean {

    if (options.nodeToStopAt && span.kind === options.nodeToStopAt) {
      return false;
    }

    if (span.kind === ts.SyntaxKind.JSDocComment) {
      // Discard any comments
      return true;
    }

    // Can this node start a excerpt?
    const embeddedExcerptName: ExcerptName | undefined = options.nameByNode.get(span.node);
    let excerptStartIndex: number | undefined = undefined;
    if (embeddedExcerptName) {
      // Did we not already build this excerpt?
      if (options.remainingExcerptNames.has(embeddedExcerptName)) {
        options.remainingExcerptNames.delete(embeddedExcerptName);

        excerptStartIndex = declarationExcerpt.excerptTokens.length;
        options.lastReferencedIndex = excerptStartIndex;
      }
    }

    if (span.prefix) {
      if (span.kind === ts.SyntaxKind.Identifier) {
        ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Reference,
          span.prefix, options);
      } else {
        ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Content,
          span.prefix, options);
      }
    }

    for (const child of span.children) {
      if (!this._buildSpan(declarationExcerpt, child, options)) {
        return false;
      }
    }

    if (span.suffix) {
      ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Content,
        span.suffix, options);
    }
    if (span.separator) {
      ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Content,
        span.separator, options);
    }

    // Are we building a excerpt?  If so, add it.
    if (excerptStartIndex !== undefined) {
      declarationExcerpt.embeddedExcerpts[embeddedExcerptName!] = {
        startIndex: excerptStartIndex,
        endIndex: declarationExcerpt.excerptTokens.length
      };

      options.lastReferencedIndex = declarationExcerpt.excerptTokens.length;
    }

    return true;
  }

  private static _appendToken(excerptTokens: IExcerptToken[], excerptTokenKind: ExcerptTokenKind,
    text: string, options: IBuildSpanOptions): void {

    if (text.length === 0) {
      return;
    }

    if (excerptTokenKind !== ExcerptTokenKind.Content) {
      excerptTokens.push(new ExcerptToken(excerptTokenKind, text));
    } else {
      // If someone referenced this index, then we need to start a new token
      if (excerptTokens.length > options.lastReferencedIndex) {
        // Otherwise, can we merge with the previous token?
        const previousToken: IExcerptToken = excerptTokens[excerptTokens.length - 1];
        if (previousToken.kind === excerptTokenKind) {
          previousToken.text += text;
          return;
        }
      }

      excerptTokens.push(new ExcerptToken(excerptTokenKind, text));
    }
  }

}
