// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

export class TypeScriptMessageSerializer {
  /**
   * Serialize a TypeScript diagnostic message or message chain.
   */
  public static serialize(messageText: string | ts.DiagnosticMessageChain): string {
    const serializedErrors: string[] = [];
    for (
      let wrappedMessageText: string | ts.DiagnosticMessageChain | undefined = messageText;
      wrappedMessageText !== undefined;
      wrappedMessageText = (wrappedMessageText as ts.DiagnosticMessageChain).next
    ) {
      if (typeof wrappedMessageText === 'string') {
        serializedErrors.push(wrappedMessageText);
      } else {
        serializedErrors.push(wrappedMessageText.messageText);
      }
    }

    return serializedErrors.join('; ');
  }
}
