// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DeviceCodeCredential, type DeviceCodeInfo, AzureAuthorityHosts } from '@azure/identity';
import type { ITerminal } from '@rushstack/node-core-library';
import { CredentialCache, type ICredentialCacheEntry } from '@rushstack/rush-sdk';
import { PrintUtilities } from '@rushstack/terminal';

/**
 * @public
 */
export type AzureEnvironmentName = keyof typeof AzureAuthorityHosts;

/**
 * @public
 */
export interface IAzureAuthenticationBaseOptions {
  azureEnvironment?: AzureEnvironmentName;
}

/**
 * @public
 */ export interface ICredentialResult {
  credentialString: string;
  expiresOn: Date | undefined;
}

/**
 * @public
 */
export abstract class AzureAuthenticationBase {
  protected abstract readonly _credentialNameForCache: string;
  protected abstract readonly _credentialKindForLogging: string;
  protected abstract readonly _credentialUpdateCommandForLogging: string | undefined;

  protected readonly _azureEnvironment: AzureEnvironmentName;

  private __credentialCacheId: string | undefined;
  private get _credentialCacheId(): string {
    if (!this.__credentialCacheId) {
      const cacheIdParts: string[] = [
        this._credentialNameForCache,
        this._azureEnvironment,
        ...this._getCacheIdParts()
      ];

      this.__credentialCacheId = cacheIdParts.join('|');
    }

    return this.__credentialCacheId;
  }

  public constructor(options: IAzureAuthenticationBaseOptions) {
    this._azureEnvironment = options.azureEnvironment || 'AzurePublicCloud';
  }

  public async updateCachedCredentialAsync(terminal: ITerminal, credential: string): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.setCacheEntry(this._credentialCacheId, {
          credential
        });
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  /**
   * Launches an interactive flow to renew a cached credential.
   *
   * @param terminal - The terminal to log output to
   * @param onlyIfExistingCredentialExpiresAfter - If specified, and a cached credential exists that is still valid
   * after the date specified, no action will be taken.
   */
  public async updateCachedCredentialInteractiveAsync(
    terminal: ITerminal,
    onlyIfExistingCredentialExpiresAfter?: Date
  ): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        if (onlyIfExistingCredentialExpiresAfter) {
          const existingCredentialExpiration: Date | undefined = credentialsCache.tryGetCacheEntry(
            this._credentialCacheId
          )?.expires;
          if (
            existingCredentialExpiration &&
            existingCredentialExpiration > onlyIfExistingCredentialExpiresAfter
          ) {
            return;
          }
        }

        const credential: ICredentialResult = await this._getCredentialAsync(terminal);
        credentialsCache.setCacheEntry(this._credentialCacheId, {
          credential: credential.credentialString,
          expires: credential.expiresOn
        });
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async deleteCachedCredentialsAsync(terminal: ITerminal): Promise<void> {
    await CredentialCache.usingAsync(
      {
        supportEditing: true
      },
      async (credentialsCache: CredentialCache) => {
        credentialsCache.deleteCacheEntry(this._credentialCacheId);
        await credentialsCache.saveIfModifiedAsync();
      }
    );
  }

  public async tryGetCachedCredentialAsync(doNotThrowIfExpired?: boolean): Promise<string | undefined> {
    let cacheEntry: ICredentialCacheEntry | undefined;
    await CredentialCache.usingAsync(
      {
        supportEditing: false
      },
      (credentialsCache: CredentialCache) => {
        cacheEntry = credentialsCache.tryGetCacheEntry(this._credentialCacheId);
      }
    );

    const expirationTime: number | undefined = cacheEntry?.expires?.getTime();
    if (expirationTime && expirationTime < Date.now()) {
      if (!doNotThrowIfExpired) {
        let errorMessage: string = `Cached Azure ${this._credentialKindForLogging} credentials have expired.`;
        if (this._credentialUpdateCommandForLogging) {
          errorMessage += ` Update the credentials by running "${this._credentialUpdateCommandForLogging}".`;
        }

        throw new Error(errorMessage);
      } else {
        return undefined;
      }
    } else {
      return cacheEntry?.credential;
    }
  }

  /**
   * Get parts of the cache ID that are specific to the credential type. Note that this should
   * not contain the Azure environment or the {@link AzureAuthenticationBase._credentialNameForCache}
   * value, as those are added automatically.
   */
  protected abstract _getCacheIdParts(): string[];

  protected abstract _getCredentialFromDeviceCodeAsync(
    terminal: ITerminal,
    deviceCodeCredential: DeviceCodeCredential
  ): Promise<ICredentialResult>;

  private async _getCredentialAsync(terminal: ITerminal): Promise<ICredentialResult> {
    const authorityHost: string | undefined = AzureAuthorityHosts[this._azureEnvironment];
    if (!authorityHost) {
      throw new Error(`Unexpected Azure environment: ${this._azureEnvironment}`);
    }

    const deviceCodeCredential: DeviceCodeCredential = new DeviceCodeCredential({
      authorityHost: authorityHost,
      userPromptCallback: (deviceCodeInfo: DeviceCodeInfo) => {
        PrintUtilities.printMessageInBox(deviceCodeInfo.message, terminal);
      }
    });

    return await this._getCredentialFromDeviceCodeAsync(terminal, deviceCodeCredential);
  }
}
