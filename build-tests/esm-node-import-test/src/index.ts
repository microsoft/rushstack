// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * This test validates that ESM imports from @rushstack/node-core-library work correctly
 * under Node.js ESM module resolution (i.e., when the consuming project has "type": "module").
 *
 * The issue (https://github.com/microsoft/rushstack/issues/5644) is that when the package exports
 * map has an "import" condition pointing to lib-esm/ files that contain extensionless imports
 * (e.g., `from './api/Foo'` without `.js`), Node.js ESM resolution fails with ERR_MODULE_NOT_FOUND.
 *
 * The fix is to add a "node" condition before "import" that directs Node.js to use CJS,
 * while bundlers still get the ESM version via the "import" condition.
 */

import { Path } from '@rushstack/node-core-library';

// If this line runs without ERR_MODULE_NOT_FOUND, the exports map is working correctly.
const result: string = Path.convertToSlashes('foo\\bar');
console.log('ESM import test passed! Path.convertToSlashes result:', result);
