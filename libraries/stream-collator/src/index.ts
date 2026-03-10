// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This library enables a tool to display live console output from multiple concurrent processes,
 * while ensuring that their output does not get jumbled together.
 *
 * @remarks
 *
 * For more info, please see the package {@link https://www.npmjs.com/package/@rushstack/stream-collator
 * | README}.
 *
 * @packageDocumentation
 */

export { CollatedTerminal } from './CollatedTerminal.ts';
export { CollatedWriter } from './CollatedWriter.ts';
export { StreamCollator, type IStreamCollatorOptions } from './StreamCollator.ts';
