// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ClientOutput } from './clientOutput';
import { launchClientAsync } from './launchClient';
import { ClientInvocationTelemetry } from './ClientInvocationTelemetry';
import { findRushJsonPath } from './outputSelection';

const invocationTelemetry: ClientInvocationTelemetry | undefined = ClientInvocationTelemetry.initialize(
  findRushJsonPath(process.cwd()),
  true
);

// Until Rush runs in-process, a reader of the output that exits (for example `| head`) cancels the command instead
// of failing the process.
const output: ClientOutput = new ClientOutput();
output.guard();

launchClientAsync(true, undefined, output, invocationTelemetry).catch((error: Error) => {
  process.stderr.write(`rushx-client: ${error.message}\n`);
  process.exitCode = 1;
});
