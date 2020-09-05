// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This API was introduced as a temporary measure.
 * @deprecated Very soon we plan to replace this with the `Terminal` API from `@rushstack/node-core-library`.
 * @public
 */
export enum StreamKind {
  Stdout = 'O',
  Stderr = 'E'
}

/**
 * This API was introduced as a temporary measure.
 * @deprecated Very soon we plan to replace this with the `Terminal` API from `@rushstack/node-core-library`.
 * @public
 */
export interface ICollatedChunk {
  stream: StreamKind;
  text: string;
}
