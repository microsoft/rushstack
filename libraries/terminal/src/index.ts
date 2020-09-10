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

export * from './CallbackWritable';
export * from './DiscardStdoutTransform';
export * from './ITerminalChunk';
export * from './MockWritable';
export * from './NormalizeNewlinesTextRewriter';
export * from './RemoveColorsTextRewriter';
export * from './SplitterTransform';
export * from './StdioLineTransform';
export * from './StdioSummarizer';
export * from './StdioWritable';
export * from './TerminalTransform';
export * from './TerminalWritable';
export * from './TextRewriter';
export * from './TextRewriterTransform';
