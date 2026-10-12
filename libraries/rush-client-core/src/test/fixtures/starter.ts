// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { connectOrStartDaemonAsync, type IConnectOrStartDaemonOptions } from '../../connectOrStartDaemon';

async function mainAsync(): Promise<void> {
  const options: IConnectOrStartDaemonOptions = JSON.parse(process.argv[2]);
  const client = await connectOrStartDaemonAsync(options);
  await client.closeAsync();
}

mainAsync().catch((error: Error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
