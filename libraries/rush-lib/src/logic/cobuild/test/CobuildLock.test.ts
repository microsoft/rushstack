// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CobuildLock, type ICobuildLockOptions } from '../CobuildLock.ts';

import type { CobuildConfiguration } from '../../../api/CobuildConfiguration.ts';
import type { OperationBuildCache } from '../../buildCache/OperationBuildCache.ts';
import type { ICobuildContext } from '../ICobuildLockProvider.ts';

describe(CobuildLock.name, () => {
  function prepareSubject(): CobuildLock {
    const cobuildLockOptions: ICobuildLockOptions = {
      cobuildConfiguration: {
        cobuildContextId: 'context_id',
        cobuildRunnerId: 'runner_id'
      } as unknown as CobuildConfiguration,
      operationBuildCache: {
        cacheId: 'cache_id'
      } as unknown as OperationBuildCache,
      cobuildClusterId: 'cluster_id',
      lockExpireTimeInSeconds: 30,
      packageName: 'package_name',
      phaseName: 'phase_name'
    };
    const subject: CobuildLock = new CobuildLock(cobuildLockOptions);
    return subject;
  }
  it('returns cobuild context', () => {
    const subject: CobuildLock = prepareSubject();
    const expected: ICobuildContext = {
      lockKey: 'cobuild:lock:context_id:cluster_id',
      completedStateKey: 'cobuild:completed:context_id:cache_id',
      lockExpireTimeInSeconds: 30,
      contextId: 'context_id',
      cacheId: 'cache_id',
      clusterId: 'cluster_id',
      runnerId: 'runner_id',
      packageName: 'package_name',
      phaseName: 'phase_name'
    };
    expect(subject.cobuildContext).toEqual(expected);
  });
});
