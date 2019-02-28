// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';

import { TypeScriptMessageFormatter } from '../analyzer/TypeScriptMessageFormatter';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { AstSymbol } from '../analyzer/AstSymbol';
import {
  ExtractorMessage,
  ExtractorMessageCategory,
  IExtractorMessageOptions
} from '../api/ExtractorMessage';
import { ExtractorMessageId } from '../api/ExtractorMessageId';

export class MessageRouter {
  private _messages: ExtractorMessage[];

  public constructor() {
    this._messages = [];
  }

  public get messages(): ReadonlyArray<ExtractorMessage> {
    return this._messages;
  }

  /**
   * Add a diagnostic message reported by the TypeScript compiler
   */
  public addCompilerDiagnostic(diagnostic: ts.Diagnostic): void {
    switch (diagnostic.category) {
      case ts.DiagnosticCategory.Suggestion:
      case ts.DiagnosticCategory.Message:
        return;  // ignore noise
    }

    const messageText: string = TypeScriptMessageFormatter.format(diagnostic.messageText);
    const options: IExtractorMessageOptions = {
      category: ExtractorMessageCategory.Compiler,
      messageId: `TS${diagnostic.code}`,
      text: messageText
    };

    if (diagnostic.file) {
      const sourceFile: ts.SourceFile = diagnostic.file;
      const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(
        diagnostic.start || 0);

      options.sourceFilePath = sourceFile.fileName;
      options.sourceFileLine = lineAndCharacter.line;
      options.sourceFileColumn = lineAndCharacter.character;
    }

    this._messages.push(new ExtractorMessage(options));
  }

  /**
   * Add a message from the API Extractor analysis
   */
  public addAnalyzerIssue(messageId: ExtractorMessageId, messageText: string,
    astDeclarationOrSymbol: AstDeclaration | AstSymbol): void {

    let declaration: ts.Declaration;
    if (astDeclarationOrSymbol instanceof AstDeclaration) {
      declaration = astDeclarationOrSymbol.declaration;
    } else {
      declaration = astDeclarationOrSymbol.astDeclarations[0].declaration;
    }

    this.addAnalyzerIssueForPosition(messageId, messageText, declaration.getSourceFile(), declaration.pos);
  }

  /**
   * Add all messages produced from an invocation of the TSDoc parser, assuming they refer to
   * code in the specified source file.
   */
  public addTsdocMessages(parserContext: tsdoc.ParserContext, sourceFile: ts.SourceFile): void {
    for (const message of parserContext.log.messages) {
      const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(
        message.textRange.pos);

      this._messages.push(
        new ExtractorMessage({
          category: ExtractorMessageCategory.TSDoc,
          messageId: message.messageId,
          text: message.text,
          sourceFilePath: sourceFile.fileName,
          sourceFileLine: lineAndCharacter.line,
          sourceFileColumn: lineAndCharacter.character
        })
      );
    }
  }

  /**
   * Add a message for a location in an arbitrary source file.
   */
  public addAnalyzerIssueForPosition(messageId: ExtractorMessageId, messageText: string,
    sourceFile: ts.SourceFile, pos: number): void {

    const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(
      pos);

    const options: IExtractorMessageOptions = {
      category: ExtractorMessageCategory.Extractor,
      messageId,
      text: messageText,
      sourceFilePath: sourceFile.fileName,
      sourceFileLine: lineAndCharacter.line,
      sourceFileColumn: lineAndCharacter.character
    };

    this._messages.push(new ExtractorMessage(options));
  }
}
