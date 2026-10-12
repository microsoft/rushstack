// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ClientOutput } from './clientOutput';
import { launchClientAsync } from './launchClient';

// Until Rush runs in-process, a reader of the output that exits (for example `| head`) cancels the command instead
// of failing the process.
const output: ClientOutput = new ClientOutput();
output.guard();

launchClientAsync(true, undefined, output).catch((error: Error) => {
  process.stderr.write(`rushx-client: ${error.message}\n`);
  process.exitCode = 1;
});
