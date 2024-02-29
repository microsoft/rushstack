// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Lib1Class } from 'api-extractor-lib1-test/lib/index';
import { Lib2Class } from 'api-extractor-lib2-test/lib/index';
import { Lib3Class } from 'api-extractor-lib3-test/lib/index';
import { Lib4Enum } from 'api-extractor-lib4-test/lib/index';
import { lib5Function } from 'api-extractor-lib5-test/lib/index';

/** @public */
export function f(arg1: Lib1Class, arg2: Lib2Class, arg3: Lib3Class, arg4: Lib4Enum): void {}

export { Lib1Class, Lib2Class, Lib3Class, Lib4Enum, lib5Function };
