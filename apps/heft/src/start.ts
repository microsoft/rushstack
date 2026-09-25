// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Launching via lib-commonjs/start.js bypasses the version selector.  Use that for debugging Heft.

// Enable the compile cache and the module resolution cache before the rest of Heft is loaded
import './bootstrap/enableStartupCaches';
import { HeftCommandLineParser } from './cli/HeftCommandLineParser';

const parser: HeftCommandLineParser = new HeftCommandLineParser();

parser
  .executeAsync()
  .then(() => {
    // This should be removed when the issue with aria not tearing down
    process.exit(process.exitCode === undefined ? 0 : process.exitCode);
  })
  .catch((error) => {
    parser.globalTerminal.writeErrorLine(error.toString());
    process.exit(1);
  });
