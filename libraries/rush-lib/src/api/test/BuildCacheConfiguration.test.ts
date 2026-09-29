// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { BuildCacheConfiguration } from '../BuildCacheConfiguration';
import { EnvironmentConfiguration, EnvironmentVariableNames } from '../EnvironmentConfiguration';
import { RushConfiguration } from '../RushConfiguration';
import { RushSession, type CloudBuildCacheProviderFactory } from '../../pluginFramework/RushSession';
import type { ICloudBuildCacheProvider } from '../../logic/buildCache/ICloudBuildCacheProvider';

type FactoryMock = jest.Mock<
  ReturnType<CloudBuildCacheProviderFactory>,
  Parameters<CloudBuildCacheProviderFactory>
>;

const OVERRIDE_JSON_VARIABLE: string = EnvironmentVariableNames.RUSH_BUILD_CACHE_OVERRIDE_JSON;
const AZURE_CACHE_PROVIDER: string = 'azure-blob-storage';
const STORAGE_ENDPOINT: string = 'http://127.0.0.1:10000/devstoreaccount1';

describe(BuildCacheConfiguration.name, () => {
  const originalOverrideJson: string | undefined = process.env[OVERRIDE_JSON_VARIABLE];
  let rushConfiguration: RushConfiguration;
  let factory: FactoryMock;

  beforeAll(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(`${__dirname}/repo/rush-npm.json`);
  });

  beforeEach(() => {
    const cloudCacheProvider: ICloudBuildCacheProvider = {} as ICloudBuildCacheProvider;
    factory = jest.fn<ReturnType<CloudBuildCacheProviderFactory>, Parameters<CloudBuildCacheProviderFactory>>(
      () => cloudCacheProvider
    );
  });

  afterEach(() => {
    if (originalOverrideJson === undefined) {
      delete process.env[OVERRIDE_JSON_VARIABLE];
    } else {
      process.env[OVERRIDE_JSON_VARIABLE] = originalOverrideJson;
    }
    EnvironmentConfiguration.reset();
  });

  async function tryLoadAzureConfigurationAsync(
    azureBlobStorageConfiguration: Record<string, unknown>
  ): Promise<BuildCacheConfiguration | undefined> {
    process.env[OVERRIDE_JSON_VARIABLE] = JSON.stringify({
      buildCacheEnabled: true,
      cacheProvider: AZURE_CACHE_PROVIDER,
      azureBlobStorageConfiguration
    });
    EnvironmentConfiguration.reset();

    const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
    const rushSession: RushSession = new RushSession({ terminalProvider, getIsDebugMode: () => false });
    rushSession.registerCloudBuildCacheProviderFactory(AZURE_CACHE_PROVIDER, factory);

    return await BuildCacheConfiguration.tryLoadAsync(
      new Terminal(terminalProvider),
      rushConfiguration,
      rushSession
    );
  }

  it('passes azureBlobStorageConfiguration.storageEndpoint to the cloud cache provider', async () => {
    const configuration: BuildCacheConfiguration | undefined = await tryLoadAzureConfigurationAsync({
      storageAccountName: 'example',
      storageContainerName: 'build-cache',
      storageEndpoint: STORAGE_ENDPOINT
    });

    expect(configuration?.buildCacheEnabled).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0][0]).toMatchObject({
      azureBlobStorageConfiguration: { storageEndpoint: STORAGE_ENDPOINT }
    });
  });

  it('rejects a property that azureBlobStorageConfiguration does not define', async () => {
    await expect(
      tryLoadAzureConfigurationAsync({
        storageAccountName: 'example',
        storageContainerName: 'build-cache',
        storageEndpointUrl: STORAGE_ENDPOINT
      })
    ).rejects.toThrow(/must NOT have additional properties: storageEndpointUrl/);
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects a storageEndpoint that is not a URI', async () => {
    await expect(
      tryLoadAzureConfigurationAsync({
        storageAccountName: 'example',
        storageContainerName: 'build-cache',
        storageEndpoint: '127.0.0.1 port 10000'
      })
    ).rejects.toThrow(/#\/azureBlobStorageConfiguration\/storageEndpoint\s+must match format "uri"/);
    expect(factory).not.toHaveBeenCalled();
  });
});
