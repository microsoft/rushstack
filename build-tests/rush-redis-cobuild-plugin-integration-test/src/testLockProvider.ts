// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  RedisCobuildLockProvider,
  IRedisCobuildLockProviderOptions
} from '@rushstack/rush-redis-cobuild-plugin';
import { ConsoleTerminalProvider } from '@rushstack/node-core-library';
import { OperationStatus, ICobuildContext, RushSession } from '@microsoft/rush-lib';

const options: IRedisCobuildLockProviderOptions = {
  url: 'redis://localhost:6379',
  password: 'redis123'
};

const rushSession: RushSession = new RushSession({
  terminalProvider: new ConsoleTerminalProvider(),
  getIsDebugMode: () => true
});

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockProvider: RedisCobuildLockProvider = new RedisCobuildLockProvider(options, rushSession as any);
  await lockProvider.connectAsync();
  const context: ICobuildContext = {
    contextId: 'context_id',
    cacheId: 'cache_id',
    lockKey: 'lock_key',
    lockExpireTimeInSeconds: 30,
    completedStateKey: 'completed_state_key',
    clusterId: 'cluster_id',
    runnerId: 'runner_id',
    packageName: 'package_name',
    phaseName: 'phase_name'
  };
  await lockProvider.acquireLockAsync(context);
  await lockProvider.renewLockAsync(context);
  await lockProvider.setCompletedStateAsync(context, {
    status: OperationStatus.Success,
    cacheId: 'cache_id'
  });
  const completedState = await lockProvider.getCompletedStateAsync(context);
  console.log('Completed state: ', completedState);
  await lockProvider.disconnectAsync();
}

process.exitCode = 1;

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error(err);
  })
  .finally(() => {
    if (process.exitCode !== undefined) {
      process.exit(process.exitCode);
    }
  });
