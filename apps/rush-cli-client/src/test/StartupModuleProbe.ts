// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Preloaded with `node --require` by startupBudget.test.ts. Reports the loaded module count and the loaded
// Rush modules on one short stderr line (a large synchronous write to a pipe at exit can be truncated).
import * as fs from 'node:fs';

process.once('exit', () => {
  const modules: string[] = Object.keys(require.cache);
  const report: { count: number; rushModules: string[] } = {
    count: modules.length,
    rushModules: modules.filter((name) => /[\\/](rush-lib|rush|rush-daemon)[\\/](lib-commonjs|dist)[\\/]/.test(name))
  };
  fs.writeSync(2, `\nrush-client-startup-modules:${JSON.stringify(report)}\n`);
});