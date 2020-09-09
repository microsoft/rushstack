// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This library enables a tool to display live console output from multiple asynchronous processes,
 * while ensuring that their output does not get jumbled together.
 *
 * @remarks
 *
 * For more info, please see the package {@link https://www.npmjs.com/package/@rushstack/stream-collator
 * | README}.
 *
 * @packageDocumentation
 */

export * from './CharMatcher';
export * from './CallbackWritable';
export * from './CharMatcherTransform';
export * from './CollatedTerminal';
export * from './CollatedWriter';
export * from './DiscardStdoutTransform';
export * from './ITerminalChunk';
export * from './MockWritable';
export * from './NormalizeNewlinesCharMatcher';
export * from './RemoveColorsCharMatcher';
export * from './SplitterTransform';
export * from './StdioLineTransform';
export * from './StdioSummarizer';
export * from './StdioWritable';
export * from './StreamCollator';
export * from './TerminalTransform';
export * from './TerminalWritable';
