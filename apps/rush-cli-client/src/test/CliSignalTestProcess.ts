// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

// Windows kill('SIGINT') terminates a process without running its signal handlers.
process.once('message', (message: unknown) => {
  if (message !== 'SIGINT' || !process.emit('SIGINT')) {
    throw new Error('Expected SIGINT with an installed CLI signal handler.');
  }
  process.disconnect!();
});
process.argv[1] = path.resolve(__dirname, '../../bin/rush-client');
require(process.argv[1]);
