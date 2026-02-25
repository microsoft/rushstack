// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Promise as MyPromise } from './localFile.ts';

/**
 * @public
 */
export function ambientNameConflict(p1: Promise<void>, p2: MyPromise<void>): void {
  // p1 is using the ambient Promise from the compiler's runtime
  // p2 is using the declaration from localFile, which happens to use the same name "Promise"
}
