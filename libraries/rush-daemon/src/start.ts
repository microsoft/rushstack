#!/usr/bin/env node

// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ignoreClosedReader, launchRushDaemonAsync } from './RushDaemonCommandLine';

process.stdout.on('error', ignoreClosedReader);
process.stderr.on('error', ignoreClosedReader);

launchRushDaemonAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
