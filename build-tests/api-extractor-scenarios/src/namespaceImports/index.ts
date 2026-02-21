// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as i1 from './intermediate1.ts';
import * as i2 from './intermediate2.ts';

export { i1, i2 };

/** @public */
export function someFunction(): i1.internal.SomeClass {
  return new i1.internal.SomeClass();
}
