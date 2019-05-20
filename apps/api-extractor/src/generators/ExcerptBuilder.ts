// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import {
  ExcerptTokenKind,
  IExcerptToken,
  IExcerptTokenRange,
  ExcerptToken_referencedSymbol
} from '@microsoft/api-extractor-model';

import { Span } from '../analyzer/Span';

/**
 * Used to provide ExcerptBuilder with a list of nodes whose token range we want to capture.
 */
export interface IExcerptBuilderNodeToCapture {
  /**
   * The node to capture
   */
  node: ts.Node | undefined;
  /**
   * The token range whose startIndex/endIndex will be overwritten with the indexes for the
   * tokens corresponding to IExcerptBuilderNodeToCapture.node
   */
  tokenRange: IExcerptTokenRange;
}

/**
 * Options for ExcerptBuilder
 */
export interface ISignatureBuilderOptions {
  /**
   * The AST node that we will traverse to extract tokens
   */
  startingNode: ts.Node;

  /**
   * Normally, the excerpt will include all child nodes for `startingNode`; whereas if `childKindToStopBefore`
   * is specified, then the node traversal will stop before (i.e. excluding) the first immediate child
   * of `startingNode` with the specified syntax kind.
   *
   * @remarks
   * For example, suppose the signature is `interface X: Y { z: string }`.  The token `{` has syntax kind
   * `ts.SyntaxKind.FirstPunctuation`, so we can specify that to truncate the excerpt to `interface X: Y`.
   */
  stopBeforeChildKind?: ts.SyntaxKind;

  /**
   * A list of child nodes whose token ranges we want to capture
   */
  nodesToCapture?: IExcerptBuilderNodeToCapture[];
}

/**
 * Internal state for ExcerptBuilder
 */
interface IBuildSpanState {
  startingNode: ts.Node;
  stopBeforeChildKind: ts.SyntaxKind | undefined;

  tokenRangesByNode: Map<ts.Node, IExcerptTokenRange>;

  /**
   * Normally adjacent tokens of the same kind get merged, to avoid creating lots of unnecessary extra tokens.
   * However when an captured excerpt needs to start/end at a specific character, we temporarily disable merging by
   * setting this flag.  After the new token is added, this flag is cleared.
   */
  disableMergingForNextToken: boolean;
}

export class ExcerptBuilder {
  private readonly _typeChecker: ts.TypeChecker;

  constructor(typeChecker: ts.TypeChecker) {
    this._typeChecker = typeChecker;
  }

  public build(options: ISignatureBuilderOptions): IExcerptToken[] {
    const span: Span = new Span(options.startingNode);

    const tokenRangesByNode: Map<ts.Node, IExcerptTokenRange> = new Map<ts.Node, IExcerptTokenRange>();
    for (const excerpt of options.nodesToCapture || []) {
      if (excerpt.node) {
        tokenRangesByNode.set(excerpt.node, excerpt.tokenRange);
      }
    }

    const excerptTokens: IExcerptToken[] = [];

    this._buildSpan(excerptTokens, span, {
      startingNode: options.startingNode,
      stopBeforeChildKind: options.stopBeforeChildKind,
      tokenRangesByNode,
      disableMergingForNextToken: false
    });

    return excerptTokens;
  }

  public createEmptyTokenRange(): IExcerptTokenRange {
    return { startIndex: 0, endIndex: 0 };
  }

  private _buildSpan(excerptTokens: IExcerptToken[], span: Span, state: IBuildSpanState): boolean {
    if (span.kind === ts.SyntaxKind.JSDocComment) {
      // Discard any comments
      return true;
    }

    // Can this node start a excerpt?
    const capturedTokenRange: IExcerptTokenRange | undefined = state.tokenRangesByNode.get(span.node);
    let excerptStartIndex: number = 0;

    if (capturedTokenRange) {
      // We will assign capturedTokenRange.startIndex to be the index of the next token to be appended
      excerptStartIndex = excerptTokens.length;
      state.disableMergingForNextToken = true;
    }

    if (span.prefix) {
      if (span.kind === ts.SyntaxKind.Identifier) {
        const referencedSymbol: ts.Symbol|undefined = this._typeChecker.getSymbolAtLocation(span.node);
        this._appendToken(excerptTokens, ExcerptTokenKind.Reference,
          span.prefix, state, referencedSymbol);
      } else {
        this._appendToken(excerptTokens, ExcerptTokenKind.Content,
          span.prefix, state);
      }
    }

    for (const child of span.children) {
      if (span.node === state.startingNode) {
        if (state.stopBeforeChildKind && child.kind === state.stopBeforeChildKind) {
          // We reached the a child whose kind is stopBeforeChildKind, so stop traversing
          return false;
        }
      }

      if (!this._buildSpan(excerptTokens, child, state)) {
        return false;
      }
    }

    if (span.suffix) {
      this._appendToken(excerptTokens, ExcerptTokenKind.Content, span.suffix, state);
    }
    if (span.separator) {
      this._appendToken(excerptTokens, ExcerptTokenKind.Content, span.separator, state);
    }

    // Are we building a excerpt?  If so, set its range
    if (capturedTokenRange) {
      capturedTokenRange.startIndex = excerptStartIndex;

      // We will assign capturedTokenRange.startIndex to be the index after the last token that was appended so far
      capturedTokenRange.endIndex = excerptTokens.length;

      state.disableMergingForNextToken = true;
    }

    return true;
  }

  private _appendToken(excerptTokens: IExcerptToken[], excerptTokenKind: ExcerptTokenKind,
    text: string, state: IBuildSpanState, referencedSymbol?: ts.Symbol): void {

    if (text.length === 0) {
      return;
    }

    if (excerptTokenKind !== ExcerptTokenKind.Content) {
      excerptTokens.push({ kind: excerptTokenKind, text: text, [ExcerptToken_referencedSymbol]: referencedSymbol });
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

      excerptTokens.push({ kind: excerptTokenKind, text: text, [ExcerptToken_referencedSymbol]: referencedSymbol });
      state.disableMergingForNextToken = false;
    }
  }

}
