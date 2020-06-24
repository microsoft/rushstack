// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftToolsCommandLineParser } from './cli/HeftToolsCommandLineParser';

const parser: HeftToolsCommandLineParser = new HeftToolsCommandLineParser();

parser
  .execute()
  .then(() => {
    process.exit(0); // This should be removed when the issue with aria not tearing down
  })
  .catch((error) => {
    parser.terminal.writeErrorLine(error);
    process.exit(1);
  });
