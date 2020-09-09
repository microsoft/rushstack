// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This API was introduced as a temporary measure.
 * @beta
 */
export const enum TerminalChunkKind {
  Stdout = 'O',
  Stderr = 'E'
}

/**
 * This API was introduced as a temporary measure.
 * @beta
 */
export interface ITerminalChunk {
  kind: TerminalChunkKind;
  text: string;
}
