// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { runDaemonStartupAsync, type IDaemonStartupOptions } from './DaemonStartup';

process.once('message', (options: IDaemonStartupOptions) => {
  process.channel?.unref();
  runDaemonStartupAsync(options).catch((error: Error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
});
