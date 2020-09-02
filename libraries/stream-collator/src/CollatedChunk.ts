// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @public
 */
export enum StreamKind {
  Stdout = 'O',
  Stderr = 'E'
}

/**
 * @public
 */
export interface ICollatedChunk {
  stream: StreamKind;
  text: string;
}
