// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { launchClientAsync } from './launchClient';

launchClientAsync(false).catch((error: Error) => {
  process.stderr.write(`rush-client: ${error.message}\n`);
  process.exitCode = 1;
});
