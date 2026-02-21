// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IRushPlugin, RushSession, RushConfiguration, ILogger } from '@rushstack/rush-sdk';

import type { AzureEnvironmentName, LoginFlowType } from './AzureAuthenticationBase.ts';

const PLUGIN_NAME: 'AzureInteractiveAuthPlugin' = 'AzureInteractiveAuthPlugin';

/**
 * @public
 */
export interface IAzureInteractiveAuthOptions {
  /**
   * The name of the the Azure storage account to authenticate to.
   */
  readonly storageAccountName: string;

  /**
   * The name of the container in the Azure storage account to authenticate to.
   */
  readonly storageContainerName: string;

  /**
   * The Azure environment the storage account exists in. Defaults to AzureCloud.
   */
  readonly azureEnvironment?: AzureEnvironmentName;

  /**
   * Login flow to use for interactive authentication.
   * @defaultValue 'AdoCodespacesAuth' if on GitHub Codespaces, 'InteractiveBrowser' otherwise
   */
  readonly loginFlow?: LoginFlowType;

  /**
   * If specified and a credential exists that will be valid for at least this many minutes from the time
   * of execution, no action will be taken.
   */
  readonly minimumValidityInMinutes?: number;

  /**
   * The set of Rush global commands before which credentials should be updated.
   */
  readonly globalCommands?: string[];

  /**
   * The set of Rush phased commands before which credentials should be updated.
   */
  readonly phasedCommands?: string[];
}

/**
 * This plugin is for performing interactive authentication to an arbitrary Azure blob storage account.
 * It is meant to be used for scenarios where custom commands may interact with Azure blob storage beyond
 * the scope of the build cache (for build cache, use the RushAzureStorageBuildCachePlugin).
 *
 * However, since the authentication has the same dependencies, if the repository already uses the build
 * cache plugin, the additional functionality for authentication can be provided at minimal cost.
 *
 * @public
 */
export default class RushAzureInteractieAuthPlugin implements IRushPlugin {
  private readonly _options: IAzureInteractiveAuthOptions | undefined;

  public readonly pluginName: 'AzureInteractiveAuthPlugin' = PLUGIN_NAME;

  public constructor(options: IAzureInteractiveAuthOptions | undefined) {
    this._options = options;
  }

  public apply(rushSession: RushSession, rushConfig: RushConfiguration): void {
    const options: IAzureInteractiveAuthOptions | undefined = this._options;

    if (!options) {
      // Plugin is not enabled.
      return;
    }

    const { globalCommands, phasedCommands } = options;

    const { hooks } = rushSession;

    const handler: () => Promise<void> = async () => {
      const { AzureStorageAuthentication } = await import('./AzureStorageAuthentication.ts');
      const {
        storageAccountName,
        storageContainerName,
        azureEnvironment = 'AzurePublicCloud',
        minimumValidityInMinutes,
        loginFlow = process.env.CODESPACES ? 'AdoCodespacesAuth' : 'InteractiveBrowser'
      } = options;

      const logger: ILogger = rushSession.getLogger(PLUGIN_NAME);
      logger.terminal.writeLine(
        `Authenticating to Azure container "${storageContainerName}" on account "${storageAccountName}" in environment "${azureEnvironment}".`
      );

      let minimumExpiry: Date | undefined;
      if (typeof minimumValidityInMinutes === 'number') {
        minimumExpiry = new Date(Date.now() + minimumValidityInMinutes * 60 * 1000);
      }

      await new AzureStorageAuthentication({
        storageAccountName: storageAccountName,
        storageContainerName: storageContainerName,
        azureEnvironment: azureEnvironment,
        isCacheWriteAllowed: true,
        loginFlow: loginFlow
      }).updateCachedCredentialInteractiveAsync(logger.terminal, minimumExpiry);
    };

    if (globalCommands) {
      for (const commandName of globalCommands) {
        hooks.runGlobalCustomCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
      }
    }

    if (phasedCommands) {
      for (const commandName of phasedCommands) {
        hooks.runPhasedCommand.for(commandName).tapPromise(PLUGIN_NAME, handler);
      }
    }
  }
}
