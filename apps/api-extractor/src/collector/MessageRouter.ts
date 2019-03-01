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
import { AedocDefinitions } from '../aedoc/AedocDefinitions';
import { Sort } from '@microsoft/node-core-library';

interface IReportingRule {
  logLevel: ExtractorMessageLogLevel;
  addToApiReviewFile: boolean;
}

export class MessageRouter {
  // All messages
  private readonly _messages: ExtractorMessage[];

  // For each AstDeclaration, the messages associated with it.  This is used when addToApiReviewFile=true
  private readonly _associatedMessagesForAstDeclaration: Map<AstDeclaration, ExtractorMessage[]>;

  // Messages that got written to the API review file
  private readonly _messagesAddedToApiReviewFile: Set<ExtractorMessage>;

  // Normalized representation of the routing rules from api-extractor.json
  private _reportingRuleByMessageId: Map<string, IReportingRule> = new Map<string, IReportingRule>();
  private _compilerDefaultRule: IReportingRule = { logLevel: ExtractorMessageLogLevel.None,
    addToApiReviewFile: false };
  private _extractorDefaultRule: IReportingRule = { logLevel: ExtractorMessageLogLevel.None,
    addToApiReviewFile: false };
  private _tsdocDefaultRule: IReportingRule = { logLevel: ExtractorMessageLogLevel.None,
    addToApiReviewFile: false };

  public constructor(messagesConfig: IExtractorMessagesConfig) {
    this._messages = [];
    this._associatedMessagesForAstDeclaration = new Map<AstDeclaration, ExtractorMessage[]>();
    this._messagesAddedToApiReviewFile = new Set<ExtractorMessage>();

    this._applyMessagesConfig(messagesConfig);
  }

  /**
   * Read the api-extractor.json configuration and build up the tables of routing rules.
   */
  private _applyMessagesConfig(messagesConfig: IExtractorMessagesConfig): void {
    if (messagesConfig.compilerMessageReporting) {
      for (const messageId of Object.getOwnPropertyNames(messagesConfig.compilerMessageReporting)) {
        const reportingRule: IReportingRule = MessageRouter._getNormalizedRule(
          messagesConfig.compilerMessageReporting[messageId]);

        if (messageId === 'default') {
          this._compilerDefaultRule = reportingRule;
        } else if (!/^TS[0-9]+$/.test(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.compilerMessageReporting table contains`
            + ` an invalid entry "${messageId}". The identifier format is "TS" followed by an integer.`);
        } else {
          this._reportingRuleByMessageId.set(messageId, reportingRule);
        }
      }
    }

    if (messagesConfig.extractorMessageReporting) {
      for (const messageId of Object.getOwnPropertyNames(messagesConfig.extractorMessageReporting)) {
        const reportingRule: IReportingRule = MessageRouter._getNormalizedRule(
          messagesConfig.extractorMessageReporting[messageId]);

        if (messageId === 'default') {
          this._extractorDefaultRule = reportingRule;
        } else if (!/^ae-/.test(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.extractorMessageReporting table contains`
            + ` an invalid entry "${messageId}".  The name should begin with the "ae-" prefix.`);
        } else if (allExtractorMessageIds.has(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.extractorMessageReporting table contains`
            + ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`);
        } else {
          this._reportingRuleByMessageId.set(messageId, reportingRule);
        }
      }
    }

    if (messagesConfig.tsdocMessageReporting) {
      for (const messageId of Object.getOwnPropertyNames(messagesConfig.tsdocMessageReporting)) {
        const reportingRule: IReportingRule = MessageRouter._getNormalizedRule(
          messagesConfig.tsdocMessageReporting[messageId]);

        if (messageId === 'default') {
          this._tsdocDefaultRule = reportingRule;
        } else if (!/^tsdoc-/.test(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.tsdocMessageReporting table contains`
            + ` an invalid entry "${messageId}".  The name should begin with the "tsdoc-" prefix.`);
        } else if (!AedocDefinitions.tsdocConfiguration.isKnownMessageId(messageId)) {
          throw new Error(`Error in API Extractor config: The messages.tsdocMessageReporting table contains`
            + ` an unrecognized identifier "${messageId}".  Is it spelled correctly?`);
        } else {
          this._reportingRuleByMessageId.set(messageId, reportingRule);
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

    let astDeclaration: AstDeclaration;
    if (astDeclarationOrSymbol instanceof AstDeclaration) {
      astDeclaration = astDeclarationOrSymbol;
    } else {
      astDeclaration = astDeclarationOrSymbol.astDeclarations[0];
    }

    const extractorMessage: ExtractorMessage = this.addAnalyzerIssueForPosition(
      messageId, messageText, astDeclaration.declaration.getSourceFile(),
      astDeclaration.declaration.pos);

    this._associateMessageWithAstDeclaration(extractorMessage, astDeclaration);
  }

  /**
   * Add all messages produced from an invocation of the TSDoc parser, assuming they refer to
   * code in the specified source file.
   */
  public addTsdocMessages(parserContext: tsdoc.ParserContext, sourceFile: ts.SourceFile,
    astDeclaration?: AstDeclaration): void {

    for (const message of parserContext.log.messages) {
      const lineAndCharacter: ts.LineAndCharacter = sourceFile.getLineAndCharacterOfPosition(
        message.textRange.pos);

      const extractorMessage: ExtractorMessage = new ExtractorMessage({
        category: ExtractorMessageCategory.TSDoc,
        messageId: message.messageId,
        text: message.unformattedText,
        sourceFilePath: sourceFile.fileName,
        sourceFileLine: lineAndCharacter.line,
        sourceFileColumn: lineAndCharacter.character
      });

      if (astDeclaration) {
        this._associateMessageWithAstDeclaration(extractorMessage, astDeclaration);
      }

      this._messages.push(extractorMessage);
    }
  }

  /**
   * Record this message in  _associatedMessagesForAstDeclaration
   */
  private _associateMessageWithAstDeclaration(extractorMessage: ExtractorMessage,
    astDeclaration: AstDeclaration): void {

    let associatedMessages: ExtractorMessage[] | undefined
      = this._associatedMessagesForAstDeclaration.get(astDeclaration);

    if (!associatedMessages) {
      associatedMessages = [];
      this._associatedMessagesForAstDeclaration.set(astDeclaration, associatedMessages);
    }
    associatedMessages.push(extractorMessage);
  }

  /**
   * Add a message for a location in an arbitrary source file.
   */
  public addAnalyzerIssueForPosition(messageId: ExtractorMessageId, messageText: string,
    sourceFile: ts.SourceFile, pos: number): ExtractorMessage {

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

    const extractorMessage: ExtractorMessage = new ExtractorMessage(options);
    this._messages.push(extractorMessage);
    return extractorMessage;
  }

  /**
   * This is used when writing the API review file.  It looks up any messages that were configured to get emitted
   * in the API review file and returns them.  It also records that they were emitted, which suppresses them from
   * being shown on the console.
   */
  public fetchAssociatedMessagesForReviewFile(astDeclaration: AstDeclaration): ExtractorMessage[] {
    const messagesForApiReviewFile: ExtractorMessage[] = [];

    const associatedMessages: ExtractorMessage[] = this._associatedMessagesForAstDeclaration.get(astDeclaration) || [];
    for (const associatedMessage of associatedMessages) {

      // Make sure we didn't already report this message for some reason
      if (!this._messagesAddedToApiReviewFile.has(associatedMessage)) {

        // Is this message type configured to go in the API review file?
        const reportingRule: IReportingRule = this._getRuleForMessage(associatedMessage);
        if (reportingRule.addToApiReviewFile) {

          // Include it in the result, and record that it went to the API review file
          messagesForApiReviewFile.push(associatedMessage);
          this._messagesAddedToApiReviewFile.add(associatedMessage);
        }
      }

    }

    this._sortMessagesForOutput(messagesForApiReviewFile);
    return messagesForApiReviewFile;
  }

  /**
   * This returns all remaining messages that were flagged with `addToApiReviewFile`, but which were not
   * retreieved using `fetchAssociatedMessagesForReviewFile()`.
   */
  public fetchUnassociatedMessagesForReviewFile(): ExtractorMessage[] {
    const messagesForApiReviewFile: ExtractorMessage[] = [];

    for (const unassociatedMessage of this.messages) {

      // Make sure we didn't already report this message for some reason
      if (!this._messagesAddedToApiReviewFile.has(unassociatedMessage)) {

        // Is this message type configured to go in the API review file?
        const reportingRule: IReportingRule = this._getRuleForMessage(unassociatedMessage);
        if (reportingRule.addToApiReviewFile) {

          // Include it in the result, and record that it went to the API review file
          messagesForApiReviewFile.push(unassociatedMessage);
          this._messagesAddedToApiReviewFile.add(unassociatedMessage);
        }
      }

    }

    this._sortMessagesForOutput(messagesForApiReviewFile);
    return messagesForApiReviewFile;
  }

  /**
   * For a given message, determine the IReportingRule based on the rule tables.
   */
  private _getRuleForMessage(message: ExtractorMessage): IReportingRule {
    const reportingRule: IReportingRule | undefined = this._reportingRuleByMessageId.get(message.messageId);
    if (reportingRule) {
      return reportingRule;
    }
    switch (message.category) {
      case ExtractorMessageCategory.Compiler:
        return this._compilerDefaultRule;
      case ExtractorMessageCategory.Extractor:
        return this._extractorDefaultRule;
      case ExtractorMessageCategory.TSDoc:
        return this._tsdocDefaultRule;
    }
  }

  /**
   * Sorts an array of messages according to a reasonable ordering
   */
  private _sortMessagesForOutput(messages: ExtractorMessage[]): void {
    // Sort by filename, then by line number
    Sort.sortBy(messages, x => (x.sourceFilePath || '') + '#' + (x.sourceFileLine || ''));
  }
}
