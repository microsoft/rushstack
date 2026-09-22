// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';
import * as path from 'node:path';

process.once('message', (message: unknown) => {
  if (message !== 'SIGINT' || !process.emit('SIGINT')) {
    throw new Error('Expected SIGINT with an installed log-follow signal handler.');
  }
  fs.writeFileSync(path.join(process.cwd(), 'log-follow-signal.json'), '{"handlerDelivered":true}');
  process.disconnect!();
});
process.argv[1] = path.resolve(__dirname, '../../bin/rush-client');
require(process.argv[1]);
