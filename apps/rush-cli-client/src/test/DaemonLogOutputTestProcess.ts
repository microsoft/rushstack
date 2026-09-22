// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DaemonLogOutput } from '../DaemonLogOutput';
import { MAX_LOG_OUTPUT_BYTES } from '../DaemonLogOutputProtocol';

if (process.platform === 'win32' && process.stdout.isTTY) {
  throw new Error('The output owner fixture requires redirected stdout.');
}

const output = new DaemonLogOutput();
void (async () => {
  try {
    for (let index: number = 0; index < 160; index++) {
      const writing: Promise<void> = output.writeAsync(Buffer.alloc(MAX_LOG_OUTPUT_BYTES));
      if (index === 0) process.send!({ workerPid: output.workerPid });
      await writing;
    }
  } finally {
    await output.closeAsync();
  }
})().catch((error: unknown) => {
  process.stderr.write(String(error));
  process.exitCode = 1;
});
