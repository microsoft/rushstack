// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AzureEnvironmentNames, AzureStorageBuildCacheProvider } from '../AzureStorageBuildCacheProvider';

describe('AzureStorageBuildCacheProvider', () => {
  it('Uses a correct list of Azure authority hosts', async () => {
    await expect(
      () =>
        new AzureStorageBuildCacheProvider({
          storageAccountName: 'storage-account',
          storageContainerName: 'container-name',
          azureEnvironment: 'INCORRECT_AZURE_ENVIRONMENT' as AzureEnvironmentNames,
          isCacheWriteAllowed: false
        })
    ).toThrowErrorMatchingSnapshot();
  });
});
