// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

export class ModuleDocComment {
  /**
   * For the given source file, see if it starts with a TSDoc comment containing the `@module` tag.
   */
  public static tryFindInSourceFile(sourceFile: ts.SourceFile): ts.TextRange | undefined {
    // The @module comment is special because it is not attached to an AST
    // definition.  Instead, it is part of the "trivia" tokens that the compiler treats
    // as irrelevant white space.
    //
    // This implementation assumes that the "@module" will be in the first TSDoc comment
    // that appears in the source file.
    let moduleCommentRange: ts.TextRange | undefined = undefined;

    for (const commentRange of ts.getLeadingCommentRanges(sourceFile.text, sourceFile.getFullStart()) || []) {
      if (commentRange.kind === ts.SyntaxKind.MultiLineCommentTrivia) {
        const commentBody: string = sourceFile.text.substring(commentRange.pos, commentRange.end);

        // Choose the first JSDoc-style comment
        if (/^\s*\/\*\*/.test(commentBody)) {
          // But only if it looks like it's trying to be @module
          // (The TSDoc parser will validate this more rigorously)
          if (/\@module/i.test(commentBody)) {
            moduleCommentRange = commentRange;
          }
          break;
        }
      }
    }

    return moduleCommentRange;
  }
}
