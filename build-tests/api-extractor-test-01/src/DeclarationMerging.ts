// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * @alpha
 */
export interface IMergedInterfaceReferencee {
}

/**
 * IMergedInterface instance 1.
 * @alpha
 */
export interface IMergedInterface {
  type: string;
  reference: IMergedInterfaceReferencee;
}

/**
 * IMergedInterface instance 2.
 * @alpha
 */
export interface IMergedInterface {
  type: string;
  reference: IMergedInterfaceReferencee;
}
