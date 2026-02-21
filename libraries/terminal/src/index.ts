// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

/**
 * This library implements a system for processing human readable text that
 * will be output by console applications.
 *
 * @remarks
 * See the {@link TerminalWritable} documentation for an overview of the major concepts.
 *
 * @packageDocumentation
 */

export { type ICallbackWritableOptions, CallbackWritable } from './CallbackWritable.ts';
export { type IDiscardStdoutTransformOptions, DiscardStdoutTransform } from './DiscardStdoutTransform.ts';
export { TerminalChunkKind, type ITerminalChunk } from './ITerminalChunk.ts';
export { MockWritable } from './MockWritable.ts';
export {
  type INormalizeNewlinesTextRewriterOptions,
  NormalizeNewlinesTextRewriter
} from './NormalizeNewlinesTextRewriter.ts';
export { DEFAULT_CONSOLE_WIDTH, PrintUtilities } from './PrintUtilities.ts';
export { RemoveColorsTextRewriter } from './RemoveColorsTextRewriter.ts';
export { type ISplitterTransformOptions, SplitterTransform } from './SplitterTransform.ts';
export { type IStdioLineTransformOptions, StderrLineTransform } from './StdioLineTransform.ts';
export { type IStdioSummarizerOptions, StdioSummarizer } from './StdioSummarizer.ts';
export { StdioWritable } from './StdioWritable.ts';
export { type ITerminalTransformOptions, TerminalTransform } from './TerminalTransform.ts';
export { type ITerminalWritableOptions, TerminalWritable } from './TerminalWritable.ts';
export { type TextRewriterState, TextRewriter } from './TextRewriter.ts';
export { type ITextRewriterTransformOptions, TextRewriterTransform } from './TextRewriterTransform.ts';
export { AnsiEscape, type IAnsiEscapeConvertForTestsOptions } from './AnsiEscape.ts';
export type { ITerminal, TerminalWriteParameters, ITerminalWriteOptions } from './ITerminal.ts';
export { Terminal } from './Terminal.ts';
export { Colorize } from './Colorize.ts';
export { type ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider.ts';
export { ConsoleTerminalProvider, type IConsoleTerminalProviderOptions } from './ConsoleTerminalProvider.ts';
export {
  StringBufferTerminalProvider,
  type IStringBufferOutputOptions,
  type IAllStringBufferOutput,
  type IOutputChunk,
  type IStringBufferOutputChunksOptions,
  type TerminalProviderSeverityName
} from './StringBufferTerminalProvider.ts';
export {
  PrefixProxyTerminalProvider,
  type IPrefixProxyTerminalProviderOptions,
  type IDynamicPrefixProxyTerminalProviderOptions,
  type IPrefixProxyTerminalProviderOptionsBase,
  type IStaticPrefixProxyTerminalProviderOptions
} from './PrefixProxyTerminalProvider.ts';
export { NoOpTerminalProvider } from './NoOpTerminalProvider.ts';
export { TerminalStreamWritable, type ITerminalStreamWritableOptions } from './TerminalStreamWritable.ts';
export { ProblemCollector, type IProblemCollectorOptions } from './ProblemCollector.ts';
export type { IProblemCollector } from './IProblemCollector.ts';
