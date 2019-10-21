// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { DeclarationReference } from '@microsoft/tsdoc/lib/beta/DeclarationReference';
import {
  ExcerptTokenKind,
  IExcerptToken,
  IExcerptTokenRange
} from '@microsoft/api-extractor-model';

import { Span } from '../analyzer/Span';
import { DeclarationReferenceGenerator } from './DeclarationReferenceGenerator';

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
  referenceGenerator: DeclarationReferenceGenerator;
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
  referenceGenerator: DeclarationReferenceGenerator;
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
  public static build(options: ISignatureBuilderOptions): IExcerptToken[] {
    const span: Span = new Span(options.startingNode);

    const tokenRangesByNode: Map<ts.Node, IExcerptTokenRange> = new Map<ts.Node, IExcerptTokenRange>();
    for (const excerpt of options.nodesToCapture || []) {
      if (excerpt.node) {
        tokenRangesByNode.set(excerpt.node, excerpt.tokenRange);
      }
    }

    const excerptTokens: IExcerptToken[] = [];

    ExcerptBuilder._buildSpan(excerptTokens, span, {
      referenceGenerator: options.referenceGenerator,
      startingNode: options.startingNode,
      stopBeforeChildKind: options.stopBeforeChildKind,
      tokenRangesByNode,
      disableMergingForNextToken: false
    });

    return excerptTokens;
  }

  public static createEmptyTokenRange(): IExcerptTokenRange {
    return { startIndex: 0, endIndex: 0 };
  }

  private static _buildSpan(excerptTokens: IExcerptToken[], span: Span, state: IBuildSpanState): boolean {
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
      let canonicalReference: DeclarationReference | undefined = undefined;

      if (span.kind === ts.SyntaxKind.Identifier) {
        const name: ts.Identifier = span.node as ts.Identifier;
        if (!ExcerptBuilder._isDeclaration(name)) {
          canonicalReference = state.referenceGenerator.getDeclarationReferenceForIdentifier(name);
        }
      }

      if (canonicalReference) {
        ExcerptBuilder._appendToken(excerptTokens, ExcerptTokenKind.Reference,
          span.prefix, state, canonicalReference);
      } else {
        ExcerptBuilder._appendToken(excerptTokens, ExcerptTokenKind.Content,
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
      ExcerptBuilder._appendToken(excerptTokens, ExcerptTokenKind.Content, span.suffix, state);
    }
    if (span.separator) {
      ExcerptBuilder._appendToken(excerptTokens, ExcerptTokenKind.Content, span.separator, state);
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

  private static _appendToken(excerptTokens: IExcerptToken[], excerptTokenKind: ExcerptTokenKind,
    text: string, state: IBuildSpanState, canonicalReference?: DeclarationReference): void {

    if (text.length === 0) {
      return;
    }

    if (excerptTokenKind !== ExcerptTokenKind.Content) {
      if (excerptTokenKind === ExcerptTokenKind.Reference && excerptTokens.length > 1
        && !state.disableMergingForNextToken) {
        // If the previous two tokens were a Reference and a '.', then concatenate
        // all three tokens as a qualified name Reference.
        const previousTokenM1: IExcerptToken = excerptTokens[excerptTokens.length - 1];
        const previousTokenM2: IExcerptToken = excerptTokens[excerptTokens.length - 2];
        if (previousTokenM1.kind === ExcerptTokenKind.Content
          && previousTokenM1.text.trim() === '.'
          && previousTokenM2.kind === ExcerptTokenKind.Reference) {

          previousTokenM2.text += '.' + text;
          if (canonicalReference !== undefined) {
            previousTokenM2.canonicalReference = canonicalReference.toString();
          }
          excerptTokens.pop(); // remove previousTokenM1;
          return;
        }
      }
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
    }

    const excerptToken: IExcerptToken = { kind: excerptTokenKind, text: text };
    if (canonicalReference !== undefined) {
      excerptToken.canonicalReference = canonicalReference.toString();
    }
    excerptTokens.push(excerptToken);
    state.disableMergingForNextToken = false;
  }

  private static _isDeclaration(node: ts.Node): node is ts.NamedDeclaration {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.FunctionExpression:
      case ts.SyntaxKind.VariableDeclaration:
      case ts.SyntaxKind.Parameter:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.ClassExpression:
      case ts.SyntaxKind.ModuleDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.MethodSignature:
      case ts.SyntaxKind.PropertyDeclaration:
      case ts.SyntaxKind.PropertySignature:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.SetAccessor:
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.TypeParameter:
      case ts.SyntaxKind.EnumMember:
      case ts.SyntaxKind.BindingElement:
        return true;
      default:
        return false;
    }
  }

}
