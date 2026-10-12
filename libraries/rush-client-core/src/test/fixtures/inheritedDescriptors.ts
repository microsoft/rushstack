// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'node:fs';

import { closeInheritedFileDescriptors } from '../../InheritedFileDescriptors';

// Node opens it close-on-exec, like every descriptor that it opens itself.
const ownFd: number = fs.openSync(process.argv[2], 'w');

process.once('message', () => {
  const closed: number[] | undefined = closeInheritedFileDescriptors();
  fs.writeSync(ownFd, 'still open');
  process.send!({ closed });
  // The test inspects this process before it lets it exit.
  process.once('message', () => {
    fs.closeSync(ownFd);
    process.disconnect();
  });
});
process.send!({ ownFd });
