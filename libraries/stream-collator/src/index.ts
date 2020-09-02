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

export { StreamCollator, IStreamCollatorOptions } from './StreamCollator';
export { CollatedWriter, CollatedWriterState } from './CollatedWriter';
export { ICollatedChunk, StreamKind } from './CollatedChunk';
export { CollatedTerminal, WriteToStreamCallback } from './CollatedTerminal';
