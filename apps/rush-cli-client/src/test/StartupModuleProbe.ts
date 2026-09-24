// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Preloaded with `node --require` by startupBudget.test.ts. Reports every module the client loaded.
import * as fs from 'node:fs';

export const STARTUP_MODULES_MARKER: string = 'rush-client-startup-modules:';

process.once('exit', () => {
  fs.writeSync(2, `\n${STARTUP_MODULES_MARKER}${JSON.stringify(Object.keys(require.cache))}\n`);
});
