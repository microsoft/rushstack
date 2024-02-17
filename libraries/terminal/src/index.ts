// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This library implements a system for processing human readable text that
 * will be output by console applications.
 *
 * @remarks
 * See the {@link TerminalWritable} documentation for an overview of the major concepts.
 *
 * @packageDocumentation
 */

export { ICallbackWritableOptions, CallbackWritable } from './CallbackWritable';
export { IDiscardStdoutTransformOptions, DiscardStdoutTransform } from './DiscardStdoutTransform';
export { TerminalChunkKind, ITerminalChunk } from './ITerminalChunk';
export { MockWritable } from './MockWritable';
export {
  INormalizeNewlinesTextRewriterOptions,
  NormalizeNewlinesTextRewriter
} from './NormalizeNewlinesTextRewriter';
export { DEFAULT_CONSOLE_WIDTH, PrintUtilities } from './PrintUtilities';
export { RemoveColorsTextRewriter } from './RemoveColorsTextRewriter';
export { ISplitterTransformOptions, SplitterTransform } from './SplitterTransform';
export { IStdioLineTransformOptions, StderrLineTransform } from './StdioLineTransform';
export { IStdioSummarizerOptions, StdioSummarizer } from './StdioSummarizer';
export { StdioWritable } from './StdioWritable';
export { ITerminalTransformOptions, TerminalTransform } from './TerminalTransform';
export { ITerminalWritableOptions, TerminalWritable } from './TerminalWritable';
export { TextRewriterState, TextRewriter } from './TextRewriter';
export { ITextRewriterTransformOptions, TextRewriterTransform } from './TextRewriterTransform';
export { AnsiEscape, IAnsiEscapeConvertForTestsOptions } from './AnsiEscape';
export { ITerminal, TerminalWriteParameters, ITerminalWriteOptions } from './ITerminal';
export { Terminal } from './Terminal';
export { Colorize } from './Colorize';
export { ITerminalProvider, TerminalProviderSeverity } from './ITerminalProvider';
export { ConsoleTerminalProvider, IConsoleTerminalProviderOptions } from './ConsoleTerminalProvider';
export { StringBufferTerminalProvider, IStringBufferOutputOptions } from './StringBufferTerminalProvider';
export {
  PrefixProxyTerminalProvider,
  IPrefixProxyTerminalProviderOptions,
  IDynamicPrefixProxyTerminalProviderOptions,
  IPrefixProxyTerminalProviderOptionsBase,
  IStaticPrefixProxyTerminalProviderOptions
} from './PrefixProxyTerminalProvider';
export { TerminalStreamWritable, ITerminalStreamWritableOptions } from './TerminalStreamWritable';
