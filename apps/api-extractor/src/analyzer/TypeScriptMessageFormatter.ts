// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

export class TypeScriptMessageFormatter {
  /**
   * Format a TypeScript diagnostic message or message chain.
   */
  public static format(messageText: string | ts.DiagnosticMessageChain): string {
    const formattedErrors: string[] = [];
    for (
      let wrappedMessageText: string | ts.DiagnosticMessageChain | undefined = messageText;
      wrappedMessageText !== undefined;
      wrappedMessageText = (wrappedMessageText as ts.DiagnosticMessageChain).next
    ) {
      if (typeof wrappedMessageText === 'string') {
        formattedErrors.push(wrappedMessageText);
      } else {
        formattedErrors.push(wrappedMessageText.messageText);
      }
    }

    return formattedErrors.join('; ');
  }

  /**
   * Returns a string such as this, based on the context information in the provided node:
   *   "[C:\Folder\File.ts#123]"
   */
  public static formatFileAndLineNumber(node: ts.Node): string {
    const sourceFile: ts.SourceFile = node.getSourceFile();
    const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return `[${sourceFile.fileName}#${lineAndCharacter.line}]`;
  }
}
