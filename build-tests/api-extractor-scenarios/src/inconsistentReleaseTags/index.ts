// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @beta */
export interface IBeta {
  x: number;
}

/** @public */
export function publicClassReturnsBeta(): IBeta {
  return { x: 123 };
}
