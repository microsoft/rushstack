// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as internal from './internal';
import * as internalAlias from './internal';
import { internal2, SomeClass, SomeClass2 } from './internal';

import * as internal2Alias from './internal2';
import * as internal2Alias2 from './internal2';
import { SomeClass as SomeClassAlias, SomeClass as SomeClass2Alias } from './internal2';

export {
  internal,
  internalAlias,
  internal2,
  internal2Alias,
  internal2Alias2,
  SomeClass,
  SomeClassAlias,
  SomeClass2,
  SomeClass2Alias
};
