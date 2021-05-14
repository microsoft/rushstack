// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/** @beta */
export interface IBeta {
  x: number;
}

/**
 * It's okay for an "alpha" function to reference a "beta" symbol,
 * because "beta" is more public than "alpha".
 * @alpha
 */
export function alphaFunctionReturnsBeta(): IBeta {
  return { x: 123 };
}

/**
 * It's not okay for a "public" function to reference a "beta" symbol,
 * because "beta" is less public than "public".
 * @public
 */
export function publicFunctionReturnsBeta(): IBeta {
  return { x: 123 };
}
