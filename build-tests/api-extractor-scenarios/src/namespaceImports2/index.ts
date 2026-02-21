// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as internal from './internal.ts';
import { SomeClass } from './internal.ts';

export { internal, SomeClass };

/** @public */
export function someFunction(): SomeClass {
  return new SomeClass();
}
