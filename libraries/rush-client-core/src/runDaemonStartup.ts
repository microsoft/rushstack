// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { runDaemonStartupAsync, type IDaemonStartupOptions } from './DaemonStartup';
import { closeInheritedFileDescriptors } from './InheritedFileDescriptors';

// The daemon would otherwise hold, for as long as it runs, what the client's caller left open without
// close-on-exec: for example a pipe that a shell waits to reach end-of-file, or a lock file.
try {
  closeInheritedFileDescriptors();
} catch (error) {
  process.stderr.write(`Unable to close inherited file descriptors: ${(error as Error).stack}\n`);
}

process.once('message', (options: IDaemonStartupOptions) => {
  process.channel?.unref();
  runDaemonStartupAsync(options).catch((error: Error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
});
