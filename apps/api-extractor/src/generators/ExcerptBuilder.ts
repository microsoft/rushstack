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

interface IBuildSpanState {
  nodeToStopAt?: ts.SyntaxKind;
  nameByNode: Map<ts.Node, ExcerptName>;
  remainingExcerptNames: Set<ExcerptName>;

  /**
   * Normally adjacent tokens of the same kind get merged, to avoid creating lots of unnecessary extra tokens.
   * However when an embedded excerpt needs to start/end at a specific character, we temporarily disable merging by
   * setting this flag.  After the new token is added, this flag is cleared.
   */
  disableMergingForNextToken: boolean;
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
      disableMergingForNextToken: false
    });

    // For any excerpts that we didn't find, add empty entries
    for (const embeddedExcerptName of remainingExcerptNames) {
      declarationExcerpt.embeddedExcerpts[embeddedExcerptName] = { startIndex: 0, endIndex: 0 };
    }

    return declarationExcerpt;
  }

  private static _buildSpan(declarationExcerpt: IDeclarationExcerpt, span: Span,
    state: IBuildSpanState): boolean {

    if (state.nodeToStopAt && span.kind === state.nodeToStopAt) {
      return false;
    }

    if (span.kind === ts.SyntaxKind.JSDocComment) {
      // Discard any comments
      return true;
    }

    // Can this node start a excerpt?
    const embeddedExcerptName: ExcerptName | undefined = state.nameByNode.get(span.node);
    let excerptStartIndex: number | undefined = undefined;
    if (embeddedExcerptName) {
      // Did we not already build this excerpt?
      if (state.remainingExcerptNames.has(embeddedExcerptName)) {
        state.remainingExcerptNames.delete(embeddedExcerptName);

        excerptStartIndex = declarationExcerpt.excerptTokens.length;
        state.disableMergingForNextToken = true;
      }
    }

    if (span.prefix) {
      if (span.kind === ts.SyntaxKind.Identifier) {
        ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Reference,
          span.prefix, state);
      } else {
        ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Content,
          span.prefix, state);
      }
    }

    for (const child of span.children) {
      if (!this._buildSpan(declarationExcerpt, child, state)) {
        return false;
      }
    }

    if (span.suffix) {
      ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Content,
        span.suffix, state);
    }
    if (span.separator) {
      ExcerptBuilder._appendToken(declarationExcerpt.excerptTokens, ExcerptTokenKind.Content,
        span.separator, state);
    }

    // Are we building a excerpt?  If so, add it.
    if (excerptStartIndex !== undefined) {
      declarationExcerpt.embeddedExcerpts[embeddedExcerptName!] = {
        startIndex: excerptStartIndex,
        endIndex: declarationExcerpt.excerptTokens.length
      };

      state.disableMergingForNextToken = true;
    }

    return true;
  }

  private static _appendToken(excerptTokens: IExcerptToken[], excerptTokenKind: ExcerptTokenKind,
    text: string, state: IBuildSpanState): void {

    if (text.length === 0) {
      return;
    }

    if (excerptTokenKind !== ExcerptTokenKind.Content) {
      excerptTokens.push(new ExcerptToken(excerptTokenKind, text));
      state.disableMergingForNextToken = false;

    } else {
      // If someone referenced this index, then we need to start a new token
      if (excerptTokens.length > 0 && !state.disableMergingForNextToken) {
        // Otherwise, can we merge with the previous token?
        const previousToken: IExcerptToken = excerptTokens[excerptTokens.length - 1];
        if (previousToken.kind === excerptTokenKind) {
          previousToken.text += text;
          return;
        }
      }

      excerptTokens.push(new ExcerptToken(excerptTokenKind, text));
      state.disableMergingForNextToken = false;
    }
  }

}
