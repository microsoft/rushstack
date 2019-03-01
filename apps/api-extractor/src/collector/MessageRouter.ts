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
import { ExtractorMessageId, allExtractorMessageIds } from '../api/ExtractorMessageId';
import {
  IExtractorMessagesConfig,
  ExtractorMessageLogLevel,
  IExtractorMessageReportingRuleConfig
} from '../api/IExtractorConfig';

interface IReportingRule {
  logLevel: ExtractorMessageLogLevel;
  addToApiReviewFile: boolean;
}

export class MessageRouter {
  private _messages: ExtractorMessage[];

  private _reportingRuleByMessageId: Map<string, IReportingRule> = new Map<string, IReportingRule>();
  private _compilerDefaultRule: IReportingRule = { logLevel: ExtractorMessageLogLevel.None,
    addToApiReviewFile: false };
  private _extractorDefaultRule: IReportingRule = { logLevel: ExtractorMessageLogLevel.None,
    addToApiReviewFile: false };
  private _tsdocDefaultRule: IReportingRule = { logLevel: ExtractorMessageLogLevel.None,
    addToApiReviewFile: false };

  public constructor(messagesConfig: IExtractorMessagesConfig) {
    this._messages = [];

    this._applyMessagesConfig(messagesConfig);
  }

  private _applyMessagesConfig(messagesConfig: IExtractorMessagesConfig): void {
    if (messagesConfig.compilerMessageReporting) {
      for (const messageId of Object.getOwnPropertyNames(messagesConfig.compilerMessageReporting)) {
        const rule: IReportingRule = MessageRouter._getNormalizedRule(
          messagesConfig.compilerMessageReporting[messageId]);

        if (messageId === 'default') {
          this._compilerDefaultRule = rule;
        } else if (!/^TS[0-9]+$/.test(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.compilerMessageReporting table contains`
            + ` an invalid entry "${messageId}". The identifier format is "TS" followed by an integer.`);
        } else {
          this._reportingRuleByMessageId.set(messageId, rule);
        }
      }
    }

    if (messagesConfig.extractorMessageReporting) {
      for (const messageId of Object.getOwnPropertyNames(messagesConfig.extractorMessageReporting)) {
        const rule: IReportingRule = MessageRouter._getNormalizedRule(
          messagesConfig.extractorMessageReporting[messageId]);

        if (messageId === 'default') {
          this._extractorDefaultRule = rule;
        } else if (!/^ae-/.test(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.extractorMessageReporting table contains`
            + ` an invalid entry "${messageId}".  The name should begin with the "ae-" prefix.`);
        } else if (allExtractorMessageIds.has(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.extractorMessageReporting table contains`
            + ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`);
        } else {
          this._reportingRuleByMessageId.set(messageId, rule);
        }
      }
    }

    if (messagesConfig.tsdocMessageReporting) {
      for (const messageId of Object.getOwnPropertyNames(messagesConfig.tsdocMessageReporting)) {
        const rule: IReportingRule = MessageRouter._getNormalizedRule(
          messagesConfig.tsdocMessageReporting[messageId]);

        if (messageId === 'default') {
          this._tsdocDefaultRule = rule;
        } else if (!/^tsdoc-/.test(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.tsdocMessageReporting table contains`
            + ` an invalid entry "${messageId}".  The name should begin with the "tsdoc-" prefix.`);
        } else if (allExtractorMessageIds.has(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.tsdocMessageReporting table contains`
            + ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`);
        } else {
          this._reportingRuleByMessageId.set(messageId, rule);
        }
      }
    }
  }

  private static _getNormalizedRule(rule: IExtractorMessageReportingRuleConfig): IReportingRule {
    return {
      logLevel: rule.logLevel || 'none',
      addToApiReviewFile: rule.addToApiReviewFile || false
    };
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
